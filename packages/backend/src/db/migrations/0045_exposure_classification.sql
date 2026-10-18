CREATE TABLE "exposure_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"settings" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "exposure_settings_object_check" CHECK (jsonb_typeof("exposure_settings"."settings") = 'object')
);
--> statement-breakpoint
ALTER TABLE "holdings" ADD COLUMN "asset_class" text;--> statement-breakpoint
ALTER TABLE "holdings" ADD COLUMN "risk_class_override" integer;--> statement-breakpoint
ALTER TABLE "exposure_settings" ADD CONSTRAINT "exposure_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "exposure_settings_user_id_unique" ON "exposure_settings" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_asset_class_check" CHECK ("holdings"."asset_class" is null or "holdings"."asset_class" in ('equity_developed', 'equity_emerging', 'bond_short_government', 'bond_long_government', 'bond_investment_grade', 'bond_high_yield', 'cash_money_market', 'gold_commodities', 'property_reits', 'crypto', 'other'));--> statement-breakpoint
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_risk_class_override_check" CHECK ("holdings"."risk_class_override" is null or "holdings"."risk_class_override" between 1 and 7);