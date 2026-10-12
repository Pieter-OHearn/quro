-- Synthetic rows of the 0.7.0 upgrade fixture, loaded by generate.sh after the 0.7.0 image has
-- migrated the database and run its demo seed (one user, demo@quro.local, and seven rates).
-- Everything here is invented: example.invalid addresses, placeholder tokens, round or obviously
-- artificial amounts. The rows cover what an upgrade must carry over unchanged: money at the
-- edges of numeric(19,2), negative balances and equity, every native currency, nulls next to
-- values, jsonb, non-ASCII text, a household of two partners with joint and private rows, bank
-- provenance, sessions, and the three kinds of PDF attachment. Timestamps are literals so that
-- the dump is the same on every run.
--
-- Written for the 0.7.0 schema (migrations 0000 to 0037). Runs as the admin role in one
-- transaction. The document keys, sizes and SHA-256 values match documents.ts.

begin;

-- ── Users and the household ─────────────────────────────────────────────────

-- The demo seed's password hash; every fixture user signs in with the demo password.
insert into users (first_name, last_name, email, location, age, retirement_age, base_currency,
  number_format, password_hash, password_updated_at, created_at, jurisdiction)
select v.first_name, v.last_name, v.email, v.location, v.age, v.retirement_age,
  v.base_currency::currency_code, v.number_format, u.password_hash, v.password_updated_at::timestamp,
  v.created_at::timestamp, v.jurisdiction
from users u,
  (values
    ('Partner', 'Fixture', 'partner@example.invalid', 'Zürich ☃', 41, 66, 'GBP', 'de-DE',
      '2026-01-05 08:00:00', '2025-11-01 09:30:00', 'NL'),
    ('Solo', 'Fixture-Ñandú 測試', 'solo@example.invalid', '', 16, 17, 'AUD', 'en-US',
      null, '2025-12-24 23:59:59.999999', 'AU'),
    ('Invitee', 'Fixture', 'invitee@example.invalid', 'Example Town', 79, 80, 'CHF', 'en-US',
      null, '2026-02-01 00:00:00', 'GENERIC')
  ) as v(first_name, last_name, email, location, age, retirement_age, base_currency,
    number_format, password_updated_at, created_at, jurisdiction)
where u.email = 'demo@quro.local';

-- Demo and partner share an accepted household; solo has invited invitee (pending).
insert into partner_links (requester_id, addressee_id, status, created_at, responded_at)
select r.id, a.id, v.status::partner_link_status, v.created_at::timestamp, v.responded_at::timestamp
from (values
    ('demo@quro.local', 'partner@example.invalid', 'accepted', '2026-01-10 10:00:00', '2026-01-11 11:00:00'),
    ('solo@example.invalid', 'invitee@example.invalid', 'pending', '2026-02-02 12:00:00', null)
  ) as v(requester, addressee, status, created_at, responded_at)
join users r on r.email = v.requester
join users a on a.email = v.addressee;

insert into partner_link_members (user_id, link_id)
select requester_id, id from partner_links
union all
select addressee_id, id from partner_links;

-- Raw session tokens, as 0.7.0 stores them. Placeholders, not tokens of any running install.
insert into sessions (id, user_id, expires_at, created_at)
select v.id, u.id, v.expires_at::timestamp, v.created_at::timestamp
from (values
    ('fixture-session-token-demo-0001', 'demo@quro.local', '2099-01-01 00:00:00', '2026-03-01 08:00:00'),
    ('fixture-session-token-demo-0002-expired', 'demo@quro.local', '2026-01-01 00:00:00', '2025-12-01 08:00:00'),
    ('fixture-session-token-partner-0001', 'partner@example.invalid', '2099-01-01 00:00:00', '2026-03-02 09:15:30.123456')
  ) as v(id, email, expires_at, created_at)
join users u on u.email = v.email;

-- ── Savings: balances at the edges, every currency, joint and private ────────

insert into savings_accounts (user_id, name, bank, balance, currency, interest_rate, account_type,
  color, emoji, bunq_account_id, archived_at, is_joint, banking_entity_id, banking_entity_name,
  deposit_guarantee_scheme, banking_entity_confirmed_at, deposit_guarantee_cap, deposit_guarantee_currency)
select u.id, v.name, v.bank, v.balance, v.currency::currency_code, v.rate, v.kind, v.color, v.emoji,
  v.bunq_account_id, v.archived_at::timestamp, v.is_joint, v.entity_id, v.entity_name, v.scheme,
  v.confirmed_at::timestamp, v.cap, v.cap_currency::currency_code
from (values
    ('demo@quro.local', 'Everyday', 'Example Bank', 9999999999999.99, 'EUR', 0.0125, 'Easy Access',
      '#336699', '🏦', null, null, false, 'example-bank-eu', 'Example Bank N.V.', 'Example DGS',
      '2026-01-15 12:00:00', 100000.00, 'EUR'),
    ('demo@quro.local', 'Overdrawn', 'Example Bank', -250.10, 'GBP', 0.0000, 'Easy Access',
      null, null, null, null, false, null, null, null, null, null, null),
    ('demo@quro.local', 'Household pot', 'Voorbeeld Bank', 0.01, 'USD', 4.5000, 'Easy Access',
      null, '🏠', 'fixture-bunq-account-1', null, true, null, null, null, null, null, null),
    ('demo@quro.local', 'Gamma ☂ élan', 'Example Bank', 0, 'CHF', 0.0100, 'Term Deposit',
      '#aa0000', null, null, '2026-01-02 03:04:05', false, null, null, null, null, null, null),
    ('partner@example.invalid', 'Joint rainy day', 'Example Bank', 12345.67, 'EUR', 2.0000, 'Easy Access',
      null, null, null, null, true, null, null, null, null, null, null),
    ('partner@example.invalid', 'Private stash', 'Example Bank', 500.00, 'NZD', 3.2500, 'Term Deposit',
      null, null, null, null, false, null, null, null, null, null, null),
    ('solo@example.invalid', 'Только тест', 'Example Bank', 777.70, 'AUD', 0.0001, 'Easy Access',
      null, null, null, null, false, null, null, null, null, null, null),
    ('solo@example.invalid', 'Loonie', 'Example Bank', -0.01, 'CAD', 0.0000, 'Easy Access',
      null, null, null, null, false, null, null, null, null, null, null),
    ('invitee@example.invalid', 'Singapore', 'Example Bank', 1000000.00, 'SGD', 1.0000, 'Easy Access',
      null, null, null, null, false, null, null, null, null, 75000.00, 'SGD')
  ) as v(email, name, bank, balance, currency, rate, kind, color, emoji, bunq_account_id,
    archived_at, is_joint, entity_id, entity_name, scheme, confirmed_at, cap, cap_currency)
join users u on u.email = v.email;

insert into savings_transactions (user_id, account_id, type, amount, date, note, bunq_transaction_id)
select a.user_id, a.id, v.type, v.amount, v.date::date, v.note, v.bunq_id
from (values
    ('Everyday', 'deposit', 1000.00, '2026-03-01', 'Opening ☕', null),
    ('Everyday', 'withdrawal', -12.34, '2026-03-02', null, null),
    ('Overdrawn', 'withdrawal', -250.10, '2026-03-03', 'Fees', null),
    ('Household pot', 'deposit', 0.01, '2026-03-31', null, 'fixture-bunq-payment-1'),
    ('Household pot', 'interest', 0.00, '2026-03-31', '', null),
    ('Joint rainy day', 'deposit', 12345.67, '2024-02-29', 'Leap day 🐸', null)
  ) as v(account, type, amount, date, note, bunq_id)
join savings_accounts a on a.name = v.account;

-- ── Budget: EUR amounts with their source amounts and review flags ───────────

insert into budget_categories (user_id, name, emoji, budgeted, spent, color, month, year,
  expense_class, expense_class_confirmed, currency, currency_needs_review)
select u.id, v.name, v.emoji, v.budgeted, v.spent, v.color, v.month, v.year, v.class, v.confirmed,
  'EUR', v.review
from (values
    ('demo@quro.local', 'Groceries', '🛒', 600.00, 612.35, '#22aa55', 'Mar', 2026, 'essential', true, false),
    ('demo@quro.local', 'Fun', null, 0.00, 0.00, null, 'Mar', 2026, 'discretionary', false, true),
    ('partner@example.invalid', 'Commute', '🚲', 120.00, 119.99, null, 'Feb', 2026, 'employment_linked', true, false)
  ) as v(email, name, emoji, budgeted, spent, color, month, year, class, confirmed, review)
join users u on u.email = v.email;

insert into budget_transactions (user_id, category_id, description, amount, date, merchant,
  bunq_transaction_id, bunq_mcc, bunq_payment_type, counterparty_iban, source_provider,
  source_account_id, source_account_name, source_account_type, currency, currency_needs_review,
  source_amount, source_currency)
select c.user_id, c.id, v.description, v.amount, v.date::date, v.merchant, v.bunq_id, v.mcc,
  v.payment_type, null, v.provider, v.account_id, v.account_name, v.account_type, 'EUR', v.review,
  v.source_amount, v.source_currency::currency_code
from (values
    ('Groceries', 'Weekly shop', 612.34, '2026-03-07', 'Example Market', null, null, null,
      null, null, null, null, false, null, null),
    ('Groceries', 'Imported from the bank', 0.01, '2026-03-08', 'Example Bakery', 'fixture-bunq-payment-2',
      '5411', 'MASTERCARD', 'bunq', 'fixture-bunq-account-1', 'Household pot', 'MonetaryAccountJoint',
      false, 0.01, 'USD'),
    ('Fun', 'Paid in pounds, rate unknown', 42.00, '2026-03-09', 'Café Ünïcode', null, null, null,
      null, null, null, null, true, 36.00, 'GBP'),
    ('Commute', 'Refund', -19.99, '2026-02-10', 'Example Rail', null, null, null,
      null, null, null, null, false, null, null)
  ) as v(category, description, amount, date, merchant, bunq_id, mcc, payment_type, provider,
    account_id, account_name, account_type, review, source_amount, source_currency)
join budget_categories c on c.name = v.category;

insert into category_mappings (user_id, source, source_key, category_name, created_at)
select u.id, 'bunq_mcc', '5411', 'Groceries', '2026-03-08 10:00:00'
from users u where u.email = 'demo@quro.local';

-- ── Rates with provenance ────────────────────────────────────────────────────

insert into currency_rate_history (from_currency, to_currency, rate, provider, source_date, updated_at)
values
  ('GBP', 'EUR', 1.180000, 'seed', '2026-03-01', '2026-03-01 16:00:00'),
  ('USD', 'EUR', 0.920001, 'fixture-provider', '2026-03-02', '2026-03-02 16:00:00'),
  ('SGD', 'EUR', 0.000001, 'fixture-provider', '2026-03-03', '2026-03-03 16:00:00');

-- ── Debts ────────────────────────────────────────────────────────────────────

insert into debts (user_id, name, type, lender, original_amount, remaining_balance, currency,
  interest_rate, monthly_payment, start_date, end_date, color, emoji, notes, archived_at)
select u.id, v.name, v.type, v.lender, v.original, v.remaining, v.currency::currency_code, v.rate,
  v.payment, v.start::date, v.finish::date, '#336699', '💳', v.notes, v.archived::timestamp
from (values
    ('demo@quro.local', 'Car loan', 'car_loan', 'Example Lender', 12000.00, 7400.55, 'EUR', 5.2500, 310.00,
      '2025-01-15', '2029-01-15', null, null),
    ('demo@quro.local', 'Open-ended card', 'credit_card', 'Voorbeeld Lender', 2000.00, 1999.99, 'USD', 19.9900,
      50.00, '2024-06-01', null, 'No end date', null),
    ('partner@example.invalid', 'Paid off', 'student_loan', 'Example Lender', 0.01, 0.00, 'GBP', 0.0000, 0.00,
      '2010-09-01', '2020-09-01', 'Archivé', '2021-01-01 00:00:00')
  ) as v(email, name, type, lender, original, remaining, currency, rate, payment, start, finish, notes, archived)
join users u on u.email = v.email;

insert into debt_payments (user_id, debt_id, date, amount, principal, interest, note)
select d.user_id, d.id, v.date::date, v.amount, v.principal, v.interest, v.note
from (values
    ('Car loan', '2026-02-15', 310.00, 278.45, 31.55, null),
    ('Car loan', '2026-03-15', 310.00, 279.67, 30.33, 'Mars 🚗'),
    ('Paid off', '2020-09-01', 0.01, 0.01, 0.00, null)
  ) as v(debt, date, amount, principal, interest, note)
join debts d on d.name = v.debt;

-- ── Property: a joint mortgage in negative equity ────────────────────────────

insert into mortgages (user_id, property_address, lender, currency, original_amount,
  outstanding_balance, property_value, monthly_payment, interest_rate, rate_type, fixed_until,
  term_years, start_date, end_date, overpayment_limit, archived_at, is_joint, repayment_type)
select u.id, v.address, v.lender, v.currency::currency_code, v.original, v.outstanding, v.value,
  v.payment, v.rate, v.rate_type, v.fixed_until, v.term, v.start, v.finish, v.overpay, null, v.joint,
  v.repayment
from (values
    ('demo@quro.local', '1 Example Street, Exampleville', 'Example Mortgages', 'EUR', 400000.00,
      389999.99, 350000.00, 1850.25, 3.9500, 'Fixed', '2031-06', 30, '2021-06', '2051-06', 0.10, true, 'Annuity'),
    ('solo@example.invalid', 'Unit 2, 例え通り', 'Example Mortgages', 'AUD', 500000.00,
      120000.00, 900000.00, 2100.00, 6.1000, 'Variable', null, 25, '2015-01', '2040-01', null, false, 'Linear')
  ) as v(email, address, lender, currency, original, outstanding, value, payment, rate, rate_type,
    fixed_until, term, start, finish, overpay, joint, repayment)
join users u on u.email = v.email;

insert into mortgage_transactions (user_id, mortgage_id, type, amount, interest, principal, date, note, fixed_years)
select m.user_id, m.id, v.type, v.amount, v.interest, v.principal, v.date::date, v.note, v.fixed_years
from (values
    ('Example Mortgages', 'EUR', 'repayment', 1850.25, 1283.33, 566.92, '2026-03-01', null, null),
    ('Example Mortgages', 'EUR', 'valuation', 350000.00, null, null, '2026-01-01', 'Market fell', null),
    ('Example Mortgages', 'EUR', 'rate_change', 3.95, null, null, '2026-01-01', null, 5.5)
  ) as v(lender, currency, type, amount, interest, principal, date, note, fixed_years)
join mortgages m on m.lender = v.lender and m.currency = v.currency::currency_code;

insert into properties (user_id, address, property_type, purchase_price, current_value, mortgage,
  mortgage_id, monthly_rent, currency, emoji, is_joint, archived_at)
select m.user_id, m.property_address, v.kind, v.purchase, m.property_value, m.outstanding_balance,
  m.id, v.rent, m.currency, v.emoji, m.is_joint, null
from (values
    ('EUR', 'Apartment', 420000.00, 0.00, '🏢'),
    ('AUD', 'House', 600000.00, 1500.00, null)
  ) as v(currency, kind, purchase, rent, emoji)
join mortgages m on m.currency = v.currency::currency_code;

insert into property_transactions (user_id, property_id, type, amount, interest, principal, date, note)
select p.user_id, p.id, v.type, v.amount, v.interest::numeric, v.principal::numeric, v.date::date, v.note
from (values
    ('AUD', 'rent_income', 1500.00, null, null, '2026-03-01', null),
    ('AUD', 'expense', -320.50, null, null, '2026-03-05', 'Repairs 🔧'),
    ('EUR', 'valuation', 350000.00, null, null, '2026-01-01', null)
  ) as v(currency, type, amount, interest, principal, date, note)
join properties p on p.currency = v.currency::currency_code;

-- ── Investments ──────────────────────────────────────────────────────────────

insert into stock_exchanges (mic, name, acronym, country, country_code, city, website)
values ('XFIX', 'Fixture Exchange', null, 'Nowhere', 'ZZ', null, null);

insert into holdings (user_id, name, ticker, current_price, currency, sector, item_type, exchange_mic,
  industry, price_updated_at, manual_price, exclude_from_sync, archived_at)
select u.id, v.name, v.ticker, v.price, v.currency::currency_code, v.sector, v.item_type, v.mic,
  v.industry, v.updated::timestamp, v.manual, v.exclude, null
from (values
    ('demo@quro.local', 'Example World ETF', 'FIXW', 101.23, 'USD', 'Diversified', 'etf', 'XFIX',
      null, '2026-03-06 21:00:00', null, false),
    ('demo@quro.local', 'Hand-priced fund', 'FIXH', 0.01, 'EUR', 'Other', 'fund', null,
      'Ünïndustry', null, 0.01, true),
    ('partner@example.invalid', 'Pound stock', 'FIXP', 99999999.99, 'GBP', 'Financials', 'equity', 'XFIX',
      'Banks', '2026-03-06 17:30:00', null, false)
  ) as v(email, name, ticker, price, currency, sector, item_type, mic, industry, updated, manual, exclude)
join users u on u.email = v.email;

insert into holding_transactions (user_id, holding_id, type, shares, price, date, note)
select h.user_id, h.id, v.type, v.shares, v.price, v.date::date, v.note
from (values
    ('FIXW', 'buy', 10.123456, 99.10, '2026-01-02', null),
    ('FIXW', 'sell', 0.000001, 101.00, '2026-02-02', 'Smallest unit'),
    ('FIXW', 'dividend', null, 3.21, '2026-03-02', null),
    ('FIXP', 'buy', 1.000000, 99999999.99, '2026-01-05', null)
  ) as v(ticker, type, shares, price, date, note)
join holdings h on h.ticker = v.ticker;

insert into holding_price_history (user_id, holding_id, eod_date, close_price, price_currency, synced_at)
select h.user_id, h.id, v.date::date, v.price, v.currency, v.synced::timestamp
from (values
    ('FIXW', '2026-03-05', 100.99, 'USD', '2026-03-05 22:00:00'),
    ('FIXW', '2026-03-06', 101.23, 'USD', '2026-03-06 22:00:00'),
    ('FIXP', '2026-03-06', 99999999.99, 'GBX', '2026-03-06 18:00:00')
  ) as v(ticker, date, price, currency, synced)
join holdings h on h.ticker = v.ticker;

-- ── Salary and payslips (two with a PDF) ─────────────────────────────────────

insert into employments (user_id, employer_name, employment_type, service_start_date, end_date,
  notice_period_months, is_primary, created_at, updated_at)
select u.id, v.employer, v.type, v.start::date, v.finish::date, v.notice, v.is_primary,
  '2026-01-01 00:00:00', '2026-01-02 00:00:00'
from (values
    ('demo@quro.local', 'Example Employer B.V.', 'employed', '2020-04-01', null, 1, true),
    ('partner@example.invalid', null, 'self_employed', null, null, null, true),
    ('partner@example.invalid', 'Former Employer Ltd', 'employed', '2015-01-01', '2019-12-31', 24, false)
  ) as v(email, employer, type, start, finish, notice, is_primary)
join users u on u.email = v.email;

insert into payslips (user_id, month, date, gross, tax, pension, net, bonus, currency, employment_id)
select u.id, v.month, v.date::date, v.gross, v.tax, v.pension, v.net, v.bonus, v.currency::currency_code,
  e.id
from (values
    ('demo@quro.local', 'Mar 2026', '2026-03-25', 4200.00, 1260.00, 210.00, 2730.00, null, 'EUR', true),
    ('demo@quro.local', 'Feb 2026', '2026-02-25', 4200.00, 1260.00, 210.00, 3729.99, 999.99, 'EUR', true),
    ('partner@example.invalid', 'Feb 2026', '2026-02-28', 3100.55, 620.11, 0.00, 2480.44, 0.00, 'GBP', true),
    ('solo@example.invalid', 'Mar 2026', '2026-03-31', 0.01, 0.00, 0.00, 0.01, null, 'AUD', false)
  ) as v(email, month, date, gross, tax, pension, net, bonus, currency, with_employment)
join users u on u.email = v.email
left join employments e on e.user_id = u.id and e.is_primary and v.with_employment;

-- Inline payslip PDFs, keyed users/<user>/salary/payslips/<payslip>/<uuid>.pdf as 0.7.0 does.
update payslips p
set document_storage_key = format('users/%s/salary/payslips/%s/%s.pdf', p.user_id, p.id, v.uuid),
  document_file_name = v.file_name,
  document_size_bytes = v.size,
  document_uploaded_at = v.uploaded_at::timestamp
from users u,
  (values
    ('demo@quro.local', 'Mar 2026', '00000000-0000-4000-8000-00000000f001', 'payslip_2026-03.pdf',
      730, '2026-03-26 07:00:00'),
    ('partner@example.invalid', 'Feb 2026', '00000000-0000-4000-8000-00000000f002',
      'Gehaltsabrechnung_M_rz_2026.pdf', 733, '2026-03-01 07:00:00')
  ) as v(email, month, uuid, file_name, size, uploaded_at)
where u.email = v.email and p.user_id = u.id and p.month = v.month;

-- ── Pensions: pots, a hand-uploaded statement and three statement imports ────

insert into pension_pots (user_id, name, provider, type, balance, currency, employee_monthly,
  employer_monthly, investment_strategy, metadata, color, emoji, notes, archived_at)
select u.id, v.name, v.provider, v.type, v.balance, v.currency::currency_code, v.employee, v.employer,
  v.strategy, v.metadata::jsonb, null, null, v.notes, null
from (values
    ('demo@quro.local', 'Workplace pot', 'Example Pensions', 'Workplace Pension', 54321.09, 'EUR',
      250.00, 250.00, 'Lifecycle',
      '{"plan": "A-1", "tags": ["x", "ü"], "nested": {"n": 1.50, "ok": true, "none": null}}', null),
    ('partner@example.invalid', 'Empty pot', 'Example Pensions', 'Personal Pension', 0, 'GBP', 0, 0, null,
      '{}', 'Leer – vide – 空'),
    ('solo@example.invalid', 'Super', 'Example Super', 'Other', -1.00, 'AUD', 0, 0, null,
      '{"note": "negative after fees"}', null)
  ) as v(email, name, provider, type, balance, currency, employee, employer, strategy, metadata, notes)
join users u on u.email = v.email;

insert into pension_transactions (user_id, pot_id, type, amount, tax_amount, date, note, is_employer)
select p.user_id, p.id, v.type, v.amount, v.tax, v.date::date, v.note, v.employer
from (values
    ('Workplace pot', 'contribution', 250.00, 0.00, '2026-03-25', null, false),
    ('Workplace pot', 'contribution', 250.00, 0.00, '2026-03-25', null, true),
    ('Workplace pot', 'fee', -12.50, 0.00, '2026-03-31', 'Platform fee', null),
    ('Workplace pot', 'annual_statement', 53833.59, 0.00, '2025-12-31', 'Statement 2025 uploaded by hand', null)
  ) as v(pot, type, amount, tax, date, note, employer)
join pension_pots p on p.name = v.pot;

update pension_transactions t
set document_storage_key = format('users/%s/pensions/%s/annual-statements/%s/%s.pdf', t.user_id, t.pot_id,
    t.id, '00000000-0000-4000-8000-00000000f003'),
  document_file_name = 'annual-statement_2025.pdf',
  document_size_bytes = 716,
  document_uploaded_at = '2026-01-20 18:45:00'
where t.note = 'Statement 2025 uploaded by hand';

-- Imports keep their PDF at users/<user>/pensions/<pot>/imports/<uuid>.pdf. Committed: the annual
-- statement transaction it created points at the same object. Ready for review: only the import
-- refers to it. Expired: 0.7.0 deleted the object and set storage_deleted_at.
insert into pension_statement_imports (user_id, pot_id, status, storage_key, storage_deleted_at,
  file_name, mime_type, size_bytes, file_hash_sha256, statement_period_start, statement_period_end,
  language_hints, model_name, model_version, error_message, created_at, updated_at, expires_at,
  committed_at)
select p.user_id, p.id, v.status::pension_import_status,
  format('users/%s/pensions/%s/imports/%s.pdf', p.user_id, p.id, v.uuid), v.deleted_at::timestamp,
  v.file_name, 'application/pdf', v.size, v.sha256, v.period_start::date, v.period_end::date,
  v.hints::jsonb, v.model, v.model_version, v.error, v.created_at::timestamp, v.updated_at::timestamp,
  v.expires_at::timestamp, v.committed_at::timestamp
from (values
    ('committed', '00000000-0000-4000-8000-00000000f004', null, 'statement_2024.pdf', 722,
      'e0050475a038ed1e825eecf71cb113b5a65db9055f708056bac524b0c4bceb78', '2024-01-01', '2024-12-31',
      '["nl", "en"]', 'fixture-model', '1.0', null, '2025-02-01 10:00:00', '2025-02-01 10:05:00',
      '2025-02-08 10:00:00', '2025-02-01 10:05:00'),
    ('ready_for_review', '00000000-0000-4000-8000-00000000f005', null, 'statement_2026.pdf', 725,
      '6b63d0646e27af5057262d64012c76570a660e319215fb54f8dfed39fe3e3b5b', null, null,
      '[]', 'fixture-model', null, null, '2026-03-30 10:00:00', '2026-03-30 10:02:00',
      '2099-04-06 10:00:00', null),
    ('expired', '00000000-0000-4000-8000-00000000f006', '2025-01-08 03:00:00', 'statement_2023.pdf', 726,
      '2cb0154cda4c449f9d1d734dfa8f30a8bcd475f2ca1288fea913f82735cee6fb', null, null,
      '["de"]', null, null, 'Draft expired after retention period', '2025-01-01 10:00:00',
      '2025-01-08 03:00:00', '2025-01-08 10:00:00', null)
  ) as v(status, uuid, deleted_at, file_name, size, sha256, period_start, period_end, hints, model,
    model_version, error, created_at, updated_at, expires_at, committed_at)
join pension_pots p on p.name = 'Workplace pot';

insert into pension_transactions (user_id, pot_id, type, amount, tax_amount, date, note, is_employer,
  document_storage_key, document_file_name, document_size_bytes, document_uploaded_at)
select i.user_id, i.pot_id, 'annual_statement', 48210.77, 0.00, '2024-12-31', 'Statement 2024 (imported)',
  null, i.storage_key, i.file_name, i.size_bytes, i.committed_at
from pension_statement_imports i where i.status = 'committed';

insert into pension_statement_import_rows (import_id, row_order, type, amount, tax_amount, date, note,
  is_employer, confidence, confidence_label, evidence, is_derived, is_deleted, collision_warning,
  committed_transaction_id, edited_at, created_at, updated_at)
select i.id, v.row_order, v.type, v.amount, 0.00, v.date::date, v.note, v.employer, v.confidence,
  v.label::pension_import_confidence_label, v.evidence::jsonb, v.derived, v.deleted, v.collision::jsonb,
  case when i.status = 'committed' and not v.deleted then
    (select t.id from pension_transactions t where t.note = 'Statement 2024 (imported)') end,
  v.edited_at::timestamp, i.created_at, i.updated_at
from (values
    ('committed', 0, 'annual_statement', 48210.77, '2024-12-31', 'Statement 2024 (imported)', null, 0.9876,
      'high', '{"page": 1, "text": "Saldo per 31-12-2024"}', false, false, null, null),
    ('committed', 1, 'contribution', 100.00, '2024-06-30', 'Dropped duplicate', true, 0.4000,
      'low', '{}', true, true, '{"reason": "duplicate of an existing row"}', '2025-02-01 10:04:00'),
    ('ready_for_review', 0, 'annual_statement', 56000.00, '2025-12-31', 'Pending review ✓', null, 0.7500,
      'medium', '{"page": 2}', false, false, null, null)
  ) as v(status, row_order, type, amount, date, note, employer, confidence, label, evidence, derived,
    deleted, collision, edited_at)
join pension_statement_imports i on i.status = v.status::pension_import_status;

-- ── Goals, plans and snapshots ───────────────────────────────────────────────

insert into goals (user_id, type, name, emoji, current_amount, target_amount, deadline, year, category,
  monthly_contribution, monthly_target, months_completed, total_months, unit, color, notes, currency,
  source_type, source_id, start_month, missed_months)
select u.id, v.type, v.name, null, v.current, v.target, v.deadline, v.year, v.category, v.monthly,
  v.monthly_target, v.done, v.total, v.unit, null, v.notes, v.currency::currency_code, v.source_type,
  case when v.source_type = 'savings_account'
    then (select a.id from savings_accounts a where a.name = 'Joint rainy day') end,
  v.start_month, v.missed::jsonb
from (values
    ('demo@quro.local', 'savings', 'Emergency fund', 12345.67, 20000.00, 'Dec 2026', 2026, 'Safety', 500.00,
      null, null, null, null, null, 'EUR', 'savings_account', '2026-01', '["2026-02"]'),
    ('demo@quro.local', 'net_worth', 'Above water', -39999.99, 0.00, 'Dec 2027', null, 'Wealth', 0.00,
      null, null, null, null, 'Ünïcode goal', 'EUR', 'net_worth_total', null, null),
    ('partner@example.invalid', 'annual', 'Invest monthly', 3.00, 12.00, 'Dec 2026', 2026, 'Habit', 0.00,
      100.00, 3, 12, 'months', null, 'GBP', 'manual', '2026-01', '[]')
  ) as v(email, type, name, current, target, deadline, year, category, monthly, monthly_target, done,
    total, unit, notes, currency, source_type, start_month, missed)
join users u on u.email = v.email;

insert into plan_assumptions (user_id, lean_burn_override, emergency_lifestyle_pct, excluded_tiers,
  count_full_joint_balances, benefit_monthly_override, benefit_max_months_override, updated_at,
  ww_weekly_requirement, ww_duration_months, ww_duration_confirmed_at, severance_monthly_salary_override)
select u.id, v.lean, v.pct, v.tiers::jsonb, v.full_joint, v.benefit, v.months, '2026-03-01 00:00:00',
  v.ww, v.ww_months, v.ww_confirmed::date, v.severance
from (values
    ('demo@quro.local', 1999.99, 0.7500, '["pension"]', true, 0.00, 0, 'met', 24, '2026-02-01', 4200.00),
    ('partner@example.invalid', null, null, null, null, null, null, 'unknown', null, null, null)
  ) as v(email, lean, pct, tiers, full_joint, benefit, months, ww, ww_months, ww_confirmed, severance)
join users u on u.email = v.email;

insert into net_worth_snapshots (user_id, snapshot_date, base_currency, savings, brokerage,
  property_equity, pension, liabilities, total_value, is_estimated, computed_at)
select u.id, v.date::date, v.base::currency_code, v.savings, v.brokerage, v.equity, v.pension,
  v.liabilities, v.total, v.estimated, v.computed::timestamp
from (values
    ('demo@quro.local', '2026-02-28', 'EUR', 10000.00, 1000.00, -39999.99, 54321.09, 9400.54, 15920.56,
      false, '2026-03-01 00:05:00'),
    ('demo@quro.local', '2026-03-31', 'EUR', 9999999999999.99, 0.00, 0.00, 0.00, 0.00, 9999999999999.99,
      true, '2026-04-01 00:05:00'),
    ('partner@example.invalid', '2026-03-31', 'GBP', -0.01, 0.00, 0.00, 0.00, 0.00, -0.01, true,
      '2026-04-01 00:05:00')
  ) as v(email, date, base, savings, brokerage, equity, pension, liabilities, total, estimated, computed)
join users u on u.email = v.email;

-- ── Bank link state (placeholders, never valid credentials) ──────────────────

insert into bunq_connections (user_id, access_token, bunq_user_id, last_sync_at, sync_status,
  sync_error, created_at, private_key, installation_token, server_public_key, session_token,
  session_expires_at, session_id)
select u.id, 'fixture-placeholder-access-token', 'fixture-bunq-user', '2026-03-08 06:00:00', 'error',
  'Synthetic sync error ⚠', '2026-01-03 12:00:00', null, null, null, null, null, null
from users u where u.email = 'demo@quro.local';

insert into bunq_oauth_attempts (state_hash, user_id, destination, expires_at, consumed_at, created_at)
select repeat('ab', 32), u.id, 'savings', '2026-01-03 12:10:00', '2026-01-03 12:01:00', '2026-01-03 12:00:00'
from users u where u.email = 'demo@quro.local';

insert into bunq_payment_progress (user_id, account_id, kind, newer_than, next_page_url, complete, started_at)
select a.user_id, a.id, 'budget', null, null, true, '2026-03-08 06:00:00'
from savings_accounts a where a.name = 'Household pot';

insert into worker_heartbeats (worker_name, status, last_heartbeat_at, parser_healthy, parser_checked_at,
  parser_error, created_at, updated_at)
values ('pension-import-worker', 'idle', '2026-03-30 10:02:00', false, '2026-03-30 10:01:00',
  'Synthetic parser error', '2026-01-01 00:00:00', '2026-03-30 10:02:00');

commit;
