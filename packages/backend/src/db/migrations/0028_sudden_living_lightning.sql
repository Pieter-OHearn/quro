ALTER TABLE "savings_accounts" ADD COLUMN "deposit_guarantee_cap" numeric(19, 2);--> statement-breakpoint
ALTER TABLE "savings_accounts" ADD COLUMN "deposit_guarantee_currency" "currency_code";