CREATE TABLE "holding_price_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"holding_id" integer NOT NULL,
	"eod_date" date NOT NULL,
	"close_price" numeric NOT NULL,
	"price_currency" text NOT NULL,
	"synced_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "holding_price_history" ADD CONSTRAINT "holding_price_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "holding_price_history" ADD CONSTRAINT "holding_price_history_holding_id_holdings_id_fk" FOREIGN KEY ("holding_id") REFERENCES "public"."holdings"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "holding_price_history_user_date_idx" ON "holding_price_history" USING btree ("user_id","eod_date");
--> statement-breakpoint
CREATE INDEX "holding_price_history_holding_date_idx" ON "holding_price_history" USING btree ("holding_id","eod_date");
--> statement-breakpoint
CREATE UNIQUE INDEX "holding_price_history_holding_date_unique" ON "holding_price_history" USING btree ("holding_id","eod_date");
