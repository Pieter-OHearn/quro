CREATE INDEX "mortgage_transactions_mortgage_id_idx" ON "mortgage_transactions" USING btree ("mortgage_id");--> statement-breakpoint
CREATE INDEX "property_transactions_property_id_idx" ON "property_transactions" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "savings_transactions_account_id_idx" ON "savings_transactions" USING btree ("account_id");