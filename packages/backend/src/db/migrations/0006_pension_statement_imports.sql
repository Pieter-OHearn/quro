CREATE TYPE "public"."pension_import_status" AS ENUM(
  'queued',
  'processing',
  'ready_for_review',
  'failed',
  'committed',
  'expired',
  'cancelled'
);

CREATE TYPE "public"."pension_import_confidence_label" AS ENUM('high', 'medium', 'low');

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
  "committed_at" timestamp,
  CONSTRAINT "pension_statement_imports_size_bytes_chk" CHECK ("size_bytes" > 0),
  CONSTRAINT "pension_statement_imports_mime_pdf_chk" CHECK ("mime_type" = 'application/pdf'),
  CONSTRAINT "pension_statement_imports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade,
  CONSTRAINT "pension_statement_imports_pot_id_pension_pots_id_fk" FOREIGN KEY ("pot_id") REFERENCES "public"."pension_pots"("id") ON DELETE cascade
);

CREATE TABLE "pension_statement_import_rows" (
  "id" serial PRIMARY KEY NOT NULL,
  "import_id" integer NOT NULL,
  "row_order" integer NOT NULL,
  "type" text NOT NULL,
  "amount" numeric NOT NULL,
  "tax_amount" numeric DEFAULT '0' NOT NULL,
  "date" date NOT NULL,
  "note" text DEFAULT '' NOT NULL,
  "is_employer" boolean,
  "confidence" numeric DEFAULT '0' NOT NULL,
  "confidence_label" "pension_import_confidence_label" DEFAULT 'low' NOT NULL,
  "evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "is_derived" boolean DEFAULT false NOT NULL,
  "is_deleted" boolean DEFAULT false NOT NULL,
  "collision_warning" jsonb,
  "committed_transaction_id" integer,
  "edited_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "pension_statement_import_rows_import_id_pension_statement_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."pension_statement_imports"("id") ON DELETE cascade,
  CONSTRAINT "pension_statement_import_rows_committed_transaction_id_pension_transactions_id_fk" FOREIGN KEY ("committed_transaction_id") REFERENCES "public"."pension_transactions"("id") ON DELETE set null
);

CREATE INDEX "pension_statement_imports_user_status_idx" ON "pension_statement_imports" USING btree ("user_id", "status", "created_at");
CREATE INDEX "pension_statement_imports_pot_id_idx" ON "pension_statement_imports" USING btree ("pot_id");
CREATE INDEX "pension_statement_imports_hash_idx" ON "pension_statement_imports" USING btree ("file_hash_sha256");
CREATE INDEX "pension_statement_import_rows_import_order_idx" ON "pension_statement_import_rows" USING btree ("import_id", "row_order");
CREATE INDEX "pension_statement_import_rows_import_deleted_idx" ON "pension_statement_import_rows" USING btree ("import_id", "is_deleted");
CREATE INDEX "pension_statement_import_rows_committed_txn_idx" ON "pension_statement_import_rows" USING btree ("committed_transaction_id");
