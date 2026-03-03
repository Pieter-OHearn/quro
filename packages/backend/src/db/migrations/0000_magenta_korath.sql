CREATE TYPE "public"."currency_code" AS ENUM('EUR', 'GBP', 'USD', 'AUD', 'NZD', 'CAD', 'CHF', 'SGD');--> statement-breakpoint
CREATE TABLE "asset_allocations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"name" text NOT NULL,
	"value" numeric NOT NULL,
	"color" text,
	"snapshot_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"name" text NOT NULL,
	"emoji" text,
	"budgeted" numeric NOT NULL,
	"spent" numeric NOT NULL,
	"color" text,
	"month" text NOT NULL,
	"year" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"category_id" integer NOT NULL,
	"description" text NOT NULL,
	"amount" numeric NOT NULL,
	"date" date NOT NULL,
	"merchant" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "currency_rates" (
	"id" serial PRIMARY KEY NOT NULL,
	"from_currency" "currency_code" NOT NULL,
	"to_currency" "currency_code" NOT NULL,
	"rate" numeric NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dashboard_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"amount" numeric NOT NULL,
	"date" date NOT NULL,
	"category" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"type" text,
	"name" text NOT NULL,
	"emoji" text,
	"current_amount" numeric NOT NULL,
	"target_amount" numeric NOT NULL,
	"deadline" text NOT NULL,
	"year" integer,
	"category" text NOT NULL,
	"monthly_contribution" numeric NOT NULL,
	"monthly_target" numeric,
	"months_completed" integer,
	"total_months" integer,
	"unit" text,
	"color" text,
	"notes" text,
	"currency" "currency_code" DEFAULT 'EUR' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holding_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"holding_id" integer NOT NULL,
	"type" text NOT NULL,
	"shares" numeric,
	"price" numeric NOT NULL,
	"date" date NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "holdings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"name" text NOT NULL,
	"ticker" text NOT NULL,
	"current_price" numeric NOT NULL,
	"currency" "currency_code" NOT NULL,
	"sector" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mortgage_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"mortgage_id" integer NOT NULL,
	"type" text NOT NULL,
	"amount" numeric NOT NULL,
	"interest" numeric,
	"principal" numeric,
	"date" date NOT NULL,
	"note" text,
	"fixed_years" numeric
);
--> statement-breakpoint
CREATE TABLE "mortgages" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"property_address" text NOT NULL,
	"lender" text NOT NULL,
	"currency" "currency_code" NOT NULL,
	"original_amount" numeric NOT NULL,
	"outstanding_balance" numeric NOT NULL,
	"property_value" numeric NOT NULL,
	"monthly_payment" numeric NOT NULL,
	"interest_rate" numeric NOT NULL,
	"rate_type" text NOT NULL,
	"fixed_until" text,
	"term_years" integer NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text NOT NULL,
	"overpayment_limit" numeric
);
--> statement-breakpoint
CREATE TABLE "net_worth_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"month" text NOT NULL,
	"year" integer NOT NULL,
	"total_value" numeric NOT NULL,
	"currency" "currency_code" DEFAULT 'EUR' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payslips" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"month" text NOT NULL,
	"date" date NOT NULL,
	"gross" numeric NOT NULL,
	"tax" numeric NOT NULL,
	"pension" numeric NOT NULL,
	"net" numeric NOT NULL,
	"bonus" numeric,
	"currency" "currency_code" DEFAULT 'EUR' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pension_pots" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"name" text NOT NULL,
	"provider" text NOT NULL,
	"type" text NOT NULL,
	"balance" numeric NOT NULL,
	"currency" "currency_code" NOT NULL,
	"employee_monthly" numeric NOT NULL,
	"employer_monthly" numeric NOT NULL,
	"color" text,
	"emoji" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "pension_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"pot_id" integer NOT NULL,
	"type" text NOT NULL,
	"amount" numeric NOT NULL,
	"date" date NOT NULL,
	"note" text,
	"is_employer" boolean
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"address" text NOT NULL,
	"property_type" text NOT NULL,
	"purchase_price" numeric NOT NULL,
	"current_value" numeric NOT NULL,
	"mortgage" numeric NOT NULL,
	"mortgage_id" integer,
	"monthly_rent" numeric NOT NULL,
	"currency" "currency_code" NOT NULL,
	"emoji" text
);
--> statement-breakpoint
CREATE TABLE "property_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"property_id" integer NOT NULL,
	"type" text NOT NULL,
	"amount" numeric NOT NULL,
	"interest" numeric,
	"principal" numeric,
	"date" date NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "savings_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"name" text NOT NULL,
	"bank" text NOT NULL,
	"balance" numeric NOT NULL,
	"currency" "currency_code" NOT NULL,
	"interest_rate" numeric NOT NULL,
	"account_type" text NOT NULL,
	"color" text,
	"emoji" text
);
--> statement-breakpoint
CREATE TABLE "savings_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"account_id" integer NOT NULL,
	"type" text NOT NULL,
	"amount" numeric NOT NULL,
	"date" date NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "asset_allocations" ADD CONSTRAINT "asset_allocations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_allocations" ADD CONSTRAINT "asset_allocations_snapshot_id_net_worth_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."net_worth_snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_categories" ADD CONSTRAINT "budget_categories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_transactions" ADD CONSTRAINT "budget_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_transactions" ADD CONSTRAINT "budget_transactions_category_id_budget_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."budget_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_transactions" ADD CONSTRAINT "dashboard_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holding_transactions" ADD CONSTRAINT "holding_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holding_transactions" ADD CONSTRAINT "holding_transactions_holding_id_holdings_id_fk" FOREIGN KEY ("holding_id") REFERENCES "public"."holdings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mortgage_transactions" ADD CONSTRAINT "mortgage_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mortgage_transactions" ADD CONSTRAINT "mortgage_transactions_mortgage_id_mortgages_id_fk" FOREIGN KEY ("mortgage_id") REFERENCES "public"."mortgages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mortgages" ADD CONSTRAINT "mortgages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "net_worth_snapshots" ADD CONSTRAINT "net_worth_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pension_pots" ADD CONSTRAINT "pension_pots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pension_transactions" ADD CONSTRAINT "pension_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pension_transactions" ADD CONSTRAINT "pension_transactions_pot_id_pension_pots_id_fk" FOREIGN KEY ("pot_id") REFERENCES "public"."pension_pots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_transactions" ADD CONSTRAINT "property_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_transactions" ADD CONSTRAINT "property_transactions_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_accounts" ADD CONSTRAINT "savings_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_transactions" ADD CONSTRAINT "savings_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_transactions" ADD CONSTRAINT "savings_transactions_account_id_savings_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."savings_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asset_allocations_user_id_idx" ON "asset_allocations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "budget_categories_user_id_idx" ON "budget_categories" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "budget_transactions_user_id_idx" ON "budget_transactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "budget_transactions_user_date_idx" ON "budget_transactions" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "dashboard_transactions_user_id_idx" ON "dashboard_transactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "dashboard_transactions_user_date_idx" ON "dashboard_transactions" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "goals_user_id_idx" ON "goals" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "holding_transactions_user_id_idx" ON "holding_transactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "holding_transactions_user_date_idx" ON "holding_transactions" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "holdings_user_id_idx" ON "holdings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "mortgage_transactions_user_id_idx" ON "mortgage_transactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "mortgage_transactions_user_date_idx" ON "mortgage_transactions" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "mortgages_user_id_idx" ON "mortgages" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "net_worth_snapshots_user_id_idx" ON "net_worth_snapshots" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "payslips_user_id_idx" ON "payslips" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "payslips_user_date_idx" ON "payslips" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "pension_pots_user_id_idx" ON "pension_pots" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "pension_transactions_user_id_idx" ON "pension_transactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "pension_transactions_user_date_idx" ON "pension_transactions" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "properties_user_id_idx" ON "properties" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "properties_mortgage_id_idx" ON "properties" USING btree ("mortgage_id");--> statement-breakpoint
CREATE INDEX "property_transactions_user_id_idx" ON "property_transactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "property_transactions_user_date_idx" ON "property_transactions" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "savings_accounts_user_id_idx" ON "savings_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "savings_transactions_user_id_idx" ON "savings_transactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "savings_transactions_user_date_idx" ON "savings_transactions" USING btree ("user_id","date");