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
CREATE FUNCTION "partner_links_enforce_single_link"() RETURNS trigger AS $$
BEGIN
  -- Serialise concurrent writers per user, in a fixed order to avoid deadlocks.
  PERFORM pg_advisory_xact_lock(
    hashtext('partner_links'),
    LEAST(NEW.requester_id, NEW.addressee_id)
  );
  PERFORM pg_advisory_xact_lock(
    hashtext('partner_links'),
    GREATEST(NEW.requester_id, NEW.addressee_id)
  );

  IF EXISTS (
    SELECT 1
    FROM partner_links
    WHERE id IS DISTINCT FROM NEW.id
      AND (
        requester_id IN (NEW.requester_id, NEW.addressee_id)
        OR addressee_id IN (NEW.requester_id, NEW.addressee_id)
      )
  ) THEN
    RAISE EXCEPTION 'a user can only belong to one partner link'
      USING ERRCODE = 'unique_violation', CONSTRAINT = 'partner_links_one_link_per_user';
  END IF;

  RETURN NEW;
END
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "partner_links_one_link_per_user"
BEFORE INSERT OR UPDATE OF "requester_id", "addressee_id" ON "partner_links"
FOR EACH ROW EXECUTE FUNCTION "partner_links_enforce_single_link"();
