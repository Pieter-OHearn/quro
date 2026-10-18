CREATE TABLE "oidc_identities" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"issuer" text NOT NULL,
	"subject" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oidc_login_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"state" text NOT NULL,
	"nonce" text NOT NULL,
	"code_verifier" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "oidc_login_attempts_id_digest_check" CHECK ("oidc_login_attempts"."id" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "oidc_identities" ADD CONSTRAINT "oidc_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "oidc_identities_issuer_subject_idx" ON "oidc_identities" USING btree ("issuer","subject");--> statement-breakpoint
CREATE UNIQUE INDEX "oidc_identities_user_issuer_idx" ON "oidc_identities" USING btree ("user_id","issuer");--> statement-breakpoint
CREATE INDEX "oidc_login_attempts_expires_at_idx" ON "oidc_login_attempts" USING btree ("expires_at");