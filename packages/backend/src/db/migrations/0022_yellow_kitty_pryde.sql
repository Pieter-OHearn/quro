CREATE TABLE "currency_rate_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"from_currency" "currency_code" NOT NULL,
	"to_currency" "currency_code" NOT NULL,
	"rate" numeric(12, 6) NOT NULL,
	"rate_date" date NOT NULL,
	"provider" text NOT NULL,
	"synced_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "currency_rate_history_from_to_date_unique" ON "currency_rate_history" USING btree ("from_currency","to_currency","rate_date");--> statement-breakpoint
CREATE INDEX "currency_rate_history_from_to_date_idx" ON "currency_rate_history" USING btree ("from_currency","to_currency","rate_date");