CREATE TABLE "bunq_oauth_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"state_hash" text NOT NULL,
	"user_id" integer NOT NULL,
	"destination" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"consumed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bunq_oauth_attempts_destination_check" CHECK ("bunq_oauth_attempts"."destination" in ('savings', 'settings'))
);
--> statement-breakpoint
ALTER TABLE "bunq_oauth_attempts" ADD CONSTRAINT "bunq_oauth_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bunq_oauth_attempts_state_hash_idx" ON "bunq_oauth_attempts" USING btree ("state_hash");--> statement-breakpoint
CREATE INDEX "bunq_oauth_attempts_expires_at_idx" ON "bunq_oauth_attempts" USING btree ("expires_at");