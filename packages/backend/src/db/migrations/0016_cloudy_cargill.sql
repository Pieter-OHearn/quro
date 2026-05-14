ALTER TABLE "holding_transactions" DROP CONSTRAINT "holding_transactions_holding_id_holdings_id_fk";
--> statement-breakpoint
ALTER TABLE "mortgage_transactions" DROP CONSTRAINT "mortgage_transactions_mortgage_id_mortgages_id_fk";
--> statement-breakpoint
ALTER TABLE "pension_transactions" DROP CONSTRAINT "pension_transactions_pot_id_pension_pots_id_fk";
--> statement-breakpoint
ALTER TABLE "property_transactions" DROP CONSTRAINT "property_transactions_property_id_properties_id_fk";
--> statement-breakpoint
ALTER TABLE "debts" ADD COLUMN "archived_at" timestamp;--> statement-breakpoint
ALTER TABLE "holdings" ADD COLUMN "archived_at" timestamp;--> statement-breakpoint
ALTER TABLE "mortgages" ADD COLUMN "archived_at" timestamp;--> statement-breakpoint
ALTER TABLE "pension_pots" ADD COLUMN "archived_at" timestamp;--> statement-breakpoint
ALTER TABLE "holding_transactions" ADD CONSTRAINT "holding_transactions_holding_id_holdings_id_fk" FOREIGN KEY ("holding_id") REFERENCES "public"."holdings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mortgage_transactions" ADD CONSTRAINT "mortgage_transactions_mortgage_id_mortgages_id_fk" FOREIGN KEY ("mortgage_id") REFERENCES "public"."mortgages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pension_transactions" ADD CONSTRAINT "pension_transactions_pot_id_pension_pots_id_fk" FOREIGN KEY ("pot_id") REFERENCES "public"."pension_pots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_transactions" ADD CONSTRAINT "property_transactions_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;