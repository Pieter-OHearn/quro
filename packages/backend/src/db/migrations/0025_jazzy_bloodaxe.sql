CREATE TABLE "employment_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"employment_type" text,
	"tenure_months" integer,
	"notice_period_months" integer,
	"has_dependents" boolean,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "employment_profiles_type_check" CHECK ("employment_profiles"."employment_type" is null or "employment_profiles"."employment_type" in ('employed', 'self_employed', 'other')),
	CONSTRAINT "employment_profiles_tenure_months_check" CHECK ("employment_profiles"."tenure_months" is null or "employment_profiles"."tenure_months" between 0 and 720),
	CONSTRAINT "employment_profiles_notice_period_months_check" CHECK ("employment_profiles"."notice_period_months" is null or "employment_profiles"."notice_period_months" between 0 and 24)
);
--> statement-breakpoint
CREATE TABLE "net_worth_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"snapshot_date" date NOT NULL,
	"base_currency" "currency_code" NOT NULL,
	"savings" numeric(19, 2) NOT NULL,
	"brokerage" numeric(19, 2) NOT NULL,
	"property_equity" numeric(19, 2) NOT NULL,
	"pension" numeric(19, 2) NOT NULL,
	"liabilities" numeric(19, 2) NOT NULL,
	"total_value" numeric(19, 2) NOT NULL,
	"is_estimated" boolean DEFAULT false NOT NULL,
	"computed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_assumptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"lean_burn_override" numeric(19, 2),
	"emergency_lifestyle_pct" numeric(5, 4),
	"excluded_tiers" jsonb,
	"count_full_joint_balances" boolean,
	"benefit_monthly_override" numeric(19, 2),
	"benefit_max_months_override" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "plan_assumptions_lean_burn_check" CHECK ("plan_assumptions"."lean_burn_override" is null or "plan_assumptions"."lean_burn_override" >= 0),
	CONSTRAINT "plan_assumptions_lifestyle_check" CHECK ("plan_assumptions"."emergency_lifestyle_pct" is null or "plan_assumptions"."emergency_lifestyle_pct" between 0 and 1),
	CONSTRAINT "plan_assumptions_benefit_monthly_check" CHECK ("plan_assumptions"."benefit_monthly_override" is null or "plan_assumptions"."benefit_monthly_override" >= 0),
	CONSTRAINT "plan_assumptions_benefit_months_check" CHECK ("plan_assumptions"."benefit_max_months_override" is null or "plan_assumptions"."benefit_max_months_override" between 0 and 120)
);
--> statement-breakpoint
ALTER TABLE "budget_categories" ADD COLUMN "expense_class" text DEFAULT 'essential' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "jurisdiction" text DEFAULT 'GENERIC' NOT NULL;--> statement-breakpoint
ALTER TABLE "employment_profiles" ADD CONSTRAINT "employment_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "net_worth_snapshots" ADD CONSTRAINT "net_worth_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_assumptions" ADD CONSTRAINT "plan_assumptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "employment_profiles_user_id_unique" ON "employment_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "net_worth_snapshots_user_id_idx" ON "net_worth_snapshots" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "net_worth_snapshots_user_date_unique" ON "net_worth_snapshots" USING btree ("user_id","snapshot_date");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_assumptions_user_id_unique" ON "plan_assumptions" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "budget_categories" ADD CONSTRAINT "budget_categories_expense_class_check" CHECK ("budget_categories"."expense_class" in ('essential', 'discretionary', 'employment_linked'));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_jurisdiction_check" CHECK ("users"."jurisdiction" in ('NL', 'AU', 'GENERIC'));--> statement-breakpoint
UPDATE "budget_categories"
SET "expense_class" = 'discretionary'
WHERE "name" IN (
	'Restaurants & Bars',
	'Shopping',
	'Subscriptions',
	'Entertainment',
	'Travel',
	'Personal Care'
);--> statement-breakpoint
UPDATE "budget_categories"
SET "expense_class" = 'essential'
WHERE "name" IN (
	'Groceries',
	'Utilities',
	'Health',
	'Transport',
	'Fuel',
	'Uncategorised'
);
