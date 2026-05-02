CREATE TABLE "category_mappings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"source" text NOT NULL,
	"source_key" text NOT NULL,
	"category_name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "budget_transactions" ADD COLUMN "bunq_mcc" text;--> statement-breakpoint
ALTER TABLE "budget_transactions" ADD COLUMN "bunq_payment_type" text;--> statement-breakpoint
ALTER TABLE "budget_transactions" ADD COLUMN "counterparty_iban" text;--> statement-breakpoint
ALTER TABLE "category_mappings" ADD CONSTRAINT "category_mappings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "category_mappings_user_id_idx" ON "category_mappings" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "category_mappings_user_source_key_unique" ON "category_mappings" USING btree ("user_id","source","source_key");--> statement-breakpoint
ALTER TABLE "budget_categories" DROP COLUMN "bunq_category";