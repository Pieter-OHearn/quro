CREATE TABLE "auth_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"code_hash" text NOT NULL,
	"purpose" text NOT NULL,
	"user_id" integer,
	"expires_at" timestamp NOT NULL,
	"consumed_at" timestamp,
	"consumed_by_user_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "auth_codes_purpose_check" CHECK ("auth_codes"."purpose" in ('registration', 'password_reset')),
	CONSTRAINT "auth_codes_user_check" CHECK (("auth_codes"."purpose" = 'password_reset') = ("auth_codes"."user_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "last_used_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "user_agent" text;--> statement-breakpoint
ALTER TABLE "auth_codes" ADD CONSTRAINT "auth_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_codes" ADD CONSTRAINT "auth_codes_consumed_by_user_id_users_id_fk" FOREIGN KEY ("consumed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_codes_code_hash_idx" ON "auth_codes" USING btree ("code_hash");--> statement-breakpoint
CREATE INDEX "auth_codes_expires_at_idx" ON "auth_codes" USING btree ("expires_at");--> statement-breakpoint
-- Existing rows hold raw cookie tokens. Store their SHA-256 digest instead, which keeps
-- every signed-in browser working: the backend hashes the cookie before each lookup.
UPDATE "sessions" SET "id" = encode(sha256(convert_to("id", 'UTF8')), 'hex'), "last_used_at" = "created_at";--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_id_digest_check" CHECK ("sessions"."id" ~ '^[0-9a-f]{64}$');