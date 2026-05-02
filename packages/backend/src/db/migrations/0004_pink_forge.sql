ALTER TABLE "savings_transactions" DROP CONSTRAINT "savings_transactions_account_id_savings_accounts_id_fk";
--> statement-breakpoint
ALTER TABLE "savings_transactions" ADD CONSTRAINT "savings_transactions_account_id_savings_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."savings_accounts"("id") ON DELETE cascade ON UPDATE no action;