CREATE TABLE "employments" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"employer_name" text,
	"employment_type" text NOT NULL,
	"service_start_date" date,
	"end_date" date,
	"notice_period_months" integer,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "employments_type_check" CHECK ("employments"."employment_type" in ('employed', 'self_employed', 'other')),
	CONSTRAINT "employments_notice_period_months_check" CHECK ("employments"."notice_period_months" is null or "employments"."notice_period_months" between 0 and 24),
	CONSTRAINT "employments_date_order_check" CHECK ("employments"."end_date" is null or "employments"."service_start_date" is null or "employments"."end_date" >= "employments"."service_start_date")
);
--> statement-breakpoint
INSERT INTO "employments" ("user_id", "employment_type", "notice_period_months", "is_primary", "updated_at")
SELECT "user_id", "employment_type", "notice_period_months", true, "updated_at"
FROM "employment_profiles"
WHERE "employment_type" IN ('employed', 'self_employed', 'other');
--> statement-breakpoint
ALTER TABLE "employment_profiles" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "employment_profiles" CASCADE;--> statement-breakpoint
ALTER TABLE "payslips" ADD COLUMN "employment_id" integer;--> statement-breakpoint
ALTER TABLE "plan_assumptions" ADD COLUMN "ww_weekly_requirement" text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "plan_assumptions" ADD COLUMN "ww_duration_months" integer;--> statement-breakpoint
ALTER TABLE "plan_assumptions" ADD COLUMN "ww_duration_confirmed_at" date;--> statement-breakpoint
ALTER TABLE "plan_assumptions" ADD COLUMN "severance_monthly_salary_override" numeric(19, 2);--> statement-breakpoint
ALTER TABLE "employments" ADD CONSTRAINT "employments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "employments_user_id_idx" ON "employments" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "employments_primary_user_unique" ON "employments" USING btree ("user_id") WHERE "employments"."is_primary" = true;--> statement-breakpoint
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_employment_id_employments_id_fk" FOREIGN KEY ("employment_id") REFERENCES "public"."employments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payslips_employment_id_idx" ON "payslips" USING btree ("employment_id");--> statement-breakpoint
ALTER TABLE "plan_assumptions" ADD CONSTRAINT "plan_assumptions_ww_weekly_requirement_check" CHECK ("plan_assumptions"."ww_weekly_requirement" in ('unknown', 'met', 'not_met'));--> statement-breakpoint
ALTER TABLE "plan_assumptions" ADD CONSTRAINT "plan_assumptions_ww_duration_months_check" CHECK ("plan_assumptions"."ww_duration_months" is null or "plan_assumptions"."ww_duration_months" between 0 and 24);--> statement-breakpoint
ALTER TABLE "plan_assumptions" ADD CONSTRAINT "plan_assumptions_severance_salary_check" CHECK ("plan_assumptions"."severance_monthly_salary_override" is null or "plan_assumptions"."severance_monthly_salary_override" >= 0);
