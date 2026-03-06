DELETE FROM "pension_transactions";
--> statement-breakpoint
DELETE FROM "pension_pots";
--> statement-breakpoint
ALTER TABLE "pension_transactions" ADD COLUMN "tax_amount" numeric DEFAULT '0' NOT NULL;
--> statement-breakpoint
ALTER TABLE "pension_pots" ADD COLUMN "investment_strategy" text;
--> statement-breakpoint
ALTER TABLE "pension_pots" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;
