ALTER TABLE "savings_accounts" ADD COLUMN "banking_entity_id" text;--> statement-breakpoint
ALTER TABLE "savings_accounts" ADD COLUMN "banking_entity_name" text;--> statement-breakpoint
ALTER TABLE "savings_accounts" ADD COLUMN "deposit_guarantee_scheme" text;--> statement-breakpoint
ALTER TABLE "savings_accounts" ADD COLUMN "banking_entity_confirmed_at" timestamp;