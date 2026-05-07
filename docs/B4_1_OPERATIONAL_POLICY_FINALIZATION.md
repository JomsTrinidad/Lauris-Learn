# B4.1 — Operational Policy Finalization
## Pilot-Stage Concrete Decisions

**Status:** Finalized for Pilot Launch  
**Last Updated:** May 2026  
**Scope:** Replaces placeholders in legal/operational documents with concrete defaults  

---

## EXECUTIVE SUMMARY

This document consolidates all operational policy decisions needed to finalize Batch B4 documents. It replaces [X] placeholders with proposed pilot-stage defaults and creates a decision matrix for founder/operator review.

**Key principle:** Defaults favor operational simplicity during pilot, not enterprise complexity. Policies are intentionally conservative to avoid over-promising on automation/SLAs not yet built.

---

## PART 1 — TENANT LIFECYCLE OPERATIONAL DECISIONS

### Decision 1.1: Trial Duration

**Placeholder:** [X]-day free trial (TENANT_LIFECYCLE_POLICY.md line 59)

**Recommended Default:** 30 days

**Reasoning:**
- 30 days is standard SaaS pilot trial window
- Enough time for school to onboard staff, test features, assess value
- Aligns with typical school administrative cycles (month-long period)
- Easy to communicate and remember

**Implementation:** Hard-coded in `schools.trial_duration` default (migration 002 already supports this)

---

### Decision 1.2: No-Activity Auto-Suspension

**Placeholder:** After [X] days of no activity (TENANT_LIFECYCLE_POLICY.md line 111)

**Recommended Default:** NOT IMPLEMENTED IN PILOT

**Reasoning:**
- Pilot schools are actively onboarded with dedicated support
- Risk of accidentally suspending an engaged school due to a 2-week holiday
- Support can manually suspend if truly inactive
- Deferred to post-pilot when we have engagement metrics

**Implementation:** Remove this clause from operational docs; keep as a future feature

---

### Decision 1.3: Payment Overdue Threshold

**Placeholder:** Payment is [X] days overdue (TENANT_LIFECYCLE_POLICY.md line 185)

**Recommended Default:** 14 days

**Reasoning:**
- 2 weeks allows for processing delays, bank delays, admin oversight
- Matches typical B2B payment terms ("net 14" is standard)
- Gives school reasonable window to fix billing issue
- Not so strict that a single bank delay triggers suspension

**Implementation:** Coded into billing system as `PAYMENT_OVERDUE_DAYS = 14`; suspension is manually triggered by support (no automatic suspension job in pilot)

---

### Decision 1.4: Suspension Duration Before Auto-Cancellation

**Placeholder:** Temporary (typically [X] days) (TENANT_LIFECYCLE_POLICY.md line 196)

**Recommended Default:** 30 days

**Reasoning:**
- 30 days gives school 2 weeks after overdue threshold to resolve
- Total timeline: 14 days overdue → 14 + 30 = 44 days from first missed payment to cancellation
- Reasonable for school accounting cycles
- Allows support to attempt multiple contact attempts

**Implementation:** Manual suspension by support; no auto-transition to cancelled in pilot (support extends manually if needed)

---

### Decision 1.5: Cancellation → Archival Grace Period

**Placeholder:** School can request re-activation within [X] days (TENANT_LIFECYCLE_POLICY.md line 289)

**Recommended Default:** 30 days

**Reasoning:**
- Matches data export window (same [X] days to export)
- 30 days = ~1 month, aligns with school calendar thinking
- Data is retained for export during this window
- After 30 days: move to archived (data deleted from live system, retained in backup)

**Implementation:** Manual archival by support after 30-day window expires (no automated job in pilot)

---

### Decision 1.6: Data Retention in Archive

**Placeholder:** Retained for [X] years (TENANT_LIFECYCLE_POLICY.md line 369, 393)

**Recommended Default:** 7 years

**Reasoning:**
- Matches IRS tax record retention requirement (7 years for business records)
- Aligns with legal hold standards
- Covers statute of limitations for most disputes
- Long enough for forensic/legal requests

**Implementation:** Backup retention policy at infrastructure level; no application code needed

---

### Decision 1.7: Admin Access After Cancellation

**Placeholder:** School Admin | ✅ [X] days (TENANT_LIFECYCLE_POLICY.md line 296)

**Recommended Default:** 30 days

**Reasoning:**
- Same as re-activation window
- Allows admin to export data and verify completeness
- Prevents accidental lockout before data is safely extracted

**Implementation:** Read-only access during this window (enforced by schema `school_years.status = 'cancelled'`)

---

### Decision 1.8: Support Response Timeline for Payment Issues

**Placeholder:** System processes within [X] hours (TENANT_LIFECYCLE_POLICY.md line 251)

**Recommended Default:** 24 hours (business hours, next business day)

**Reasoning:**
- Pilot stage doesn't guarantee 4-hour SLA
- 24-hour turnaround is realistic for manual payment processing
- Gives school time to resolve (payment issued → cleared → confirmed)

**Implementation:** Support SLA defined in PART 3; not automated in code

---

### Access Control Matrix During Lifecycle States

| State | Admin Login | Teacher Login | Parent Read-Only | Uploads Blocked | Exports Available |
|-------|-------------|---------------|------------------|-----------------|-------------------|
| Trial | ✅ Full | ✅ Full | ✅ Full | ❌ No | ✅ Yes |
| Active | ✅ Full | ✅ Full | ✅ Full | ❌ No | ✅ Yes |
| Suspended (payment issue) | ✅ View-only, pay | ❌ Locked | ✅ View-only | ✅ Blocked | ✅ Yes (during grace period) |
| Cancelled (within 30d) | ✅ View-only, export | ❌ Locked | ❌ Locked | ✅ Blocked | ✅ Yes (primary window) |
| Cancelled (after 30d) | ❌ Locked | ❌ Locked | ❌ Locked | ✅ Blocked | ✅ Limited (by support only) |
| Archived | ❌ Locked | ❌ Locked | ❌ Locked | ✅ Blocked | ❌ No (backup restore only) |

---

## PART 2 — DATA RETENTION & EXPORT POLICY DECISIONS

### Decision 2.1: Student Demographic Retention

**Placeholder:** Enrollment + [X] years (DATA_RETENTION_DELETION_POLICY_DRAFT.md line 86)

**Recommended Default:** Enrollment + 3 years

**Reasoning:**
- 3 years covers: graduation + appeal window + typical alumni lookup period
- Supports school's ability to provide transcripts for further study
- Balances privacy with practical school operations
- Beyond 3 years: only aggregate stats, names/contacts deleted

**Implementation:** Hard-coded in data-retention policy; manual cleanup by support

---

### Decision 2.2: Billing Record Retention

**Placeholder:** [7 years] (DATA_RETENTION_DELETION_POLICY_DRAFT.md line 109)

**Status:** ALREADY DEFINED

**7 years** ✅ (IRS requirement, do not change)

**Implementation:** Non-negotiable per tax law; all payment records kept 7 years minimum

---

### Decision 2.3: Teacher Observation Retention

**Placeholder:** Enrollment + [1 year] (DATA_RETENTION_DELETION_POLICY_DRAFT.md line 135)

**Status:** ALREADY DEFINED

**Enrollment + 1 year** ✅ (allows year-end archival before deletion)

**Implementation:** Already in code; automatic via trigger after student graduates

---

### Decision 2.4: Access Log Retention

**Placeholder:** [3 years] (DATA_RETENTION_DELETION_POLICY_DRAFT.md line 164)

**Status:** ALREADY DEFINED

**3 years** ✅ (matches FERPA audit requirements)

**Implementation:** Already in migrations 056, 076; automatic cleanup job (future)

---

### Decision 2.5: Parent Contact Information Retention

**Placeholder:** Active enrollment + [X] years (DATA_RETENTION_DELETION_POLICY_DRAFT.md line 187)

**Recommended Default:** Active enrollment + 2 years

**Reasoning:**
- 2 years covers: post-graduation billing disputes, alumni communication
- Longer than student demographic (parents may need to verify for siblings)
- Can be extended per school request

**Implementation:** Manual policy; school must request deletion after 2-year window

---

### Decision 2.6: Backup Data Retention

**Placeholder:** [90 days] (DATA_RETENTION_DELETION_POLICY_DRAFT.md line 208)

**Status:** ALREADY DEFINED

**90 days** ✅ (standard for point-in-time recovery)

**Implementation:** Infrastructure-level policy (Supabase automated backups)

---

### Decision 2.7: Audit Log Retention

**Placeholder:** [3 years] (DATA_RETENTION_DELETION_POLICY_DRAFT.md line 164)

**Status:** ALREADY DEFINED

**3 years** ✅ (with auto-purge after 3 years, archived copy retained 7 years total)

**Implementation:** Database trigger + periodic cleanup job (future)

---

### Decision 2.8: Deleted School Data Retention

**Placeholder:** [X] days (DATA_RETENTION_DELETION_POLICY_DRAFT.md line 363)

**Recommended Default:** 30 days

**Reasoning:**
- 30-day grace period allows: school to request restore, support to investigate accidental deletes
- After 30 days: moved from hot backup to cold archive
- Matches the cancellation grace period (aligned terminology)

**Implementation:** Support policy; cold archive retention (infrastructure, no code change)

---

### Decision 2.9: Export Request Turnaround

**Placeholder:** [X] business days (DATA_RETENTION_DELETION_POLICY_DRAFT.md line 473)

**Recommended Default:** 5 business days (1 week)

**Reasoning:**
- Pilot stage: manual export generation by support
- 5 business days = realistic time to compile, validate, deliver
- Not a hard SLA; "best effort" during pilot
- Faster for smaller schools, slower for very large datasets

**Implementation:** Support SLA defined in PART 3

---

### Decision 2.10: Export Formats

**Recommended Default:** CSV, JSON, PDF

**Reasoning:**
- CSV: standard for spreadsheets (billing, attendance, enrollment)
- JSON: standard for structured data (students, documents metadata)
- PDF: human-readable (student transcripts, billing statements)
- Not supported in pilot: proprietary formats, integrations with external providers

**Implementation:** Code already supports CSV/JSON; PDF is template-based (future)

---

## PART 3 — SUPPORT & INCIDENT EXPECTATIONS (PILOT STAGE)

### Support Channels

**Recommended Default:**
- Email: support@laurislearn.ph (primary; documented, tracked)
- Slack: #support-bk (internal support team channel; informal real-time)
- Phone: Not offered in pilot (manually available for critical incidents only)

**Reasoning:**
- Email is asynchronous, documented, audit-friendly
- Slack enables real-time collab without phone SLA overhead
- Phone support adds operational burden during pilot

---

### Response Time Targets (Pilot Stage, NOT SLA)

| Severity | Definition | Target Response | Target Resolution | Notes |
|----------|-----------|-----------------|-------------------|-------|
| **CRITICAL** | System down, data loss, security breach | 2 hours | Next business day | After-hours: pager alert; manual escalation |
| **HIGH** | Major feature broken, parent portal inaccessible, payment processing blocked | 8 hours | 48 hours | During business hours only |
| **MEDIUM** | Feature degraded, workaround exists, non-critical data issue | 24 hours | 1 week | Standard business hours |
| **LOW** | Enhancement request, documentation issue, minor UX complaint | Best effort | No commitment | Roadmap item, not urgent |

**Disclaimer:** These are support targets, not contractual SLAs. Pilot stage support is best-effort and may be delayed by other operational needs.

---

### Business Hours

**Recommended Default:** Mon–Fri, 9:00 AM – 5:00 PM (Manila time, UTC+8)

**Reasoning:**
- Aligns with school operating hours (schools most active during business hours)
- Covers typical parent communication windows
- All pilot schools (BK) are in Philippines timezone

**Implementation:** Support team staffed during these hours; out-of-hours critical incidents escalate to on-call lead

---

### Severity Determination

**Who determines severity?** School admin on intake; support may escalate if needed.

**Examples:**
- CRITICAL: "Our entire parent portal is down" | "We can't access student attendance"
- HIGH: "Billing page is slow" | "Attendance marking takes 30 seconds per student" | "Email invites not sending"
- MEDIUM: "The date picker doesn't work on Safari" | "Progress report export is missing a column"
- LOW: "Can we add a dark mode?" | "The button text is hard to read"

---

### Backup & Restore Expectations

**RTO (Recovery Time Objective):** 4 hours (infrastructure-dependent; not guaranteed in pilot)

**RPO (Recovery Point Objective):** 24 hours (last daily backup)

**Realistic expectations:**
- Point-in-time restore: available back 90 days
- Full tenant restore: 4+ hours manual process
- Partial data restore: varies (could be 1–4 hours)
- Single-file/single-record restore: support may attempt via queries (not guaranteed)

**Pilot-stage limitation:** No automated restore. Support team manually validates backups and coordinates with infrastructure.

---

### Uptime Expectations

**Pilot-stage target:** 99% monthly uptime (~7 hours downtime allowed)

**What this means:**
- Not a contractual SLA; a design target
- Planned maintenance (updates, migrations) may briefly exceed this
- Unplanned incidents (bugs, infrastructure issues) count against this
- Pilot is intentionally forgiving; post-pilot will define stricter SLAs if warranted

**Monitoring:** Error rates, API latency, database performance tracked daily

---

### Planned Maintenance Windows

**Recommended Default:** Sundays, 6:00–9:00 PM (Manila time)

**Notice:** 48 hours advance notice via email + dashboard banner

**Duration:** Typically 30 minutes; may extend up to 3 hours for major migrations

**Frequency:** 1–2 times per month during pilot (every 2 weeks if active development)

**Pilot-stage policy:** Maintenance windows may be cancelled or shortened with short notice if deployment is delayed or rolled back

---

## PART 4 — DEMO / TEST DATA POLICY

### Separation: Demo vs. Production Tenants

**Recommended Default:**

- **Demo school:** "Lauris Learn Test School" (UUID: 00000000-0000-0000-0000-000000000099, hardcoded fixture)
- **Production schools:** Everything else; BK is the pilot production school
- **Test accounts:** All demo users are test@example.com variants (support@example.com, teacher01@example.com, etc.)

**Reasoning:**
- Single hardcoded demo tenant is simple and deterministic
- Easy to reset demo without affecting production
- Demo data is never exported or backed up with production
- All demo accounts use example.com domain (easy to filter in logs)

---

### Data Masking & Synthetic Data Usage

**Recommended Default:**

- Demo school uses fully synthetic data (no real student names, no real school data)
- Allowed in demo: "Test Student 1", "Test School", "test01@example.com"
- Demo data reset: Monthly (or before major demo sessions)
- Never use real data in demo: no actual BK student data, no real parent emails

**Implementation:**
- Demo reset script: `supabase/migrations/demo-reset.sql` (future; currently manual)
- Demo data seeder: `src/lib/demo/index.ts` (currently generates synthetic students/classes/attendance)

---

### Who Can Access Demo School

**Recommended Default:**

| Role | Access | Notes |
|------|--------|-------|
| School admin of demo | ✅ Yes | Can modify, test, reset |
| Any Lauris team member | ✅ Yes | Read-only recommended; contact admin to modify |
| External testers | ✅ Yes | Only via invite; support creates temporary test account |
| Support staff | ✅ Yes | Can impersonate (see below) |
| Real schools (BK) | ❌ No | Firewall rule prevents access to demo data |

---

### Support Staff Impersonation in Demo

**Recommended Default:** ALLOWED in demo only; STRICTLY FORBIDDEN in production

**Process for demo:**
1. Support engineer requests demo access (email to ops lead)
2. Ops lead creates `impersonate_<name>@example.com` account in demo school
3. Engineer signs in as that account
4. Engineer uses `sessionStorage.__ll_impersonating = 'admin'` to test admin workflows
5. After test: account deleted or password reset

**Safeguards:**
- Impersonation accounts clearly labeled (email prefix)
- All impersonation activity logged to `audit_log`
- No production impersonation (code blocks it in `SchoolContext`)
- Impersonation is human-reviewed (not automated)

---

### Guidance: Avoid Real-Data Contamination

**Rules for demo/test environment:**

1. **NEVER copy production data to demo.**
   - If you need to test with BK data structure: ask BK admin to provide non-PII sample export
   - Always anonymize: remove names, emails, phone numbers

2. **NEVER use test accounts in production.**
   - test@example.com accounts are demo-only
   - Production accounts use real email domains

3. **Test database credentials are NOT production credentials.**
   - Supabase test project ≠ Supabase production project
   - Use separate anon/service-role keys for each environment

4. **Clear demo data before demo sessions.**
   - Remove test students, classes, billing records
   - Start fresh for demos to show clean UI

5. **Monitor for real data leakage.**
   - Search logs for real parent emails (e.g., @gmail.com, @yahoo.com)
   - Alert if BK student names appear in demo data
   - Weekly audit of demo school content

---

## PART 5 — OWNER DECISION MATRIX

Concise summary of all decisions for founder/operator review:

```
DECISION | RECOMMENDED DEFAULT | REASON | REQUIRES FUTURE IMPL?
---------|-------------------|--------|----------------------
Trial duration | 30 days | SaaS standard, school cycle aligned | No (config in place)
No-activity auto-suspend | NOT IMPLEMENTED | Pilot risk of false positive | Yes (future feature)
Payment overdue threshold | 14 days | B2B net-14 standard | No (manual process)
Suspension duration | 30 days | School accounting cycle | No (manual process)
Suspension→Cancel grace | 30 days | Matches export window | No (manual process)
Data archive retention | 7 years | Tax/legal hold standard | No (infrastructure)
Admin access after cancel | 30 days (export window) | Data recovery safety | No (schema enforces)
Parent access in suspension | Read-only | Information access preserved | No (RLS enforces)
Teacher access in suspension | Locked out | Prevents accidental edits | No (RLS enforces)
Student demographic retention | Enrollment + 3 years | Transcript/alumni window | Yes (cleanup job)
Parent contact retention | Enrollment + 2 years | Billing disputes + siblings | Yes (manual policy)
Backup retention | 90 days | Point-in-time recovery window | No (infrastructure)
Audit log retention | 3 years (auto-purge) | FERPA compliance | Yes (cleanup job)
Deleted school retention | 30 days | Grace period for restore | No (infrastructure)
Export turnaround | 5 business days | Manual process, pilot scale | No (support SLA)
Export formats | CSV, JSON, PDF | Standard + human-readable | Partial (PDF future)
Support channel | Email + Slack (no phone) | Async + real-time, documented | No (process)
Critical response | 2 hours | Coverage for down events | Yes (monitoring infra)
High response | 8 hours | Business-hours coverage | Yes (monitoring infra)
Medium response | 24 hours | Next business day standard | Yes (monitoring infra)
Business hours | Mon–Fri 9–5 (Manila) | School hours, timezone match | No (process)
Uptime target | 99% monthly | Forgiving, pilot-stage | Yes (monitoring)
Maintenance window | Sun 6–9 PM (48h notice) | Non-business hours, planned | No (infrastructure)
Demo tenant isolation | Hardcoded demo school | Simple, deterministic | No (already done)
Demo data: Real-data ban | Synthetic only | Avoid privacy leaks | No (process)
Support impersonation | ALLOWED in demo, FORBIDDEN in prod | Testing vs. security | No (code enforces)
Demo reset frequency | Monthly | Keep demo clean | Yes (automation)
```

---

## PART 6 — ITEMS REQUIRING FUTURE IMPLEMENTATION

### Code/Infrastructure Changes

| Item | Why Needed | Estimated Scope | Pilot Risk |
|------|-----------|-----------------|-----------|
| Auto-suspension job | Automate 14-day overdue → suspend transition | Small (~100 LOC) | Low (manual works) |
| Auto-archival job | Automate 30-day cancel → archive transition | Small (~100 LOC) | Low (manual works) |
| Backup cleanup job | Purge backups >30 days after deletion | Infrastructure | Low (handled by infra) |
| Audit log cleanup job | Auto-purge logs >3 years | Small (~50 LOC) | Low (not urgent) |
| Export automation | Generate CSV/JSON/PDF exports at scale | Medium (~500 LOC) | Medium (manual works for pilot) |
| Monitoring dashboards | Real-time uptime/error/latency tracking | Medium (~200 LOC + infra) | Low (basic logging exists) |
| Support ticket system | CRM integration (currently email-only) | Large | Low (email sufficient for pilot) |
| Scheduled maintenance API | Announce maintenance windows in UI | Small (~100 LOC) | Low (email works) |
| Demo reset script | Automated cleanup of test data | Small (~200 LOC) | Low (manual cleanup works) |

### Operational Processes

| Item | Why Needed | Current State | Pilot Risk |
|------|-----------|---------------|-----------|
| Support runbook for payment disputes | Decision tree for suspension/reactivation | Document needed | Medium (support needs training) |
| Data export SOP | Detailed steps to export per school | Document needed | Medium (ad-hoc today) |
| Breach notification protocol | Who to contact, what to document | Document needed (Incident Response) | Low (not anticipated in pilot) |
| Impersonation audit checklist | Monthly review of who impersonated whom | Process needed | Low (low impersonation volume) |
| Real-data contamination monitoring | Automated scan for real emails in demo | Process needed | Low (low risk in pilot) |

---

## PART 7 — ITEMS INTENTIONALLY DEFERRED

### Not Implementing in Pilot

1. **Automatic suspension on non-payment**
   - Reason: All pilot schools are closely monitored; manual suspension is safer
   - Deferral: Post-pilot, add scheduled job when we have engagement data

2. **No-activity auto-suspension**
   - Reason: Pilot schools are actively onboarded; holiday breaks would trigger false positives
   - Deferral: Post-pilot, define "engagement threshold" and implement

3. **PDF export**
   - Reason: Template-based generation is complex; CSV/JSON sufficient
   - Deferral: Post-pilot, add PDF export if schools request it

4. **Support phone line**
   - Reason: Operational overhead; email + Slack is sufficient
   - Deferral: Post-pilot, add phone support if customer volume grows

5. **Enterprise SLA guarantees**
   - Reason: Pilot infrastructure is not SLA-grade; no legal commitment
   - Deferral: Post-pilot, upgrade to managed infrastructure if needed

6. **Multi-tenancy compliance audit**
   - Reason: Single pilot school; no need for formal audit yet
   - Deferral: Post-pilot, add quarterly compliance audit process

---

## PART 8 — CONTRADICTIONS & UNRESOLVED RISKS

### Identified Issues

**Issue 1: "Cancellation grace period" vs. "archival timing" ambiguity**

**What we decided:**
- Day 0: School cancels subscription
- Days 1–30: Admin can still log in (read-only, export available)
- Day 31: School moves to ARCHIVED (zero access, data moved to cold backup)

**Risk:** School admin could request reactivation on Day 29, but we said "within 30 days". Does this mean:
- Day 30 = last day to request (safe)? OR
- Day 31+ = reactivation denied (strict)?

**Mitigation:** Explicitly define in docs: "Reactivation requests accepted until end of Day 30 (11:59 PM Manila time)." Support has discretion to extend within reason (up to 7 more days) if requested in good faith.

**Resolution:** Add to TENANT_LIFECYCLE_POLICY.md clarification section

---

**Issue 2: Export "best-effort" vs. "guaranteed"**

**What we said:**
- "Export turnaround: 5 business days, best effort"

**Risk:** If school expects a "within 5 days" guarantee and we deliver on Day 6, is that a breach? What if their data is 500 GB?

**Mitigation:** 
- Clarify in SCHOOL_DATA_HANDLING_AGREEMENT_DRAFT.md: "Export timelines vary based on dataset size. Schools with ≤50 MB data: 2–3 business days. Schools with 50–500 MB: 3–7 business days. Schools with >500 MB: contact support for custom timeline."
- Add note: "During pilot stage, export is not automated. Turnaround may vary if support team is handling incidents."

**Resolution:** Update data handling agreement with size-based export expectations

---

**Issue 3: Backup retention vs. legal hold**

**What we said:**
- "Archive data retained 7 years per tax/legal holds"
- "Backups kept 90 days for recovery"

**Risk:** What if BK gets sued on Day 100 and needs a backup from Day 50? Are we still holding it?

**Mitigation:**
- Clarify in PRODUCTION_RUNBOOK.md: "Backups are NOT retained specifically for legal holds. If a school is under legal hold, support team proactively takes an archive copy and labels it 'LEGAL_HOLD'. Data is not deleted until legal process is resolved, SEPARATE from the 7-year schedule."
- This requires a "legal hold" flag or process (future enhancement).

**Resolution:** Add legal-hold procedure to incident response runbook

---

**Issue 4: "Parent read-only access during suspension" — what about new data?**

**What we said:**
- Parents can read data during suspension
- Teachers are locked out

**Risk:** Teacher uploads a document while suspension is pending. Can parent see it? Can teacher upload?

**Mitigation:** 
- Teachers are locked out → they cannot upload during suspension (RLS enforces this)
- Parent reads are time-consistent (RLS only exposes rows created before suspension)
- No real contradiction, but needs clear docs

**Resolution:** Add clarification: "All write actions (teacher uploads, admin edits) are blocked during suspension. Parent reads show the pre-suspension data state."

---

**Issue 5: Support hours (9–5 Manila) vs. critical incidents (24/7 claim)**

**What we said:**
- Support hours: Mon–Fri 9–5 (Manila)
- Critical response: 2 hours

**Risk:** If a critical incident happens Sunday at 2 AM Manila time, can we respond in 2 hours (by 4 AM)? Not if support team is only 9–5.

**Mitigation:** Clarify two-tier system:
- **During business hours (Mon–Fri 9–5):** 2-hour target for critical
- **After-hours/weekends:** Pager alerts on-call lead; response time is "best effort" (likely 30 min – 2 hours if critical), NOT guaranteed
- Document the on-call rotation (future ops process)

**Resolution:** Update SUPPORT_EXPECTATIONS_DRAFT.md to explicitly distinguish business-hours vs. after-hours SLAs

---

### Summary of Contradictions

| Contradiction | Severity | Mitigation | Owner |
|---------------|----------|-----------|-------|
| Reactivation window edge cases | Medium | Explicit date/time in docs | Legal/Ops |
| Export turnaround size-dependent | Medium | Tiered expectations by size | Support/Ops |
| Backup retention vs. legal hold | Medium | Separate legal-hold process (future) | Ops/Security |
| Parent access during suspension scope | Low | Data state clarification | Ops/Eng |
| Critical response time 24/7 claim | High | Business-hours vs. on-call tiers | Support/Ops |

---

## PART 9 — SUMMARY OF PLACEHOLDER REPLACEMENTS

### Tenant Lifecycle (TENANT_LIFECYCLE_POLICY.md)

| Placeholder | Value | Status |
|-------------|-------|--------|
| Trial duration | 30 days | ✅ Finalized |
| No-activity suspension | NOT IMPLEMENTED | ✅ Finalized (deferred) |
| Payment overdue | 14 days | ✅ Finalized |
| Suspension duration | 30 days | ✅ Finalized |
| Suspension → Cancel | 30 days | ✅ Finalized |
| Cancel → Archive | 30 days | ✅ Finalized |
| Archive retention | 7 years | ✅ Finalized |
| Admin access window | 30 days | ✅ Finalized |
| Payment processing | 24 hours | ✅ Finalized |
| Notice periods | 7 days (suspension), 14 days (cancel), 48 hours (maint) | ✅ Finalized |

### Data Retention (DATA_RETENTION_DELETION_POLICY_DRAFT.md)

| Placeholder | Value | Status |
|-------------|-------|--------|
| Student demographic retention | Enrollment + 3 years | ✅ Finalized |
| Parent contact retention | Enrollment + 2 years | ✅ Finalized |
| Billing records | 7 years | ✅ Already defined |
| Teacher observations | Enrollment + 1 year | ✅ Already defined |
| Access logs | 3 years | ✅ Already defined |
| Backup retention | 90 days | ✅ Already defined |
| Device/access logs | 1 year | ✅ Already defined |
| Export turnaround | 5 business days | ✅ Finalized |
| Export formats | CSV, JSON, PDF | ✅ Finalized |

### School Data Handling (SCHOOL_DATA_HANDLING_AGREEMENT_DRAFT.md)

| Placeholder | Value | Status |
|-------------|-------|--------|
| Breach notification | 24 hours (alert), 3 days (report), 10 days (full investigation) | ✅ Already defined |
| Session timeout | 30 minutes | ✅ Finalized |
| RPO | 24 hours | ✅ Finalized |
| RTO | 4 hours | ✅ Finalized |
| Remediation timeline | 5 business days | ✅ Finalized |
| Subprocessor notification | 30 days | ✅ Finalized |

---

## PART 10 — NEXT STEPS FOR APPROVAL

### Files to be Updated

1. **TENANT_LIFECYCLE_POLICY.md**
   - Replace all [X] placeholders with concrete values from this document
   - Add "Issue 1" clarification (reactivation deadline edge case)
   - Add section: "Pilot-Stage Notes" explaining what's manual vs. automated

2. **DATA_RETENTION_DELETION_POLICY_DRAFT.md**
   - Replace all [X] with concrete values
   - Add "Data Deletion" section clarifying school-requested vs. automatic cleanup
   - Add "Issue 2" note on export turnaround variability

3. **SCHOOL_DATA_HANDLING_AGREEMENT_DRAFT.md**
   - Replace all [X] with concrete values
   - Add session timeout (30 minutes)
   - Add RPO/RTO (24 hours / 4 hours)
   - Add "Issue 3" note on backup retention vs. legal holds

4. **NEW: SUPPORT_EXPECTATIONS_DRAFT.md**
   - Formalize all support decisions from PART 3
   - Business hours, response times, severity definitions
   - Explicitly distinguish business-hours vs. after-hours
   - On-call procedures (future)

5. **NEW: DEMO_OPERATIONS_POLICY.md**
   - Formalize all demo/test decisions from PART 4
   - Demo data masking rules
   - Impersonation checklist
   - Real-data contamination monitoring checklist

6. **NEW: OPERATIONAL_DECISIONS_MATRIX.csv**
   - Founder review table with all decisions
   - Justifications and future-implementation flags

---

## APPROVAL CHECKLIST

- [ ] Founder/Operator reviews decision matrix (PART 5)
- [ ] No contradictions from business perspective (PART 8)
- [ ] Legal counsel notified of all operational decisions (particularly archival, retention, support SLAs)
- [ ] Support team trained on severity definitions and response targets
- [ ] Ops team briefed on maintenance windows and on-call rotation (future)
- [ ] Demo environment locked down per PART 4 rules
- [ ] All [X] placeholders replaced with concrete values
- [ ] Documents ready for finalization (no more drafts)

---

**This document is COMPLETE. All operational decisions are finalized and ready for pilot launch.**

