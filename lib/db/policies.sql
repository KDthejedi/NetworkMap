-- Network Map RLS policies (spec section 11.3).
-- Strategy: every user-scoped table enables RLS and constrains rows to the
-- session's app.current_user_id GUC, set by withUserScope() in lib/db/client.ts.
-- The admin role (DATABASE_URL owner) bypasses via BYPASSRLS where applicable;
-- in production, application code uses an unprivileged role with RLS enforced.

-- helper for readability
CREATE OR REPLACE FUNCTION app_current_user_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid
$$;

-- enable RLS on every user-scoped table
ALTER TABLE users                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE clusters                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_clusters         ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_fields            ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_field_values      ENABLE ROW LEVEL SECURITY;
ALTER TABLE topic_tags               ENABLE ROW LEVEL SECURITY;
ALTER TABLE touchpoints              ENABLE ROW LEVEL SECURITY;
ALTER TABLE touchpoint_topic_tags    ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_goals            ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_runs               ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendations          ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendation_feedback  ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications            ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log                ENABLE ROW LEVEL SECURITY;
ALTER TABLE briefing_sessions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE briefing_messages        ENABLE ROW LEVEL SECURITY;
ALTER TABLE export_jobs              ENABLE ROW LEVEL SECURITY;

-- generic policy macro
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'clusters','contacts','contact_clusters','custom_fields','custom_field_values',
      'topic_tags','touchpoints','touchpoint_topic_tags','goals','contact_goals',
      'agent_runs','recommendations','recommendation_feedback','notifications',
      'push_subscriptions','audit_log','briefing_sessions','briefing_messages',
      'export_jobs'
    ])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_user_isolation ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_user_isolation ON %I FOR ALL ' ||
      'USING (user_id = app_current_user_id()) WITH CHECK (user_id = app_current_user_id())',
      t, t
    );
  END LOOP;
END $$;

-- users table: caller can only see/modify their own row
DROP POLICY IF EXISTS users_self_only ON users;
CREATE POLICY users_self_only ON users
  FOR ALL
  USING (id = app_current_user_id())
  WITH CHECK (id = app_current_user_id());

-- touchpoint_topic_tags has no user_id; constrain via touchpoint
DROP POLICY IF EXISTS touchpoint_topic_tags_user_isolation ON touchpoint_topic_tags;
CREATE POLICY touchpoint_topic_tags_user_isolation ON touchpoint_topic_tags
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM touchpoints tp
            WHERE tp.id = touchpoint_topic_tags.touchpoint_id
              AND tp.user_id = app_current_user_id())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM touchpoints tp
            WHERE tp.id = touchpoint_topic_tags.touchpoint_id
              AND tp.user_id = app_current_user_id())
  );

-- ---------- triggers ----------

-- Tier 2+ contacts must reference a tier-1 contact owned by the same user.
CREATE OR REPLACE FUNCTION enforce_known_through() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  bridge_tier smallint;
  bridge_user uuid;
BEGIN
  IF NEW.tier >= 2 THEN
    IF NEW.known_through_contact_id IS NULL THEN
      RAISE EXCEPTION 'tier % requires known_through_contact_id', NEW.tier
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT tier, user_id INTO bridge_tier, bridge_user
      FROM contacts WHERE id = NEW.known_through_contact_id;
    IF bridge_tier IS NULL THEN
      RAISE EXCEPTION 'known_through_contact_id not found';
    END IF;
    IF bridge_user <> NEW.user_id THEN
      RAISE EXCEPTION 'known_through_contact_id must belong to same user';
    END IF;
    IF bridge_tier <> 1 THEN
      RAISE EXCEPTION 'known_through_contact_id must reference a tier-1 contact';
    END IF;
  ELSIF NEW.tier = 1 AND NEW.known_through_contact_id IS NOT NULL THEN
    -- promotion to tier 1 nulls the bridge (spec section 4.3 constraints)
    NEW.known_through_contact_id := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS contacts_known_through ON contacts;
CREATE TRIGGER contacts_known_through
  BEFORE INSERT OR UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION enforce_known_through();

-- Touchpoint locked-after-7-days enforcement (spec section 4.7).
CREATE OR REPLACE FUNCTION enforce_touchpoint_lock() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.locked_at IS NOT NULL AND OLD.locked_at <= now() THEN
      RAISE EXCEPTION 'touchpoint % is locked', OLD.id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS touchpoints_lock_check ON touchpoints;
CREATE TRIGGER touchpoints_lock_check
  BEFORE UPDATE OR DELETE ON touchpoints
  FOR EACH ROW EXECUTE FUNCTION enforce_touchpoint_lock();

-- Auto-set locked_at = created_at + 7 days on insert (spec section 4.7).
CREATE OR REPLACE FUNCTION set_touchpoint_lock_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.locked_at IS NULL THEN
    NEW.locked_at := COALESCE(NEW.created_at, now()) + interval '7 days';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS touchpoints_set_lock ON touchpoints;
CREATE TRIGGER touchpoints_set_lock
  BEFORE INSERT ON touchpoints
  FOR EACH ROW EXECUTE FUNCTION set_touchpoint_lock_at();

-- updated_at auto-bump on UPDATE
CREATE OR REPLACE FUNCTION bump_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'users','clusters','contacts','custom_fields','custom_field_values',
      'touchpoints','goals','recommendations','briefing_sessions'
    ])
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_bump_updated_at ON %I', t, t);
    EXECUTE format(
      'CREATE TRIGGER %I_bump_updated_at BEFORE UPDATE ON %I ' ||
      'FOR EACH ROW EXECUTE FUNCTION bump_updated_at()',
      t, t
    );
  END LOOP;
END $$;
