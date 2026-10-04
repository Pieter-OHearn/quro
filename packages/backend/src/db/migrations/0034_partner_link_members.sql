CREATE TABLE "partner_link_members" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"link_id" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "partner_link_members" ADD CONSTRAINT "partner_link_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_link_members" ADD CONSTRAINT "partner_link_members_link_id_partner_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."partner_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
DO $$
DECLARE
  duplicates text;
BEGIN
  SELECT string_agg(
    format('user %s in %s links (ids %s)', member_id, link_count, link_ids),
    '; ' ORDER BY member_id
  )
  INTO duplicates
  FROM (
    SELECT
      member_id,
      count(*) AS link_count,
      string_agg(link_id::text, ',' ORDER BY link_id) AS link_ids
    FROM (
      SELECT requester_id AS member_id, id AS link_id FROM partner_links
      UNION ALL
      SELECT addressee_id AS member_id, id AS link_id FROM partner_links
    ) AS members
    GROUP BY member_id
    HAVING count(*) > 1
  ) AS offenders;

  IF duplicates IS NOT NULL THEN
    RAISE EXCEPTION 'partner_links contains users with more than one link: %. Resolve these rows manually before migrating.', duplicates
      USING ERRCODE = 'check_violation';
  END IF;
END
$$;--> statement-breakpoint
INSERT INTO "partner_link_members" ("user_id", "link_id")
SELECT "requester_id", "id" FROM "partner_links"
UNION ALL
SELECT "addressee_id", "id" FROM "partner_links";
