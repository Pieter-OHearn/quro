CREATE TYPE "public"."bunq_sync_status" AS ENUM('idle', 'syncing', 'error');--> statement-breakpoint
CREATE TABLE "bunq_connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"token_expires_at" timestamp NOT NULL,
	"bunq_user_id" text NOT NULL,
	"last_sync_at" timestamp,
	"sync_status" "bunq_sync_status" DEFAULT 'idle' NOT NULL,
	"sync_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "budget_categories" ADD COLUMN "bunq_category" text;--> statement-breakpoint
ALTER TABLE "budget_transactions" ADD COLUMN "bunq_transaction_id" text;--> statement-breakpoint
ALTER TABLE "savings_accounts" ADD COLUMN "bunq_account_id" text;--> statement-breakpoint
ALTER TABLE "savings_transactions" ADD COLUMN "bunq_transaction_id" text;--> statement-breakpoint
ALTER TABLE "bunq_connections" ADD CONSTRAINT "bunq_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bunq_connections_user_id_idx" ON "bunq_connections" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "budget_transactions_user_bunq_transaction_id_unique" ON "budget_transactions" USING btree ("user_id","bunq_transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "savings_accounts_user_bunq_account_id_unique" ON "savings_accounts" USING btree ("user_id","bunq_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "savings_transactions_user_bunq_transaction_id_unique" ON "savings_transactions" USING btree ("user_id","bunq_transaction_id");
