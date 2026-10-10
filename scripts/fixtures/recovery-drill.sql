-- Synthetic household for scripts/recovery-drill.sh, added on top of the demo seed and
-- scripts/fixtures/pg-upgrade-synthetic.sql. Invented values only. It adds what a restore must
-- keep apart: a partner with an accepted link, a joint account the demo user sees and a private
-- one they must not see, and ledgers whose size is set with `-v rows=<n>` (default 1000) for the
-- recovery time measurement. Runs as the admin role.

\if :{?rows}
\else
  \set rows 1000
\endif

insert into users (first_name, last_name, email, password_hash)
select 'Synthetic', 'Partner', 'partner@quro.local', password_hash
from users where email = 'demo@quro.local';

with link as (
  insert into partner_links (requester_id, addressee_id, status, responded_at)
  select demo.id, partner.id, 'accepted', timestamp '2026-02-01 09:00:00'
  from users demo, users partner
  where demo.email = 'demo@quro.local' and partner.email = 'partner@quro.local'
  returning id, requester_id, addressee_id
)
insert into partner_link_members (user_id, link_id)
select requester_id, id from link union all select addressee_id, id from link;

insert into savings_accounts (user_id, name, bank, balance, currency, interest_rate, account_type, is_joint)
select u.id, v.name, 'Example Bank', v.balance, 'EUR', 1.2500, 'savings', v.joint
from users u,
  (values ('Joint household', 15000.00, true), ('Partner private', 999.99, false)) as v(name, balance, joint)
where u.email = 'partner@quro.local';

insert into budget_categories (user_id, name, budgeted, spent, month, year)
select u.id, 'Groceries', 600.00, 0, 'Jan', 2026 from users u where u.email = 'demo@quro.local';

-- Ledger rows: two per budget transaction and one savings transaction each, dated over ten years.
insert into budget_transactions (user_id, category_id, description, amount, date, merchant)
select c.user_id, c.id, 'Synthetic purchase ' || n, round((n % 9973) / 100.0 + 0.01, 2),
  date '2016-01-01' + (n % 3650), 'Example Market'
from budget_categories c, generate_series(1, :rows * 2) as n
where c.name = 'Groceries';

insert into savings_transactions (user_id, account_id, type, amount, date, note)
select a.user_id, a.id, case when n % 3 = 0 then 'withdrawal' else 'deposit' end,
  case when n % 3 = 0 then -((n % 500) + 0.5) else (n % 700) + 0.25 end,
  date '2016-01-01' + (n % 3650), null
from savings_accounts a, generate_series(1, :rows) as n
where a.name = 'Everyday';
