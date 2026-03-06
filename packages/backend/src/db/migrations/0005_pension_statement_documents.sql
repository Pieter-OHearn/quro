CREATE TABLE "pension_statement_documents" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "pot_id" integer NOT NULL,
  "transaction_id" integer NOT NULL,
  "storage_key" text NOT NULL,
  "file_name" text NOT NULL,
  "mime_type" text NOT NULL,
  "size_bytes" integer NOT NULL,
  "uploaded_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "pension_statement_documents_mime_pdf_chk" CHECK ("mime_type" = 'application/pdf'),
  CONSTRAINT "pension_statement_documents_size_bytes_chk" CHECK ("size_bytes" > 0),
  CONSTRAINT "pension_statement_documents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade,
  CONSTRAINT "pension_statement_documents_pot_id_pension_pots_id_fk" FOREIGN KEY ("pot_id") REFERENCES "public"."pension_pots"("id") ON DELETE cascade,
  CONSTRAINT "pension_statement_documents_transaction_id_pension_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."pension_transactions"("id") ON DELETE cascade
);

CREATE INDEX "pension_statement_documents_user_id_idx" ON "pension_statement_documents" USING btree ("user_id");
CREATE INDEX "pension_statement_documents_pot_id_idx" ON "pension_statement_documents" USING btree ("pot_id");
CREATE UNIQUE INDEX "pension_statement_documents_transaction_id_uidx" ON "pension_statement_documents" USING btree ("transaction_id");
CREATE UNIQUE INDEX "pension_statement_documents_storage_key_uidx" ON "pension_statement_documents" USING btree ("storage_key");
