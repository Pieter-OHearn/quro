CREATE TABLE "csv_import_rows" (
	"id" serial PRIMARY KEY NOT NULL,
	"import_id" integer NOT NULL,
	"row_number" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"external_id" text NOT NULL,
	"date" date NOT NULL,
	"amount" numeric(19, 2) NOT NULL,
	"currency" "currency_code" NOT NULL,
	"description" text NOT NULL,
	"merchant" text,
	"category_name" text,
	"error" text,
	"transaction_id" integer,
	CONSTRAINT "csv_import_rows_status_check" CHECK ("csv_import_rows"."status" in ('pending', 'committed', 'duplicate', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "csv_imports" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"kind" text NOT NULL,
	"account_id" integer,
	"source" text NOT NULL,
	"file_name" text,
	"file_sha256" text NOT NULL,
	"mapping" jsonb NOT NULL,
	"status" text DEFAULT 'staged' NOT NULL,
	"closing_balance" numeric(19, 2),
	"closing_date" date,
	"closing_origin" text,
	"closing_row_number" integer,
	"adjustment_transaction_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"committed_at" timestamp,
	CONSTRAINT "csv_imports_kind_check" CHECK ("csv_imports"."kind" in ('savings', 'budget')),
	CONSTRAINT "csv_imports_status_check" CHECK ("csv_imports"."status" in ('staged', 'committed', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "import_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"kind" text NOT NULL,
	"source" text NOT NULL,
	"mapping" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "import_profiles_kind_check" CHECK ("import_profiles"."kind" in ('savings', 'budget'))
);
--> statement-breakpoint
ALTER TABLE "budget_transactions" ADD COLUMN "import_id" integer;--> statement-breakpoint
ALTER TABLE "budget_transactions" ADD COLUMN "import_source" text;--> statement-breakpoint
ALTER TABLE "budget_transactions" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "savings_transactions" ADD COLUMN "import_id" integer;--> statement-breakpoint
ALTER TABLE "savings_transactions" ADD COLUMN "import_source" text;--> statement-breakpoint
ALTER TABLE "savings_transactions" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "csv_import_rows" ADD CONSTRAINT "csv_import_rows_import_id_csv_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."csv_imports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "csv_imports" ADD CONSTRAINT "csv_imports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "csv_imports" ADD CONSTRAINT "csv_imports_account_id_savings_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."savings_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_profiles" ADD CONSTRAINT "import_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "csv_import_rows_import_row_unique" ON "csv_import_rows" USING btree ("import_id","row_number");--> statement-breakpoint
CREATE INDEX "csv_import_rows_import_status_idx" ON "csv_import_rows" USING btree ("import_id","status");--> statement-breakpoint
CREATE INDEX "csv_imports_user_id_idx" ON "csv_imports" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "csv_imports_account_id_idx" ON "csv_imports" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "import_profiles_user_kind_source_unique" ON "import_profiles" USING btree ("user_id","kind","source");--> statement-breakpoint
ALTER TABLE "budget_transactions" ADD CONSTRAINT "budget_transactions_import_id_csv_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."csv_imports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_transactions" ADD CONSTRAINT "savings_transactions_import_id_csv_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."csv_imports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "budget_transactions_import_key_unique" ON "budget_transactions" USING btree ("user_id","import_source","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "savings_transactions_import_key_unique" ON "savings_transactions" USING btree ("account_id","import_source","external_id");