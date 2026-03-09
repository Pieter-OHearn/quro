ALTER TABLE "pension_transactions"
ADD COLUMN "document_storage_key" text,
ADD COLUMN "document_file_name" text,
ADD COLUMN "document_size_bytes" integer,
ADD COLUMN "document_uploaded_at" timestamp;

--> statement-breakpoint

ALTER TABLE "payslips"
ADD COLUMN "document_storage_key" text,
ADD COLUMN "document_file_name" text,
ADD COLUMN "document_size_bytes" integer,
ADD COLUMN "document_uploaded_at" timestamp;

--> statement-breakpoint

UPDATE "pension_transactions" AS "transactions"
SET
  "document_storage_key" = "documents"."storage_key",
  "document_file_name" = "documents"."file_name",
  "document_size_bytes" = "documents"."size_bytes",
  "document_uploaded_at" = "documents"."uploaded_at"
FROM "pension_statement_documents" AS "documents"
WHERE "documents"."transaction_id" = "transactions"."id";

--> statement-breakpoint

ALTER TABLE "pension_transactions"
ADD CONSTRAINT "pension_transactions_document_fields_chk"
CHECK (
  (
    "document_storage_key" IS NULL
    AND "document_file_name" IS NULL
    AND "document_size_bytes" IS NULL
    AND "document_uploaded_at" IS NULL
  )
  OR (
    "document_storage_key" IS NOT NULL
    AND "document_file_name" IS NOT NULL
    AND "document_size_bytes" IS NOT NULL
    AND "document_uploaded_at" IS NOT NULL
  )
);

ALTER TABLE "pension_transactions"
ADD CONSTRAINT "pension_transactions_document_size_bytes_chk"
CHECK ("document_size_bytes" IS NULL OR "document_size_bytes" > 0);

ALTER TABLE "payslips"
ADD CONSTRAINT "payslips_document_fields_chk"
CHECK (
  (
    "document_storage_key" IS NULL
    AND "document_file_name" IS NULL
    AND "document_size_bytes" IS NULL
    AND "document_uploaded_at" IS NULL
  )
  OR (
    "document_storage_key" IS NOT NULL
    AND "document_file_name" IS NOT NULL
    AND "document_size_bytes" IS NOT NULL
    AND "document_uploaded_at" IS NOT NULL
  )
);

ALTER TABLE "payslips"
ADD CONSTRAINT "payslips_document_size_bytes_chk"
CHECK ("document_size_bytes" IS NULL OR "document_size_bytes" > 0);

--> statement-breakpoint

DROP TABLE "pension_statement_documents";
