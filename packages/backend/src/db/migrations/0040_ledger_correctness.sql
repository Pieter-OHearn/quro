ALTER TABLE "debt_payments" ADD COLUMN "unapplied_principal" numeric(19, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "mortgage_transactions" ADD COLUMN "unapplied_principal" numeric(19, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "property_transactions" ADD COLUMN "unapplied_principal" numeric(19, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "property_transactions" ADD COLUMN "repayment_target" text;--> statement-breakpoint
ALTER TABLE "property_transactions" ADD COLUMN "repayment_mortgage_id" integer;--> statement-breakpoint
ALTER TABLE "property_transactions" ADD CONSTRAINT "property_transactions_repayment_mortgage_id_mortgages_id_fk" FOREIGN KEY ("repayment_mortgage_id") REFERENCES "public"."mortgages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
DO $$
DECLARE
  duplicates text;
BEGIN
  SELECT string_agg(
    format('pot %s of user %s: imports %s', pot_id, user_id, import_ids),
    '; ' ORDER BY user_id, pot_id, import_ids
  )
  INTO duplicates
  FROM (
    SELECT user_id, pot_id, string_agg(id::text, ', ' ORDER BY id) AS import_ids
    FROM pension_statement_imports
    WHERE status = 'committed'
    GROUP BY user_id, pot_id, file_hash_sha256
    HAVING count(*) > 1
  ) AS offenders;

  IF duplicates IS NOT NULL THEN
    RAISE EXCEPTION 'The same pension statement file was committed more than once to one pot: %. Nothing was changed. For each group, keep one import; for every other import, delete the pension transactions it created (pension_statement_import_rows.committed_transaction_id) with the previous release, then set that import''s status to ''cancelled''. Run the migration again afterwards.', duplicates
      USING ERRCODE = 'check_violation';
  END IF;
END
$$;--> statement-breakpoint
CREATE UNIQUE INDEX "pension_statement_imports_committed_statement_unique" ON "pension_statement_imports" USING btree ("user_id","pot_id","file_hash_sha256") WHERE "pension_statement_imports"."status" = 'committed';--> statement-breakpoint
CREATE INDEX "property_transactions_repayment_mortgage_id_idx" ON "property_transactions" USING btree ("repayment_mortgage_id");--> statement-breakpoint
ALTER TABLE "property_transactions" ADD CONSTRAINT "property_transactions_repayment_target_check" CHECK ("property_transactions"."repayment_target" is null or "property_transactions"."repayment_target" = 'mortgage' or ("property_transactions"."repayment_target" = 'property' and "property_transactions"."repayment_mortgage_id" is null));