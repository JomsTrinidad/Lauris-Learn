# Demo & Test Data Operations Policy — Lauris Learn
## Pilot Stage Data Handling

**Status:** Operational Policy for Dev/Support Teams  
**Last Updated:** May 2026  
**Applies to:** All non-production environments  

---

## OVERVIEW

This document defines how demo/test data is managed and how to prevent accidental real-data contamination.

**Core principle:** Demo environments are completely separate from production. Real data never flows to demo.

---

## ENVIRONMENT SEPARATION

### Three Tiers

#### Production

**Database:** Lauris Learn production Supabase project  
**School:** "Bright Kids Learning and Tutorial Center" (UUID: 00000000-0000-0000-0000-000000000001)  
**Data:** Real BK data only; no test data  
**Access:** School admin (Bright Kids staff) only  

**Rules:**
- ❌ No synthetic test accounts (test@example.com)
- ❌ No demo students or classes
- ❌ No manual data entry by support staff without school approval
- ❌ All access logged and auditable

---

#### Demo/Development

**Database:** Separate Lauris Learn test Supabase project  
**School:** "Lauris Learn Test School" (UUID: 00000000-0000-0000-0000-000000000099)  
**Data:** 100% synthetic; no real BK data  
**Access:** Lauris team + authorized testers  

**Rules:**
- ✅ Full test data (synthetic students, classes, billing, etc.)
- ✅ Use example.com email domain for all test accounts
- ✅ Reset monthly (or before major demos)
- ✅ Can be modified, deleted, regenerated freely
- ✅ Used for feature development and testing

---

#### Staging (Future)

**Database:** Production-like Supabase project (optional, post-pilot)  
**Data:** Copy of production data (anonymized) OR all-synthetic  
**Purpose:** Final testing before production deploy  

**Note:** Not implemented in pilot; will be added if multi-school production grows

---

### Database & Connection Secrets

**Production project key:**
- Anon key: `<production_anon_key>` (in `.env.production`)
- Service-role key: `<production_service_key>` (in `.env.production` — never in browser)

**Test project key:**
- Anon key: `<test_anon_key>` (in `.env.test` or `.env.development`)
- Service-role key: `<test_service_key>` (in `.env.test` — never in browser)

**Rule:** Keys are NEVER shared between environments. Separate secrets files, separate Supabase projects.

---

## SYNTHETIC DATA & MASKING

### What's Allowed in Demo

| Data Type | Demo | Restrictions |
|-----------|------|--------------|
| Student names | ✅ Synthetic | "Test Student 1", "Alice", "Bob" — not real names |
| Email addresses | ✅ Synthetic | Must use example.com domain (test01@example.com) |
| Phone numbers | ✅ Synthetic | Use 555-0000 series (standard test range) |
| Addresses | ✅ Synthetic | Fake addresses OK (123 Main St, Makati) |
| Dates | ✅ Any | Past/future dates OK |
| Classes & subjects | ✅ Any | "Test Class", "Math 101", etc. |
| Billing amounts | ✅ Any | Any test amounts OK |
| Documents | ✅ Synthetic | Test PDFs, lorem ipsum text, or real product screenshots |

### What's FORBIDDEN in Demo

| Data Type | Demo | Reason |
|-----------|------|--------|
| Real student names | ❌ NEVER | Privacy violation; BK may have non-disclosure |
| Real parent emails | ❌ NEVER | Privacy violation; risk of accidental email to real person |
| Real phone numbers | ❌ NEVER | Privacy violation; risk of accidental calls |
| Real BK student records | ❌ NEVER | Privacy violation; FERPA breach |
| Real family info | ❌ NEVER | Privacy violation |
| Real payment card numbers | ❌ NEVER | PCI-DSS violation; test cards OK (4111-1111-1111-1111) |

### Masking Real Data (If Needed for Testing)

**Scenario:** "We need to test with BK-like data structure but can't use real data"

**Approved approach:**
1. BK admin exports a sample of records (without PII)
2. Support team anonymizes: remove names, emails, phone numbers
3. Anonymized data loaded into test environment
4. Test work proceeds on anonymized copy
5. Anonymized data is NOT used in production

**Tools:**
- Find/replace: Replace all first names with "Test [number]"
- Remove columns: Delete email, phone, address before import
- Randomize: Generate random dates/amounts from real schema

---

## DEMO DATA LIFECYCLE

### Monthly Reset (Recommended)

**When:** First Sunday of month, 6:00 PM Manila time (during maintenance window)

**What happens:**
1. Backup demo school data (for reference if needed)
2. Delete all students, classes, billing, documents
3. Run fresh demo seed (generates new synthetic data)
4. Verify seed completed successfully
5. Demo is ready for fresh demos

**Files involved:**
- Demo seeder: `src/lib/demo/index.ts`
- Demo reset script: `supabase/migrations/demo-reset.sql` (future)

**Who runs it:** Ops lead or designated support staff

---

### Between-Resets Cleanup

**If demo data gets messy between resets:**
1. Support staff can manually delete old test students/classes
2. Log the cleanup (date, what was deleted, why)
3. Add fresh test data as needed

**Don't:**
- ❌ Leave old test data lingering
- ❌ Mix old and new data
- ❌ Forget to remove confidential test data (e.g., real email addresses added by mistake)

---

## DEMO DATA AUDIT

### Weekly Check (Ops Lead)

Every Monday morning, quickly scan demo school:

```
SELECT email FROM profiles WHERE email NOT LIKE '%@example.com' AND school_id = '00000000-0000-0000-0000-000000000099';
```

**Should return:** 0 rows (only example.com emails in demo)

**If non-example.com found:**
- ❌ Alert: "Real email detected in demo"
- Identify the email: Is it a real person? Or just a typo?
- Delete or fix the record immediately
- Log the incident (date, what was found, corrective action)

### Monthly Audit (Ops Lead)

Full scan of demo school:
- Any records with real Philippines phone numbers? (not 555-0000 range)
- Any real names that match BK students?
- Any BK-specific data (class "Kinder A", "Bright Kids" school name)?
- Any confidential test accounts (support@example.com with real data)?

If issues found:
- Clean up immediately
- Log incident
- Prevent recurrence (e.g., add validation rules)

---

## WHO CAN ACCESS DEMO

### Demo School Access Control

| Role | Demo Access | Notes |
|------|-------------|-------|
| All Lauris team | ✅ Yes | Read + modify for testing |
| Support staff | ✅ Yes | Test support workflows |
| Consultants/contractors | ✅ Yes | With NDA; create temp account |
| External testers | ✅ Yes | Invite-only; temporary account |
| BK staff (production) | ❌ No | Separate production project |
| Customers (other schools) | ❌ No | Each school has own production project |

### Demo Account Creation

**Who can create demo accounts?** Ops lead or designated support staff

**Process:**
1. Request: Email ops lead with tester name + email
2. Create account: ops lead creates `demo_[name]@example.com` in demo school
3. Assign role: Set role based on intended testing (teacher, school_admin, etc.)
4. Notify: Email tester with login credentials and test data summary
5. Cleanup: After testing, delete account (or mark inactive if recurring tester)

**Account naming convention:**
- Support: `support_[name]@example.com` (e.g., `support_maria@example.com`)
- QA: `qa_[name]@example.com` (e.g., `qa_dev@example.com`)
- External: `tester_[company]_[name]@example.com` (e.g., `tester_acme_john@example.com`)

---

## SUPPORT STAFF IMPERSONATION IN DEMO

### ALLOWED in Demo Only

Support staff can impersonate admin to test admin workflows.

**Process:**
1. Support engineer signs in as their demo account (engineer@example.com)
2. Uses browser DevTools to set: `sessionStorage.__ll_impersonating = 'admin'`
3. Tests admin-only features
4. Clears the flag when done

**Restrictions:**
- ✅ Demo only (code blocks prod impersonation)
- ✅ Must log in first (impersonation flag doesn't bypass auth)
- ✅ All actions logged to `audit_log` table
- ✅ Limited duration (e.g., 30 minutes per session)

---

### STRICTLY FORBIDDEN in Production

Any support staff attempting to impersonate in production will:
1. Be blocked by code (`middleware.ts` checks for production project)
2. Trigger a security alert if flag is set anyway
3. Result in immediate access revocation

**Why:** Impersonation bypasses audit trails and could hide malicious actions. Only acceptable in sandbox environment.

---

## AVOIDING REAL-DATA CONTAMINATION

### Red Flags (Watch For These)

❌ Non-example.com email in demo  
❌ Real Philippines phone numbers (not 555-0000)  
❌ Names that match BK staff or students  
❌ References to BK location or curriculum  
❌ Payment card numbers that aren't test cards  
❌ Real parent WhatsApp messages in test data  

### Prevention Checklist

Before committing code or test data:

- [ ] All test email addresses use @example.com domain
- [ ] All test phone numbers use 555-0000 series
- [ ] No real BK student names (ask BK admin for permission if needed)
- [ ] No real parent email addresses or phone numbers
- [ ] No real addresses (use 123 Main St, Makati or similar)
- [ ] No real payment info (use test card 4111-1111-1111-1111)
- [ ] No real documents (use lorem ipsum or product screenshots)
- [ ] Demo data is clearly marked synthetic (e.g., class name "Demo Class", not "Kinder A")
- [ ] No production database connections in demo code
- [ ] No production API keys in demo repositories

### If Real Data Leaks into Demo

**Immediate actions:**
1. Stop the test/demo immediately
2. Delete the offending data from demo project
3. Alert ops lead and team lead
4. Document what happened and why
5. Take corrective action to prevent recurrence

**Examples:**
- "I accidentally pasted a BK student name" → Delete, create synthetic version, move on
- "I copied BK's student list to test export" → Delete, anonymize, use anonymized copy going forward
- "Someone shared a production backup in Slack" → Confirm it's not there anymore, remind team of data policy

---

## DEMO DATA SECURITY

### Access Controls

**Demo Supabase project:**
- Separate API keys from production
- Read-only access for most of the team (modify only during structured testing)
- Service-role key only on backend (never in browser)

**Demo database:**
- No real passwords stored (hashed even in demo)
- RLS policies enforced equally (demo should behave like production)
- No backdoor access or "admin bypasses" even in demo

### Monitoring Demo

**Who watches the demo?** Ops team (daily check during business hours)

**What's monitored?**
- Email domain mismatches (non-example.com)
- Phone number anomalies
- Suspicious data changes
- Failed login attempts (may indicate attack testing)

**Alerting:** If real data detected, immediately notify team + owner of test/demo

---

## MULTI-ENVIRONMENT CHECKLIST

Before launching a demo or test:

- [ ] Using test Supabase project (not production)?
- [ ] Environment variables point to test project (check .env file)?
- [ ] All test accounts have @example.com domain?
- [ ] Test school UUID is correct (00000000-0000-0000-0000-000000000099)?
- [ ] No sensitive production data copied into demo?
- [ ] Production credentials are NOT in code or config?
- [ ] Database is test database (not production)?
- [ ] Logs show test environment, not prod?

---

## OPERATIONAL PROCEDURES

### Seeding Test Data

**File:** `src/lib/demo/index.ts`

**Current seed generates:**
- 1 demo school
- 2 teachers + 5 synthetic teacher accounts
- 5 classes (Kinder, Pre-K, K, Grade 1, Grade 2)
- 10 students per class (50 total)
- Sample attendance, grades, progress observations
- Sample billing records

**To run seed:**
```bash
npm run seed:demo    # Seeds current demo project
npm run reset:demo   # Resets demo (clears + reseeds)
```

**Customize the seed:**
- Edit `src/lib/demo/index.ts`
- Change number of students, classes, billing records
- Add more complex scenarios (suspended school, archived documents)
- Do NOT add real data

---

### Resetting Demo Mid-Cycle

**If demo data gets too messy before monthly reset:**

1. **Option A — Selective cleanup:** Delete specific students/classes manually
2. **Option B — Full reset:** Run seed:demo to delete and regenerate
3. **Option C — Restore snapshot:** If available, restore demo project to last clean backup

**Decision tree:**
- If just a few bad records → Option A (selective cleanup)
- If entire demo is contaminated → Option B (full reset)
- If production-like Staging exists → Option C (restore from snapshot)

---

## COMPLIANCE & AUDIT

### What Gets Logged

All actions in demo (create, read, update, delete) are logged to `audit_log` table, just like production.

**Audit log fields for demo:**
- `actor_user_id` — who did the action
- `action_type` — CREATE, UPDATE, DELETE, etc.
- `table_name` — which table was modified
- `record_id` — which record was affected
- `created_at` — timestamp
- `changes` — old vs. new value (if available)

**Demo audit logs are kept for:** 30 days, then auto-purged (no retention required for demo)

---

### Annual Compliance Check

Once per year, review:
- [ ] No real data in demo project?
- [ ] Demo project successfully segregated from production?
- [ ] All test accounts follow naming convention?
- [ ] Impersonation logs reviewed (if enabled)?
- [ ] Demo reset process documented and working?
- [ ] Team training updated (how to avoid contamination)?

---

## FAQ

**Q: Can I test with a copy of production data?**  
A: Only if anonymized first (remove names, emails, phones). Never use real data as-is.

**Q: What if I find real data in demo by accident?**  
A: Delete it immediately, alert the team, document what happened.

**Q: Can BK staff access the demo?**  
A: No. Demo is internal testing only. BK uses production project.

**Q: Can I keep demo data between resets?**  
A: Not recommended. Reset monthly to start fresh. If you need to preserve specific test data, document it and recreate it after reset.

**Q: What if someone shares production data in Slack?**  
A: Ask them to delete the message, confirm it's gone, remind them of this policy, and report to ops lead.

**Q: Can support staff modify BK production data directly?**  
A: Only with explicit written request from school. All changes logged. Preferred: school admin makes the change, support assists.

---

## CONTACTS & ESCALATION

**Demo access request:** ops@laurislearn.ph  
**Real-data contamination alert:** Slack @ops-lead + email ops@laurislearn.ph  
**Demo reset/maintenance:** Support team  
**Policy questions:** ops@laurislearn.ph  

---

This policy is designed to protect privacy, prevent accidents, and keep demo and production completely separate.

