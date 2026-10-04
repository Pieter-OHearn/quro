CREATE TABLE "bunq_payment_progress" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"account_id" integer NOT NULL,
	"kind" text NOT NULL,
	"newer_than" text,
	"next_page_url" text,
	"complete" boolean DEFAULT false NOT NULL,
	"started_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bunq_payment_progress" ADD CONSTRAINT "bunq_payment_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bunq_payment_progress_account_kind_unique" ON "bunq_payment_progress" USING btree ("user_id","account_id","kind");