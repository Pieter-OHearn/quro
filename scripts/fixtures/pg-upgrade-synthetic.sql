-- Synthetic rows for scripts/rehearse-pg-upgrade.sh, added on top of the demo seed so the
-- upgrade check covers the shapes that matter: large and tiny numerics, negative balances,
-- native currencies, nulls, jsonb, dates and non-ASCII text. Invented values only.
-- Runs as the admin role against a database where the demo user already exists.

insert into savings_accounts (user_id, name, bank, balance, currency, interest_rate, account_type, is_joint, archived_at)
select u.id, v.name, v.bank, v.balance, v.currency::currency_code, v.rate, v.kind, v.joint, v.archived
from users u,
  (values
    ('Everyday', 'Example Bank', 1234567890123.45, 'EUR', 0.0125, 'current', false, null::timestamp),
    ('Overdrawn', 'Example Bank', -250.10, 'GBP', 0.0000, 'current', false, null),
    ('Dollars', 'Voorbeeld Bank', 0.01, 'USD', 4.5000, 'savings', true, null),
    ('Gamma ☂ élan', 'Example Bank', 0, 'CHF', 0.0100, 'savings', false, timestamp '2026-01-02 03:04:05')
  ) as v(name, bank, balance, currency, rate, kind, joint, archived)
where u.email = 'demo@quro.local';

insert into savings_transactions (user_id, account_id, type, amount, date, note)
select a.user_id, a.id, v.type, v.amount, v.date::date, v.note
from savings_accounts a
join (values
    ('Everyday', 'deposit', 1000.00, '2026-03-01', 'Opening ☕'),
    ('Everyday', 'withdrawal', -12.34, '2026-03-02', null),
    ('Overdrawn', 'withdrawal', -250.10, '2026-03-03', 'Fees'),
    ('Dollars', 'interest', 0.01, '2026-03-31', null)
  ) as v(account, type, amount, date, note) on v.account = a.name;

insert into pension_pots (user_id, name, provider, type, balance, currency, employee_monthly, employer_monthly, metadata)
select u.id, v.name, v.provider, v.type, v.balance, v.currency::currency_code, v.employee, v.employer, v.metadata::jsonb
from users u,
  (values
    ('Workplace pot', 'Example Pensions', 'defined_contribution', 54321.09, 'EUR', 250.00, 250.00,
      '{"plan": "A-1", "tags": ["x", "ü"], "nested": {"n": 1.50, "ok": true, "none": null}}'),
    ('Empty pot', 'Example Pensions', 'personal', 0, 'GBP', 0, 0, '{}')
  ) as v(name, provider, type, balance, currency, employee, employer, metadata)
where u.email = 'demo@quro.local';

insert into debts (user_id, name, type, lender, original_amount, remaining_balance, currency, interest_rate, monthly_payment, start_date, end_date, color, emoji, notes)
select u.id, v.name, v.type, v.lender, v.original, v.remaining, v.currency::currency_code, v.rate, v.payment,
  v.start::date, v.finish::date, '#336699', '💳', v.notes
from users u,
  (values
    ('Car loan', 'loan', 'Example Lender', 12000.00, 7400.55, 'EUR', 5.2500, 310.00, '2025-01-15', '2029-01-15', null),
    ('Open-ended card', 'credit_card', 'Voorbeeld Lender', 2000.00, 1999.99, 'USD', 19.9900, 50.00, '2024-06-01', null, 'No end date')
  ) as v(name, type, lender, original, remaining, currency, rate, payment, start, finish, notes)
where u.email = 'demo@quro.local';
