---
type: runbook
owner: backend
status: current
updated: 2026-10-04
tags: [providers, scheduler]
---

# Troubleshoot provider timeouts

Use this runbook when bunq or Yahoo calls stall or a scheduled sync misses its interval.

## Timeout limits

| Work                                       | Limit                      | Behavior                                                     |
| :----------------------------------------- | :------------------------- | :----------------------------------------------------------- |
| Bunq HTTP attempt, including response body | 15 seconds                 | Abort the request and reject the result                      |
| Bunq rate-limit retry                      | One retry after 30 seconds | Cancel the wait if the scheduled deadline expires            |
| Bunq payment history                       | 100 pages per account      | Import a bounded batch and persist its older-page checkpoint |
| Yahoo lookup or quote call                 | 15 seconds                 | Abort provider fetches and discard late results              |
| Coordinated scheduled run                  | 5 minutes                  | Cancel provider work and reject new database queries         |

Ordinary Yahoo quote failures retain the existing empty-quote response.
Timeouts and aborts reject the run so the next scheduler poll can retry. Lookup failures return the existing API error response.

## Diagnose the failure

1. Check backend logs for the scheduler name and timeout error.
2. Check the provider's availability and your connection settings.
3. Wait for the next scheduler poll, within one minute after cleanup completes.

A timed-out run does not record a successful heartbeat. The next poll can retry immediately unless another process holds the advisory lock.

## Verify recovery

Bunq stores each account's next older-page URL in `bunq_payment_progress` after successful imports.
Failed imports keep the previous checkpoint for an idempotent replay.
Completed accounts wait for other accounts before the shared timestamp advances.
The timestamp uses the earliest scan start, so payments arriving during backfill remain eligible for the next sync.

Check the next cycle's success log and updated sync timestamp. For payment history, verify that the successful sync advances its cursor.

## Cancellation boundaries

Yahoo calls reuse a healthy client for cookie, crumb, and queue state.
After a timeout, the client discards that instance before the next call.
The wrapper discards late results even if the library ignores cancellation.
Provider continuations cannot write application data.

Scheduled work shares a cancellation scope through asynchronous context.
Database queries check the scope before execution, including queries in transactions and error handlers.
On expiry, active queries receive cancellation and application work unwinds before the scheduler unlocks and releases its connection.

Cleanup has a 30-second grace period after the five-minute deadline.
Each job uses an isolated database pool with a 15-second server statement timeout.
If work still stalls, the scheduler destroys that pool instead of returning its connections for reuse.
Expired continuations cannot start queries or commit transactions.

Failure-status writes use a separate, bounded cleanup scope before the lease closes.
Bunq rotates the first user after each attempted sync so later users receive a turn after a failed cycle.
New scheduled operations must use the cancellation scope; an arbitrary promise cannot be safely interrupted.

## Roll back

To restore previous behavior, revert the timeout change and redeploy the backend.
This restores unbounded provider waits and payment paging.
