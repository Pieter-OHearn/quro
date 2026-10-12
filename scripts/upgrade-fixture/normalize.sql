-- Pins the values the 0.7.0 demo seed derives from the clock or from a random salt, so that the
-- fixture is the same on every run. Loaded by generate.sh right after the seed, before
-- edge-cases.sql. Nothing else in the database depends on when it was generated.

begin;

-- A bcrypt hash of the demo seed's documented password, made by the same Bun.password.hash call.
update users
set password_hash = '$2b$10$c/d6grWjZeBHKgZrGnq7VOGynq4687CiDZBBbFEVUoennbkqNBlXm',
  created_at = '2025-10-01 08:00:00'
where email = 'demo@quro.local';

-- The seed stamps its approximate rates with the day it ran.
update currency_rates
set updated_at = '2026-03-01 06:00:00', source_date = '2026-03-01'
where provider = 'seed';

commit;
