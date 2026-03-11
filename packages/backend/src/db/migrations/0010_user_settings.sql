ALTER TABLE "users" ADD COLUMN "first_name" text;
ALTER TABLE "users" ADD COLUMN "last_name" text;
ALTER TABLE "users" ADD COLUMN "location" text DEFAULT '' NOT NULL;
ALTER TABLE "users" ADD COLUMN "age" integer DEFAULT 35 NOT NULL;
ALTER TABLE "users" ADD COLUMN "retirement_age" integer DEFAULT 67 NOT NULL;
ALTER TABLE "users" ADD COLUMN "base_currency" "currency_code" DEFAULT 'EUR' NOT NULL;
ALTER TABLE "users" ADD COLUMN "password_updated_at" timestamp;
--> statement-breakpoint
UPDATE "users"
SET
  "first_name" = split_part(regexp_replace(trim("name"), '[[:space:]]+', ' ', 'g'), ' ', 1),
  "last_name" = trim(
    substr(
      regexp_replace(trim("name"), '[[:space:]]+', ' ', 'g'),
      length(split_part(regexp_replace(trim("name"), '[[:space:]]+', ' ', 'g'), ' ', 1)) + 1
    )
  )
WHERE "first_name" IS NULL OR "last_name" IS NULL;
--> statement-breakpoint
UPDATE "users"
SET
  "first_name" = "name",
  "last_name" = ''
WHERE trim(coalesce("first_name", '')) = '';
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "first_name" SET NOT NULL;
ALTER TABLE "users" ALTER COLUMN "last_name" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_age_range_check" CHECK ("users"."age" between 16 and 100);
ALTER TABLE "users" ADD CONSTRAINT "users_retirement_age_range_check" CHECK ("users"."retirement_age" between 17 and 80);
ALTER TABLE "users" ADD CONSTRAINT "users_retirement_after_age_check" CHECK ("users"."retirement_age" > "users"."age");
