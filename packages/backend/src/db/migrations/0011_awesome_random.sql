ALTER TABLE "goals" ADD COLUMN "source_type" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "source_id" integer;--> statement-breakpoint
UPDATE "goals" SET "source_type" = 'salary_latest_gross', "source_id" = null WHERE "type" = 'salary';--> statement-breakpoint
CREATE INDEX "goals_source_idx" ON "goals" USING btree ("source_type","source_id");--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_source_type_check" CHECK ("goals"."source_type" in ('manual', 'salary_latest_gross', 'savings_account'));--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_source_id_check" CHECK ((("goals"."source_type" = 'savings_account' and "goals"."source_id" is not null and "goals"."source_id" > 0) or ("goals"."source_type" <> 'savings_account' and "goals"."source_id" is null)));
