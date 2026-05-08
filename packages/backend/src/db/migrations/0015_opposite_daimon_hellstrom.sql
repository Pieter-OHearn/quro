ALTER TABLE "currency_rates" ALTER COLUMN "updated_at" SET DATA TYPE timestamp USING "updated_at"::timestamp;--> statement-breakpoint
ALTER TABLE "currency_rates" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "currency_rates" ADD COLUMN "provider" text;--> statement-breakpoint
UPDATE "currency_rates" SET "provider" = 'seed' WHERE "provider" IS NULL;--> statement-breakpoint
ALTER TABLE "currency_rates" ALTER COLUMN "provider" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "currency_rates" ADD COLUMN "source_date" date;--> statement-breakpoint
UPDATE "currency_rates" SET "source_date" = "updated_at"::date WHERE "source_date" IS NULL;--> statement-breakpoint
ALTER TABLE "currency_rates" ALTER COLUMN "source_date" SET NOT NULL;--> statement-breakpoint
DELETE FROM "currency_rates" existing
USING "currency_rates" chosen
WHERE existing."from_currency" = chosen."from_currency"
  AND existing."to_currency" = chosen."to_currency"
  AND (
    existing."updated_at" < chosen."updated_at"
    OR (
      existing."updated_at" = chosen."updated_at"
      AND existing."id" < chosen."id"
    )
  );--> statement-breakpoint
CREATE UNIQUE INDEX "currency_rates_from_to_unique" ON "currency_rates" USING btree ("from_currency","to_currency");
