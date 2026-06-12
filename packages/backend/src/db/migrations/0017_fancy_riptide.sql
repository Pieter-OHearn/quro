CREATE TYPE "public"."partner_link_status" AS ENUM('pending', 'accepted');--> statement-breakpoint
CREATE TABLE "partner_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"requester_id" integer NOT NULL,
	"addressee_id" integer NOT NULL,
	"status" "partner_link_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"responded_at" timestamp,
	CONSTRAINT "partner_links_no_self_link_check" CHECK ("partner_links"."requester_id" <> "partner_links"."addressee_id")
);
--> statement-breakpoint
ALTER TABLE "mortgages" ADD COLUMN "is_joint" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "is_joint" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "savings_accounts" ADD COLUMN "is_joint" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "partner_links" ADD CONSTRAINT "partner_links_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_links" ADD CONSTRAINT "partner_links_addressee_id_users_id_fk" FOREIGN KEY ("addressee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "partner_links_requester_id_unique" ON "partner_links" USING btree ("requester_id");--> statement-breakpoint
CREATE UNIQUE INDEX "partner_links_addressee_id_unique" ON "partner_links" USING btree ("addressee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "partner_links_pair_unique" ON "partner_links" USING btree (LEAST("requester_id", "addressee_id"), GREATEST("requester_id", "addressee_id"));