-- A property's ledger keeps valuations, rent income and expenses; a mortgage's keeps repayments
-- and rate changes. Existing rows move to the ledger that owns them, then the columns that let
-- each ledger carry the other's rows are dropped. Rows whose owner cannot be told refuse the
-- migration before anything changes; the steps check for the old columns, so a second run is a
-- no-op.
DO $$
DECLARE
  offenders text;
  refusals text[] := '{}';
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'property_transactions'
      AND column_name = 'repayment_target'
  ) THEN
    SELECT string_agg(id::text, ', ' ORDER BY id) INTO offenders
    FROM property_transactions
    WHERE type = 'repayment'
      AND (repayment_target IS DISTINCT FROM 'mortgage' OR repayment_mortgage_id IS NULL);
    IF offenders IS NOT NULL THEN
      refusals := refusals || format(
        'property repayments %s paid a debt kept on the property or no recorded mortgage: delete each one with the previous release, or record it against the property''s mortgage there',
        offenders
      );
    END IF;
  END IF;

  SELECT string_agg(id::text, ', ' ORDER BY id) INTO offenders
  FROM mortgage_transactions AS valuation
  WHERE type = 'valuation'
    AND (SELECT count(*) FROM properties WHERE mortgage_id = valuation.mortgage_id) <> 1;
  IF offenders IS NOT NULL THEN
    refusals := refusals || format(
      'mortgage valuations %s belong to a mortgage that is not linked to exactly one property: link the mortgage to its property, or delete the valuation, with the previous release',
      offenders
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'properties'
      AND column_name = 'mortgage'
  ) THEN
    SELECT string_agg(id::text, ', ' ORDER BY id) INTO offenders
    FROM properties
    WHERE mortgage_id IS NULL AND mortgage <> 0;
    IF offenders IS NOT NULL THEN
      refusals := refusals || format(
        'properties %s carry a mortgage balance without a linked mortgage: add the mortgage on the Mortgage page and link it, or set the property''s mortgage balance to 0, with the previous release',
        offenders
      );
    END IF;
  END IF;

  IF cardinality(refusals) > 0 THEN
    RAISE EXCEPTION 'Property and mortgage ledgers cannot be separated: %. Nothing was changed. Run the migration again afterwards.', array_to_string(refusals, '; ')
      USING ERRCODE = 'check_violation';
  END IF;

  -- A repayment stays with the debt it paid. Its principal already reduced that mortgage's
  -- balance, so the row moves without changing any balance.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'property_transactions'
      AND column_name = 'repayment_target'
  ) THEN
    INSERT INTO mortgage_transactions (
      user_id, mortgage_id, type, amount, interest, principal, unapplied_principal, date, note
    )
    SELECT user_id, repayment_mortgage_id, 'repayment', amount, interest, principal,
      unapplied_principal, date, note
    FROM property_transactions
    WHERE type = 'repayment'
    ORDER BY id;
    DELETE FROM property_transactions WHERE type = 'repayment';
  END IF;

  -- A valuation belongs to the asset: it moves to the property the mortgage is linked to.
  INSERT INTO property_transactions (user_id, property_id, type, amount, date, note)
  SELECT valuation.user_id, property.id, 'valuation', valuation.amount, valuation.date,
    valuation.note
  FROM mortgage_transactions AS valuation
  JOIN properties AS property ON property.mortgage_id = valuation.mortgage_id
  WHERE valuation.type = 'valuation'
  ORDER BY valuation.id;
  DELETE FROM mortgage_transactions WHERE type = 'valuation';

  -- The current value is the latest valuation by date (ties by id); a property without one keeps
  -- the value it was entered with.
  UPDATE properties AS property
  SET current_value = latest.amount
  FROM (
    SELECT DISTINCT ON (property_id) property_id, amount
    FROM property_transactions
    WHERE type = 'valuation'
    ORDER BY property_id, date DESC, id DESC
  ) AS latest
  WHERE latest.property_id = property.id
    AND property.current_value IS DISTINCT FROM latest.amount;
END
$$;--> statement-breakpoint
ALTER TABLE "property_transactions" DROP CONSTRAINT IF EXISTS "property_transactions_repayment_target_check";--> statement-breakpoint
ALTER TABLE "property_transactions" DROP CONSTRAINT IF EXISTS "property_transactions_repayment_mortgage_id_mortgages_id_fk";--> statement-breakpoint
DROP INDEX IF EXISTS "property_transactions_repayment_mortgage_id_idx";--> statement-breakpoint
ALTER TABLE "mortgages" DROP COLUMN IF EXISTS "property_address";--> statement-breakpoint
ALTER TABLE "mortgages" DROP COLUMN IF EXISTS "property_value";--> statement-breakpoint
ALTER TABLE "properties" DROP COLUMN IF EXISTS "mortgage";--> statement-breakpoint
ALTER TABLE "property_transactions" DROP COLUMN IF EXISTS "interest";--> statement-breakpoint
ALTER TABLE "property_transactions" DROP COLUMN IF EXISTS "principal";--> statement-breakpoint
ALTER TABLE "property_transactions" DROP COLUMN IF EXISTS "unapplied_principal";--> statement-breakpoint
ALTER TABLE "property_transactions" DROP COLUMN IF EXISTS "repayment_target";--> statement-breakpoint
ALTER TABLE "property_transactions" DROP COLUMN IF EXISTS "repayment_mortgage_id";
