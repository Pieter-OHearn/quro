DROP INDEX "bunq_connections_user_id_idx";--> statement-breakpoint
ALTER TABLE "budget_transactions" ADD COLUMN "source_provider" text;--> statement-breakpoint
ALTER TABLE "budget_transactions" ADD COLUMN "source_account_id" text;--> statement-breakpoint
ALTER TABLE "budget_transactions" ADD COLUMN "source_account_name" text;--> statement-breakpoint
ALTER TABLE "budget_transactions" ADD COLUMN "source_account_type" text;--> statement-breakpoint
ALTER TABLE "bunq_connections" ADD COLUMN "session_id" integer;--> statement-breakpoint
ALTER TABLE "holdings" ADD COLUMN "manual_price" numeric(19, 2);--> statement-breakpoint
ALTER TABLE "holdings" ADD COLUMN "exclude_from_sync" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "savings_accounts" ADD COLUMN "archived_at" timestamp;--> statement-breakpoint
CREATE UNIQUE INDEX "budget_categories_user_month_name_unique" ON "budget_categories" USING btree ("user_id","month","year","name");--> statement-breakpoint
CREATE UNIQUE INDEX "bunq_connections_user_id_idx" ON "bunq_connections" USING btree ("user_id");