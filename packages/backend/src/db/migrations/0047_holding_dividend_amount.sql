-- A dividend's amount is money and moves from the six-decimal unit-price column `price` to its own
-- `amount numeric(19,2)` column; a buy or sell keeps its price per share and has no amount. A
-- dividend with an amount that is not whole cents refuses the migration before anything changes
-- (the money input rule has stored dividends in cents since they were first rounded on input).
-- The move only touches dividends that still have a price.
DO $$
DECLARE
  offenders text;
BEGIN
  SELECT string_agg(id::text, ', ' ORDER BY id) INTO offenders
  FROM holding_transactions
  WHERE type = 'dividend' AND price IS NOT NULL AND price <> round(price, 2);
  IF offenders IS NOT NULL THEN
    RAISE EXCEPTION 'Dividend amounts cannot move to their own column: holding transactions % are dividends of an amount that is not whole cents. Edit each amount to whole cents with the previous release, then run the migration again. Nothing was changed.', offenders
      USING ERRCODE = 'check_violation';
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "holding_transactions" ALTER COLUMN "price" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "holding_transactions" ADD COLUMN "amount" numeric(19, 2);--> statement-breakpoint
UPDATE "holding_transactions"
SET "amount" = "price", "price" = NULL
WHERE "type" = 'dividend' AND "price" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "holding_transactions" ADD CONSTRAINT "holding_transactions_price_or_amount_check" CHECK (case when "holding_transactions"."type" = 'dividend' then "holding_transactions"."amount" is not null and "holding_transactions"."price" is null
        else "holding_transactions"."price" is not null and "holding_transactions"."amount" is null end);
