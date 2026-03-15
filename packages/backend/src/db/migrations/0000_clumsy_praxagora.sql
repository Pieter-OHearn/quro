CREATE TYPE "public"."currency_code" AS ENUM('EUR', 'GBP', 'USD', 'AUD', 'NZD', 'CAD', 'CHF', 'SGD');--> statement-breakpoint
CREATE TYPE "public"."pension_import_confidence_label" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."pension_import_status" AS ENUM('queued', 'processing', 'ready_for_review', 'failed', 'committed', 'expired', 'cancelled');--> statement-breakpoint
CREATE TABLE "budget_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"name" text NOT NULL,
	"emoji" text,
	"budgeted" numeric(19, 2) NOT NULL,
	"spent" numeric(19, 2) NOT NULL,
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
	"amount" numeric(19, 2) NOT NULL,
	"date" date NOT NULL,
	"merchant" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "currency_rates" (
	"id" serial PRIMARY KEY NOT NULL,
	"from_currency" "currency_code" NOT NULL,
	"to_currency" "currency_code" NOT NULL,
	"rate" numeric(12, 6) NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dashboard_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"amount" numeric(19, 2) NOT NULL,
	"date" date NOT NULL,
	"category" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "debt_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"debt_id" integer NOT NULL,
	"date" date NOT NULL,
	"amount" numeric(19, 2) NOT NULL,
	"principal" numeric(19, 2) NOT NULL,
	"interest" numeric(19, 2) NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "debts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"lender" text NOT NULL,
	"original_amount" numeric(19, 2) NOT NULL,
	"remaining_balance" numeric(19, 2) NOT NULL,
	"currency" "currency_code" NOT NULL,
	"interest_rate" numeric(7, 4) NOT NULL,
	"monthly_payment" numeric(19, 2) NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"color" text NOT NULL,
	"emoji" text NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"type" text,
	"name" text NOT NULL,
	"emoji" text,
	"current_amount" numeric(19, 2) NOT NULL,
	"target_amount" numeric(19, 2) NOT NULL,
	"deadline" text NOT NULL,
	"year" integer,
	"category" text NOT NULL,
	"monthly_contribution" numeric(19, 2) NOT NULL,
	"monthly_target" numeric(19, 2),
	"months_completed" integer,
	"total_months" integer,
	"unit" text,
	"color" text,
	"notes" text,
	"currency" "currency_code" DEFAULT 'EUR' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holding_price_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"holding_id" integer NOT NULL,
	"eod_date" date NOT NULL,
	"close_price" numeric(19, 2) NOT NULL,
	"price_currency" text NOT NULL,
	"synced_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holding_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"holding_id" integer NOT NULL,
	"type" text NOT NULL,
	"shares" numeric(19, 6),
	"price" numeric(19, 2) NOT NULL,
	"date" date NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "holdings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"name" text NOT NULL,
	"ticker" text NOT NULL,
	"current_price" numeric(19, 2) NOT NULL,
	"currency" "currency_code" NOT NULL,
	"sector" text NOT NULL,
	"item_type" text,
	"exchange_mic" text,
	"industry" text,
	"price_updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "mortgage_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"mortgage_id" integer NOT NULL,
	"type" text NOT NULL,
	"amount" numeric(19, 2) NOT NULL,
	"interest" numeric(19, 2),
	"principal" numeric(19, 2),
	"date" date NOT NULL,
	"note" text,
	"fixed_years" numeric(4, 1)
);
--> statement-breakpoint
CREATE TABLE "mortgages" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"property_address" text NOT NULL,
	"lender" text NOT NULL,
	"currency" "currency_code" NOT NULL,
	"original_amount" numeric(19, 2) NOT NULL,
	"outstanding_balance" numeric(19, 2) NOT NULL,
	"property_value" numeric(19, 2) NOT NULL,
	"monthly_payment" numeric(19, 2) NOT NULL,
	"interest_rate" numeric(7, 4) NOT NULL,
	"rate_type" text NOT NULL,
	"fixed_until" text,
	"term_years" integer NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text NOT NULL,
	"overpayment_limit" numeric(19, 2)
);
--> statement-breakpoint
CREATE TABLE "payslips" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"month" text NOT NULL,
	"date" date NOT NULL,
	"gross" numeric(19, 2) NOT NULL,
	"tax" numeric(19, 2) NOT NULL,
	"pension" numeric(19, 2) NOT NULL,
	"net" numeric(19, 2) NOT NULL,
	"bonus" numeric(19, 2),
	"currency" "currency_code" DEFAULT 'EUR' NOT NULL,
	"document_storage_key" text,
	"document_file_name" text,
	"document_size_bytes" integer,
	"document_uploaded_at" timestamp,
	CONSTRAINT "payslips_document_fields_chk" CHECK ((("payslips"."document_storage_key" is null and "payslips"."document_file_name" is null and "payslips"."document_size_bytes" is null and "payslips"."document_uploaded_at" is null) or ("payslips"."document_storage_key" is not null and "payslips"."document_file_name" is not null and "payslips"."document_size_bytes" is not null and "payslips"."document_uploaded_at" is not null))),
	CONSTRAINT "payslips_document_size_bytes_chk" CHECK ("payslips"."document_size_bytes" is null or "payslips"."document_size_bytes" > 0)
);
--> statement-breakpoint
CREATE TABLE "pension_pots" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"name" text NOT NULL,
	"provider" text NOT NULL,
	"type" text NOT NULL,
	"balance" numeric(19, 2) NOT NULL,
	"currency" "currency_code" NOT NULL,
	"employee_monthly" numeric(19, 2) NOT NULL,
	"employer_monthly" numeric(19, 2) NOT NULL,
	"investment_strategy" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"color" text,
	"emoji" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "pension_statement_import_rows" (
	"id" serial PRIMARY KEY NOT NULL,
	"import_id" integer NOT NULL,
	"row_order" integer NOT NULL,
	"type" text NOT NULL,
	"amount" numeric(19, 2) NOT NULL,
	"tax_amount" numeric(19, 2) DEFAULT '0' NOT NULL,
	"date" date NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"is_employer" boolean,
	"confidence" numeric(5, 4) DEFAULT '0' NOT NULL,
	"confidence_label" "pension_import_confidence_label" DEFAULT 'low' NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_derived" boolean DEFAULT false NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"collision_warning" jsonb,
	"committed_transaction_id" integer,
	"edited_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pension_statement_imports" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"pot_id" integer NOT NULL,
	"status" "pension_import_status" DEFAULT 'queued' NOT NULL,
	"storage_key" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"file_hash_sha256" text NOT NULL,
	"statement_period_start" date,
	"statement_period_end" date,
	"language_hints" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"model_name" text,
	"model_version" text,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"committed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "pension_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"pot_id" integer NOT NULL,
	"type" text NOT NULL,
	"amount" numeric(19, 2) NOT NULL,
	"tax_amount" numeric(19, 2) DEFAULT '0' NOT NULL,
	"date" date NOT NULL,
	"note" text,
	"is_employer" boolean,
	"document_storage_key" text,
	"document_file_name" text,
	"document_size_bytes" integer,
	"document_uploaded_at" timestamp,
	CONSTRAINT "pension_transactions_document_fields_chk" CHECK ((("pension_transactions"."document_storage_key" is null and "pension_transactions"."document_file_name" is null and "pension_transactions"."document_size_bytes" is null and "pension_transactions"."document_uploaded_at" is null) or ("pension_transactions"."document_storage_key" is not null and "pension_transactions"."document_file_name" is not null and "pension_transactions"."document_size_bytes" is not null and "pension_transactions"."document_uploaded_at" is not null))),
	CONSTRAINT "pension_transactions_document_size_bytes_chk" CHECK ("pension_transactions"."document_size_bytes" is null or "pension_transactions"."document_size_bytes" > 0)
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"address" text NOT NULL,
	"property_type" text NOT NULL,
	"purchase_price" numeric(19, 2) NOT NULL,
	"current_value" numeric(19, 2) NOT NULL,
	"mortgage" numeric(19, 2) NOT NULL,
	"mortgage_id" integer,
	"monthly_rent" numeric(19, 2) NOT NULL,
	"currency" "currency_code" NOT NULL,
	"emoji" text
);
--> statement-breakpoint
CREATE TABLE "property_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"property_id" integer NOT NULL,
	"type" text NOT NULL,
	"amount" numeric(19, 2) NOT NULL,
	"interest" numeric(19, 2),
	"principal" numeric(19, 2),
	"date" date NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "savings_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"name" text NOT NULL,
	"bank" text NOT NULL,
	"balance" numeric(19, 2) NOT NULL,
	"currency" "currency_code" NOT NULL,
	"interest_rate" numeric(7, 4) NOT NULL,
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
	"amount" numeric(19, 2) NOT NULL,
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
CREATE TABLE "stock_exchanges" (
	"id" serial PRIMARY KEY NOT NULL,
	"mic" text NOT NULL,
	"name" text NOT NULL,
	"acronym" text,
	"country" text,
	"country_code" text,
	"city" text,
	"website" text,
	CONSTRAINT "stock_exchanges_mic_unique" UNIQUE("mic")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"age" integer DEFAULT 35 NOT NULL,
	"retirement_age" integer DEFAULT 67 NOT NULL,
	"base_currency" "currency_code" DEFAULT 'EUR' NOT NULL,
	"number_format" text DEFAULT 'en-US' NOT NULL,
	"password_hash" text NOT NULL,
	"password_updated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_age_range_check" CHECK ("users"."age" between 16 and 100),
	CONSTRAINT "users_retirement_age_range_check" CHECK ("users"."retirement_age" between 17 and 80),
	CONSTRAINT "users_retirement_after_age_check" CHECK ("users"."retirement_age" > "users"."age"),
	CONSTRAINT "users_number_format_check" CHECK ("users"."number_format" in ('en-US', 'de-DE'))
);
--> statement-breakpoint
CREATE TABLE "worker_heartbeats" (
	"worker_name" text PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"last_heartbeat_at" timestamp NOT NULL,
	"parser_healthy" boolean DEFAULT false NOT NULL,
	"parser_checked_at" timestamp,
	"parser_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "budget_categories" ADD CONSTRAINT "budget_categories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_transactions" ADD CONSTRAINT "budget_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_transactions" ADD CONSTRAINT "budget_transactions_category_id_budget_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."budget_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_transactions" ADD CONSTRAINT "dashboard_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_debt_id_debts_id_fk" FOREIGN KEY ("debt_id") REFERENCES "public"."debts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debts" ADD CONSTRAINT "debts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holding_price_history" ADD CONSTRAINT "holding_price_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holding_price_history" ADD CONSTRAINT "holding_price_history_holding_id_holdings_id_fk" FOREIGN KEY ("holding_id") REFERENCES "public"."holdings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holding_transactions" ADD CONSTRAINT "holding_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holding_transactions" ADD CONSTRAINT "holding_transactions_holding_id_holdings_id_fk" FOREIGN KEY ("holding_id") REFERENCES "public"."holdings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mortgage_transactions" ADD CONSTRAINT "mortgage_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mortgage_transactions" ADD CONSTRAINT "mortgage_transactions_mortgage_id_mortgages_id_fk" FOREIGN KEY ("mortgage_id") REFERENCES "public"."mortgages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mortgages" ADD CONSTRAINT "mortgages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pension_pots" ADD CONSTRAINT "pension_pots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pension_statement_import_rows" ADD CONSTRAINT "pension_statement_import_rows_import_id_pension_statement_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."pension_statement_imports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pension_statement_import_rows" ADD CONSTRAINT "pension_statement_import_rows_committed_transaction_id_pension_transactions_id_fk" FOREIGN KEY ("committed_transaction_id") REFERENCES "public"."pension_transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pension_statement_imports" ADD CONSTRAINT "pension_statement_imports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pension_statement_imports" ADD CONSTRAINT "pension_statement_imports_pot_id_pension_pots_id_fk" FOREIGN KEY ("pot_id") REFERENCES "public"."pension_pots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pension_transactions" ADD CONSTRAINT "pension_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pension_transactions" ADD CONSTRAINT "pension_transactions_pot_id_pension_pots_id_fk" FOREIGN KEY ("pot_id") REFERENCES "public"."pension_pots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_transactions" ADD CONSTRAINT "property_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_transactions" ADD CONSTRAINT "property_transactions_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_accounts" ADD CONSTRAINT "savings_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_transactions" ADD CONSTRAINT "savings_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_transactions" ADD CONSTRAINT "savings_transactions_account_id_savings_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."savings_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "budget_categories_user_id_idx" ON "budget_categories" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "budget_transactions_user_id_idx" ON "budget_transactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "budget_transactions_user_date_idx" ON "budget_transactions" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "dashboard_transactions_user_id_idx" ON "dashboard_transactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "dashboard_transactions_user_date_idx" ON "dashboard_transactions" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "debt_payments_user_id_idx" ON "debt_payments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "debt_payments_user_date_idx" ON "debt_payments" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "debt_payments_debt_id_idx" ON "debt_payments" USING btree ("debt_id");--> statement-breakpoint
CREATE INDEX "debts_user_id_idx" ON "debts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "goals_user_id_idx" ON "goals" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "holding_price_history_user_date_idx" ON "holding_price_history" USING btree ("user_id","eod_date");--> statement-breakpoint
CREATE INDEX "holding_price_history_holding_date_idx" ON "holding_price_history" USING btree ("holding_id","eod_date");--> statement-breakpoint
CREATE UNIQUE INDEX "holding_price_history_holding_date_unique" ON "holding_price_history" USING btree ("holding_id","eod_date");--> statement-breakpoint
CREATE INDEX "holding_transactions_user_id_idx" ON "holding_transactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "holding_transactions_user_date_idx" ON "holding_transactions" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "holdings_user_id_idx" ON "holdings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "mortgage_transactions_user_id_idx" ON "mortgage_transactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "mortgage_transactions_user_date_idx" ON "mortgage_transactions" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "mortgages_user_id_idx" ON "mortgages" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "payslips_user_id_idx" ON "payslips" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "payslips_user_date_idx" ON "payslips" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "pension_pots_user_id_idx" ON "pension_pots" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "pension_statement_import_rows_import_order_idx" ON "pension_statement_import_rows" USING btree ("import_id","row_order");--> statement-breakpoint
CREATE INDEX "pension_statement_import_rows_import_deleted_idx" ON "pension_statement_import_rows" USING btree ("import_id","is_deleted");--> statement-breakpoint
CREATE INDEX "pension_statement_import_rows_committed_txn_idx" ON "pension_statement_import_rows" USING btree ("committed_transaction_id");--> statement-breakpoint
CREATE INDEX "pension_statement_imports_user_status_idx" ON "pension_statement_imports" USING btree ("user_id","status","created_at");--> statement-breakpoint
CREATE INDEX "pension_statement_imports_pot_id_idx" ON "pension_statement_imports" USING btree ("pot_id");--> statement-breakpoint
CREATE INDEX "pension_statement_imports_hash_idx" ON "pension_statement_imports" USING btree ("file_hash_sha256");--> statement-breakpoint
CREATE INDEX "pension_transactions_user_id_idx" ON "pension_transactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "pension_transactions_user_date_idx" ON "pension_transactions" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "properties_user_id_idx" ON "properties" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "properties_mortgage_id_idx" ON "properties" USING btree ("mortgage_id");--> statement-breakpoint
CREATE INDEX "property_transactions_user_id_idx" ON "property_transactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "property_transactions_user_date_idx" ON "property_transactions" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "savings_accounts_user_id_idx" ON "savings_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "savings_transactions_user_id_idx" ON "savings_transactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "savings_transactions_user_date_idx" ON "savings_transactions" USING btree ("user_id","date");