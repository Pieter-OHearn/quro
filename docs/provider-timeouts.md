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

| Work                                       | Limit                      | Behavior                                             |
| :----------------------------------------- | :------------------------- | :--------------------------------------------------- |
| Bunq HTTP attempt, including response body | 15 seconds                 | Abort the request and reject the result              |
| Bunq rate-limit retry                      | One retry after 30 seconds | Cancel the wait if the scheduled deadline expires    |
| Bunq payment history                       | 100 pages per account      | Reject the entire fetch; do not advance its cursor   |
| Yahoo lookup or quote call                 | 15 seconds                 | Abort provider fetches and discard late results      |
| Coordinated scheduled run                  | 5 minutes                  | Cancel provider work and reject new database queries |

Yahoo quote failures retain the existing empty-quote response. Lookup failures return the existing API error response.

## Diagnose the failure

1. Check backend logs for the scheduler name and timeout error.
2. Check the provider's availability and your connection settings.
3. Wait for the next scheduler poll, within one minute after cleanup completes.

A timed-out run does not record a successful heartbeat. The next poll can retry immediately unless another process holds the advisory lock.

## Verify recovery

Check the next cycle's success log and updated sync timestamp. For payment history, verify that the successful sync advances its cursor.

## Cancellation boundaries

Each Yahoo call uses a separate client to isolate its cookie, crumb, and queue state.
The wrapper discards late results even if the library ignores cancellation.
Provider continuations cannot write application data.

Scheduled work shares a cancellation scope through asynchronous context.
Database queries check the scope before execution, including queries in transactions and error handlers.
On expiry, active queries receive cancellation and application work unwinds before the scheduler unlocks and releases its connection.

Cleanup can exceed five minutes while an active database query or transaction settles.
If database cancellation stalls, the scheduler retains its lock to prevent overlapping writes.
New scheduled operations must use the cancellation scope; an arbitrary promise cannot be safely interrupted.

## Roll back

To restore previous behavior, revert the timeout change and redeploy the backend.
This restores unbounded provider waits and payment paging.
