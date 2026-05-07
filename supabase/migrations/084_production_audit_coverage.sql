-- ============================================================
-- Migration 084 – Production Audit Coverage
--
-- Closes 11 high-impact audit gaps by attaching audit_log_trigger()
-- to tables that currently have app writes but no audit coverage:
--
--   classes, class_teachers, events, event_rsvps,
--   fee_types, tuition_configs, discounts,
--   school_years, holidays, academic_periods, teacher_profiles
--
-- All changes are additive. Uses existing audit_log_trigger() (036).
-- No RLS, policy, or data changes. Strictly audit coverage only.
-- ============================================================

-- ─── Audit coverage for core structure tables ────────────────────

-- classes — school calendar/structure
-- School-owned; school_id is direct column.
DROP TRIGGER IF EXISTS audit_classes ON classes;
CREATE TRIGGER audit_classes
  AFTER INSERT OR UPDATE OR DELETE ON classes
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

-- class_teachers — staffing assignments
-- School-owned via class_id → classes → school_id; audit_log_trigger handles it.
DROP TRIGGER IF EXISTS audit_class_teachers ON class_teachers;
CREATE TRIGGER audit_class_teachers
  AFTER INSERT OR UPDATE OR DELETE ON class_teachers
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

-- ─── Audit coverage for calendar / event tables ──────────────────

-- events — school calendar
-- School-owned; school_id is direct column.
DROP TRIGGER IF EXISTS audit_events ON events;
CREATE TRIGGER audit_events
  AFTER INSERT OR UPDATE OR DELETE ON events
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

-- event_rsvps — parent attendance responses
-- School-owned via event_id → events → school_id; audit_log_trigger resolves via fallback.
DROP TRIGGER IF EXISTS audit_event_rsvps ON event_rsvps;
CREATE TRIGGER audit_event_rsvps
  AFTER INSERT OR UPDATE OR DELETE ON event_rsvps
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

-- ─── Audit coverage for billing configuration tables ────────────

-- fee_types — billing line items (tuition, activities, etc.)
-- School-owned; school_id is direct column.
DROP TRIGGER IF EXISTS audit_fee_types ON fee_types;
CREATE TRIGGER audit_fee_types
  AFTER INSERT OR UPDATE OR DELETE ON fee_types
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

-- tuition_configs — tuition rates per academic period and level
-- School-owned via academic_period_id → school_year_id → schools; audit_log_trigger handles via fallback.
DROP TRIGGER IF EXISTS audit_tuition_configs ON tuition_configs;
CREATE TRIGGER audit_tuition_configs
  AFTER INSERT OR UPDATE OR DELETE ON tuition_configs
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

-- discounts — discount/promo codes and credits
-- School-owned; school_id is direct column (or resolved via actor profile).
DROP TRIGGER IF EXISTS audit_discounts ON discounts;
CREATE TRIGGER audit_discounts
  AFTER INSERT OR UPDATE OR DELETE ON discounts
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

-- ─── Audit coverage for school lifecycle tables ───────────────────

-- school_years — academic year definitions (draft/active/archived)
-- School-owned; school_id is direct column.
DROP TRIGGER IF EXISTS audit_school_years ON school_years;
CREATE TRIGGER audit_school_years
  AFTER INSERT OR UPDATE OR DELETE ON school_years
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

-- holidays — no-school days
-- School-owned; school_id is direct column.
DROP TRIGGER IF EXISTS audit_holidays ON holidays;
CREATE TRIGGER audit_holidays
  AFTER INSERT OR UPDATE OR DELETE ON holidays
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

-- academic_periods — school terms and billing periods
-- School-owned; school_id is direct column.
DROP TRIGGER IF EXISTS audit_academic_periods ON academic_periods;
CREATE TRIGGER audit_academic_periods
  AFTER INSERT OR UPDATE OR DELETE ON academic_periods
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

-- ─── Audit coverage for staffing tables ────────────────────────────

-- teacher_profiles — staff roster (separate from auth.profiles)
-- School-owned; school_id is direct column.
DROP TRIGGER IF EXISTS audit_teacher_profiles ON teacher_profiles;
CREATE TRIGGER audit_teacher_profiles
  AFTER INSERT OR UPDATE OR DELETE ON teacher_profiles
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();

-- ============================================================
-- End of Migration 084
-- ============================================================
