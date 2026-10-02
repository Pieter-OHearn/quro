ALTER TABLE "budget_categories" ADD COLUMN "currency" "currency_code" DEFAULT 'EUR' NOT NULL;--> statement-breakpoint
ALTER TABLE "budget_categories" ADD COLUMN "currency_needs_review" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "budget_transactions" ADD COLUMN "currency" "currency_code" DEFAULT 'EUR' NOT NULL;--> statement-breakpoint
ALTER TABLE "budget_transactions" ADD COLUMN "currency_needs_review" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "budget_transactions" ADD COLUMN "source_amount" numeric(19, 2);--> statement-breakpoint
ALTER TABLE "budget_transactions" ADD COLUMN "source_currency" "currency_code";--> statement-breakpoint
ALTER TABLE "budget_categories" ADD CONSTRAINT "budget_categories_currency_eur" CHECK ("budget_categories"."currency" = 'EUR');--> statement-breakpoint
ALTER TABLE "budget_transactions" ADD CONSTRAINT "budget_transactions_currency_eur" CHECK ("budget_transactions"."currency" = 'EUR');--> statement-breakpoint
-- No historical input currency was stored. Preserve the pre-WP6 EUR meaning
-- independently of users.base_currency, and make that assumption visible.
UPDATE budget_categories SET currency_needs_review = true;
--> statement-breakpoint
UPDATE budget_transactions SET currency_needs_review = true, source_amount = amount;

-- Neither the current user preference nor a mutable linked account proves the
-- original currency. Re-importing a Bunq payment can recover its native currency;
-- otherwise an explicit amount correction is required after statement review.
