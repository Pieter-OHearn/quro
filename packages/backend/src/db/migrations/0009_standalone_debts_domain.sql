CREATE TABLE "debts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"lender" text NOT NULL,
	"original_amount" numeric NOT NULL,
	"remaining_balance" numeric NOT NULL,
	"currency" "currency_code" NOT NULL,
	"interest_rate" numeric NOT NULL,
	"monthly_payment" numeric NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"color" text NOT NULL,
	"emoji" text NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "debt_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"debt_id" integer NOT NULL,
	"date" date NOT NULL,
	"amount" numeric NOT NULL,
	"principal" numeric NOT NULL,
	"interest" numeric NOT NULL,
	"note" text
);
--> statement-breakpoint
ALTER TABLE "debts" ADD CONSTRAINT "debts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_debt_id_debts_id_fk" FOREIGN KEY ("debt_id") REFERENCES "public"."debts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "debts_user_id_idx" ON "debts" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "debt_payments_user_id_idx" ON "debt_payments" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "debt_payments_user_date_idx" ON "debt_payments" USING btree ("user_id","date");
--> statement-breakpoint
CREATE INDEX "debt_payments_debt_id_idx" ON "debt_payments" USING btree ("debt_id");
