CREATE TABLE "account_deletions" (
	"id" serial PRIMARY KEY NOT NULL,
	"deleted_user_id" integer NOT NULL,
	"deleted_at" timestamp DEFAULT now() NOT NULL,
	"row_counts" jsonb NOT NULL,
	"document_count" integer NOT NULL,
	"documents_deleted" integer,
	"documents_failed_keys" jsonb,
	"documents_checked_at" timestamp
);
--> statement-breakpoint
CREATE INDEX "account_deletions_deleted_at_idx" ON "account_deletions" USING btree ("deleted_at");