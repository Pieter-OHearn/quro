ALTER TABLE "users" ADD COLUMN "number_format" text DEFAULT 'en-US' NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_number_format_check" CHECK ("users"."number_format" in ('en-US', 'de-DE'));
