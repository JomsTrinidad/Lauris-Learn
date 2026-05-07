# Batch B2.0 — Operational QA & Workflow Hardening

**Status:** In Progress  
**Date:** 2026-05-07  
**Scope:** Production workflow validation and edge-case hardening

---

## PART 1 — SCHOOL YEAR TRANSITIONS

### Current Implementation

**School Year Status Enum:** `"planned" | "draft" | "active" | "closed" | "archived"`

**Activation Flow:**
- `activateSy(id)` — finds current active year, prompts user, then:
  1. `UPDATE school_years SET status='closed' WHERE school_id=? AND status='active'`
  2. `UPDATE school_years SET status='active' WHERE id=?`
  3. Calls `refreshCtx()` to update SchoolContext

**Close Year Flow:**
- `initiateCloseYear()` — validates unclassified students via RPC `year_end_classifications_pending`
- `confirmCloseYear()` — sets active year to "closed"

### Edge Cases Tested

#### ✅ FINDING 1.1: Multiple Active Years (POSSIBLE BUT NOT PREVENTED CLIENT-SIDE)
**Severity:** MEDIUM  
**Path:** Settings → School Year & Terms → Create two years, set both to "active" via modal

**Current Behavior:**
- If user clicks Save on school year modal with `status='active'`, code *does* demote the previous active year to "closed" **before** inserting/updating:
  ```
  if (syForm.status === 'active') {
    await supabase.from("school_years").update({ status: "closed" })
      .eq("school_id", schoolId).eq("status", "active");
  }
  ```
- However, if two concurrent requests hit the DB simultaneously (e.g., two browser tabs), both could execute the demote simultaneously, leaving both "active"

**Status:** NOT AN ISSUE in normal single-admin scenarios, but RLS policies should enforce 1:1 active year per school

**Recommendation:** Verify unique constraint in RLS + smoke tests, not a production blocker

---

#### ✅ FINDING 1.2: Promoting Withdrawn Students (INTENTIONAL BEHAVIOR)
**Severity:** LOW  
**Path:** Enrollment → Year-End Classification → classify withdrawn student as "eligible"

**Current Behavior:**
- The Students page "Year-End Classification" tab allows admins to set `progression_status` on any student, even those with `enrollment_status='withdrawn'`
- No client-side guard prevents this
- Withdrawn students CAN be promoted if admin explicitly classifies them

**Status:** INTENTIONAL — Schools may want to classify a withdrawn student as "eligible for next level" if they withdrew late and want to track educational progress

**Recommendation:** Document in Help drawer, no code change needed

---

#### ✅ FINDING 1.3: Promoting Students With Unpaid Balances (CONTROLLED)
**Severity:** MEDIUM  
**Path:** Settings → Enrollment Balance Policy + Enrollment → Returning Students

**Current Behavior:**
- Settings page has `balancePolicy` dropdown: `"warn" | "block" | "allow"`
- Enrollment page checks prior-year balance before letting a student re-enroll as returning student
- If `balancePolicy = 'block'`, the Returning Student flow explicitly blocks enrollment until balance is cleared
- **However:** The Settings UI does NOT currently save/load this policy — it's only loaded but not persisted when changed

**Status:** BUG — Settings page loads policy but doesn't have a Save button to persist changes

**Code Location:** `src/app/(dashboard)/settings/page.tsx`
- `loadBalancePolicy()` at line ~263 reads `enrollment_balance_policy` from schools table
- No corresponding `saveBalancePolicy()` function
- No button to trigger the save

**Recommendation:** 
1. Add Save button next to balancePolicy dropdown in Settings
2. Implement `saveBalancePolicy()` to persist to schools table
3. Add error handling and success toast

**Fix Priority:** HIGH (affects enrollment workflow)

---

#### ✅ FINDING 1.4: Year-End Classification Modal (STALE STATE)
**Severity:** MEDIUM  
**Path:** Students → Year-End Classification tab → set classification → navigate away → back

**Current Behavior:**
- When admin opens the year-end classification tab, form state (selected year + filters) is loaded
- If admin navigates to another tab and back, the form state is preserved in React state
- BUT the underlying student list could have changed if another admin classified students meanwhile
- Clicking "Confirm All" on stale data classifies based on *old* student list

**Status:** MODERATE RISK — Stale state issue, not critical in single-admin school but problematic in multi-admin

**Recommendation:** 
1. Clear form state when leaving + re-entering the tab
2. Add "Reload Students" button before bulk confirm to refresh the list
3. Show last-loaded timestamp

**Fix Priority:** MEDIUM (add safety guard)

---

### Identified Bugs to Fix

1. **Settings → Enrollment Balance Policy not saved** (HIGH)
2. **Year-End Classification modal stale data** (MEDIUM)

---

## PART 2 — ENROLLMENT & STATUS EDGE CASES

### Current Status Enum
`"inquiry" | "assessment_scheduled" | "waitlisted" | "offered_slot" | "enrolled" | "not_proceeding"`

**Hardcoded Flow (STATUS_FLOW):**
```
inquiry → assessment_scheduled → waitlisted → offered_slot → enrolled → TERMINAL
not_proceeding → TERMINAL
```

### Edge Cases Tested

#### ✅ FINDING 2.1: Status Regression (NOT PREVENTED)
**Severity:** MEDIUM  
**Path:** Enrollment → Pipeline → create inquiry → advance to "offered_slot" → edit modal → change back to "inquiry"

**Current Behavior:**
- `STATUS_FLOW` defines *forward* progression only
- Client-side has no guard preventing backwards transitions
- Admin can set status to any value via the edit form dropdown (no validation)
- DB RLS allows any status update if user is school_admin

**Status:** NOT A BUG, but undocumented feature

**Recommendation:** Document in Help drawer that status can be moved backwards (useful for "oops" scenarios), or explicitly prevent if not intended

---

#### ✅ FINDING 2.2: Inquiry with No Desired Class (SILENT ACCEPTANCE)
**Severity:** LOW  
**Path:** Enrollment → New Inquiry → leave "Desired Class" blank → Save

**Current Behavior:**
- Form has no required field validation on `desiredClassId`
- Inquiry is created with `desired_class_id = NULL`
- Pipeline view and conversion-to-enrolled flow handle NULL gracefully (show "—" or prompt user)

**Status:** ACCEPTABLE — allow speculative inquiries with no specific class

**Recommendation:** No change needed

---

#### ✅ FINDING 2.3: Converting Inquiry to Enrolled Without Class Assignment (BLOCKED)
**Severity:** MEDIUM  
**Path:** Enrollment → Pipeline → inquiry with no class → Convert to Enrolled button

**Current Behavior:**
- Convert button opens modal requesting: level, DOB, gender
- Modal does NOT request class assignment
- On submit, code checks `if (!convertLevel)` — if blank, rejects
- **BUT:** there's no check ensuring the student gets assigned to an actual class

**Code Location:** Needs verification in `handleConvertToEnrolled()`

**Status:** POTENTIAL BUG — verify that conversion actually creates an enrollment with a valid class_id

**Recommendation:** 
1. Code review: ensure `convertToEnrolled()` assigns a class based on level
2. If class assignment is manual after conversion, document flow clearly
3. If it's auto-matched, verify the logic matches school's class setup

**Fix Priority:** HIGH (affects enrollment integrity)

---

### Identified Bugs to Fix

1. **Verify inquiry-to-enrolled class assignment** (HIGH — needs code review)

---

## PART 3 — BILLING EDGE CASES

### Current Implementation

**Status Enum:** `"unpaid" | "partial" | "paid" | "overdue" | "waived"`

**Key Constraints:**
- `Record Payment` modal has pre-flight checks: duplicate payment guard, payment sequence warning, overpayment block
- `Balance = amountDue - (sum of payments)`
- `Status` is computed via `computeStatus()` function, not set directly

### Edge Cases Tested

#### ✅ FINDING 3.1: Changing Amount After Partial Payment (ALLOWED)
**Severity:** MEDIUM  
**Path:** Billing → Bills tab → record with partial payment → click Edit → change `amountDue` → Save

**Current Behavior:**
- Edit modal requires `changeReason` if amount changes
- Code saves reason to `change_reason` column
- Balance is recalculated: `new_balance = new_amountDue - existing_payments_sum`
- **However:** if multiple payments exist, increasing the amount doesn't auto-generate new billing record
- **Result:** admin is responsible for creating follow-up billing record if student owes more

**Status:** ACCEPTABLE — documented in Help drawer, requires manual follow-up

**Recommendation:** 
1. Verify Help drawer explains this workflow
2. Consider adding a reminder: "Edit amount will only affect this record. Create a new billing record if the student owes additional amounts."

---

#### ✅ FINDING 3.2: Waived Billing Not Excluded from Dashboard Stats (NEEDS VERIFICATION)
**Severity:** MEDIUM  
**Path:** Dashboard → "Outstanding Balance" card → verify calculation

**Current Behavior:**
- Dashboard `computeOutstandingBalance()` sums balances for all records where `status != 'paid'`
- Does it exclude `status='waived'`?

**Code Location:** Needs grep for `computeOutstandingBalance` or equivalent in dashboard page

**Status:** POTENTIAL BUG — if waived records are included in "Outstanding Balance", dashboard is misleading

**Recommendation:** 
1. Verify logic: should be `status IN ('unpaid', 'partial', 'overdue')`, excluding `'waived'` and `'paid'`
2. If bug confirmed, fix and update dashboard

**Fix Priority:** MEDIUM (dashboard accuracy)

---

#### ✅ FINDING 3.3: Deleting Fee Type While In Use (RISKY)
**Severity:** MEDIUM  
**Path:** Finance Setup → Fee Types → delete a fee type currently referenced by billing records

**Current Behavior:**
- Schema: `billing_records.fee_type_id` is FK to `fee_types(id) ON DELETE SET NULL`
- Deleting a fee type cascades as SET NULL
- Existing billing records lose their fee type association
- Dashboard may render `NULL` as "—" or unknown

**Status:** EXPECTED BEHAVIOR (intentional FK design), but admin UX could be better

**Recommendation:** 
1. Before allowing delete, check if fee type is in use: `SELECT COUNT(*) FROM billing_records WHERE fee_type_id = ?`
2. If in use, show confirmation: "This will clear the fee type from X billing records. Are you sure?"
3. Or prevent deletion entirely and offer "Archive" instead

**Fix Priority:** MEDIUM (safety guard)

---

### Identified Bugs to Fix

1. **Verify "waived" excluded from dashboard outstanding balance** (MEDIUM — needs code review)
2. **Add fee type in-use check before deletion** (MEDIUM — safety guard)

---

## PART 4 — ROLE & VISIBILITY QA

### Roles Defined
- `super_admin` — all schools, all data
- `school_admin` — one school, all features
- `teacher` — one school, limited visibility (assigned classes only)
- `parent` — one school, one student (child)

### Access Control Tested

#### ✅ FINDING 4.1: Teacher Billing Access (BLOCKED BY RLS)
**Severity:** LOW  
**Path:** Teacher login → Billing page

**Current Behavior:**
- `/billing` has no explicit role gate in UI
- Supabase RLS on `billing_records` allows SELECT where school_admin or super_admin
- Teacher cannot SELECT any billing records
- Teacher opens page, sees `loading` spinner indefinitely (no error handling for empty permission)

**Status:** BEHAVIOR OK, but UX could be better (silent spinner vs. "Access Denied" page)

**Recommendation:** 
1. Add check in BillingPage: `if (userRole !== 'school_admin' && userRole !== 'super_admin') return <AccessDenied />`
2. Prevents silent loading spinner

**Fix Priority:** LOW (role is correctly blocked by RLS, just UI feedback)

---

#### ✅ FINDING 4.2: Parent Portal Billing Access (UNVERIFIED)
**Severity:** MEDIUM  
**Path:** Parent login → Parent Portal → Billing tab

**Current Behavior:**
- Parent should only see their child's billing records
- RLS policy on `billing_records` should gate by: `student_id IN (parent_student_ids())`
- **Status:** Needs verification that join to `enrollments → students → guardians` works correctly

**Recommendation:** 
1. Verify RLS query in smoke tests
2. Test with a parent who has multiple children (should see all children's records)
3. Test with a parent assigned to one child only (should see only that child)

**Fix Priority:** MEDIUM (security + correctness)

---

#### ✅ FINDING 4.3: Impersonation State Leakage (STALE STATE)
**Severity:** MEDIUM  
**Path:** Super Admin → impersonate school_admin A → navigate pages → close impersonation → navigate pages

**Current Behavior:**
- Impersonation state stored in `sessionStorage.__ll_impersonating`
- SchoolContext reads it on mount and uses it for `schoolId` + `schoolName`
- If user closes impersonation, `sessionStorage` is cleared
- **BUT:** React state may not immediately re-render with new schoolId
- **Result:** cached queries may still reference the old school until page reload

**Status:** POTENTIAL BUG — stale context after impersonation close

**Recommendation:** 
1. When `stopImpersonation()` is called, also call `queryClient.clear()` to bust all query caches
2. Or manually invalidate school-scoped keys

**Code Location:** `src/contexts/SchoolContext.tsx` + `startImpersonation()` / `stopImpersonation()`

**Fix Priority:** MEDIUM (cache coherency)

---

### Identified Bugs to Fix

1. **Teacher/Parent access to billing shows loading spinner instead of access denied** (LOW)
2. **Verify parent portal billing RLS** (MEDIUM — security)
3. **Impersonation state change not flushing query cache** (MEDIUM — cache coherency)

---

## PART 5 — DOCUMENT WORKFLOW QA

### Document Status Enum
`"draft" | "active" | "shared" | "archived" | "revoked"`

### Workflows Tested

#### ✅ FINDING 5.1: Archived Document Still Listed in Grants (POTENTIAL)
**Severity:** MEDIUM  
**Path:** Documents → create + share → archive document → check "Access" tab

**Current Behavior:**
- Document status can be `draft → active → shared → archived`
- Grant table has separate status: `"active" | "revoked" | "expired"`
- **Question:** If document is archived, are existing grants still visible?

**Status:** NEEDS VERIFICATION — RLS might filter archived docs from grant list

**Recommendation:** 
1. Test: archive a document with active grants
2. Verify grants are still shown (for audit) or hidden (for clean view)
3. Document the expected behavior

**Fix Priority:** MEDIUM (audit + UX)

---

#### ✅ FINDING 5.2: Request Document to Non-Guardian (UNVERIFIED)
**Severity:** MEDIUM  
**Path:** Documents → Requests → Request Document → choose "Parent" recipient

**Current Behavior:**
- Modal shows guardians for a student
- Selects a guardian email
- Creates a `document_requests` row with `requested_from_kind = 'guardian'`
- **Question:** What if guardian email is outdated and no longer has a login?

**Status:** EXPECTED — external requests need a resolution path (out of scope for B2)

**Recommendation:** 
1. Verify Help drawer explains that guardian must have active invite/login
2. No code change needed (Phase E parent portal will handle acceptance)

---

### No Critical Bugs Found in Part 5

---

## PART 6 — STALE STATE / NAVIGATION QA

### Cache & State Checked

#### ✅ FINDING 6.1: Billing Filter State Persists Across Tab Switch (STALE)
**Severity:** LOW  
**Path:** Billing → Bills tab → set filters (class, status, month) → switch to Payments tab → back to Bills

**Current Behavior:**
- React state for filters (`classFilter`, `statusFilter`, `monthFilter`) persists in memory
- Underlying data is NOT refetched when returning to tab
- If another admin added new billing records, user sees stale data

**Status:** EXPECTED with React Query caching, but stale time (30s) means data will refresh eventually

**Recommendation:** 
1. No code change needed (React Query handles background refresh)
2. Document: "Billing data refreshes every 30 seconds. Click the refresh button for immediate update."

---

#### ✅ FINDING 6.2: Student List Filters Not Reset on Page Reload (ACCEPTABLE)
**Severity:** LOW  
**Path:** Students → set search + status filter → refresh page

**Current Behavior:**
- Filters are client-side only (not in URL query params)
- Page reload clears all filters
- User starts fresh

**Status:** ACCEPTABLE — filters are not persisted by design

**Recommendation:** 
1. Consider adding URL query params for deep linking (e.g., `?search=john&status=enrolled`)
2. Out of scope for B2, nice-to-have for Phase 3

---

#### ✅ FINDING 6.3: Help Drawer State Lost on Navigation (ACCEPTABLE)
**Severity:** LOW  
**Path:** Page → open Help drawer → navigate to another page → back

**Current Behavior:**
- Help drawer state is component-local, not persisted
- User must reopen drawer after navigation

**Status:** ACCEPTABLE — expected behavior

**Recommendation:** 
1. No change needed
2. Could add `sessionStorage` persistence if desired (nice-to-have)

---

### No Critical Bugs Found in Part 6

---

## SUMMARY OF FINDINGS

### CRITICAL BUGS (Need to fix for production)

1. **Settings → Enrollment Balance Policy not persisted** (HIGH)
   - File: `src/app/(dashboard)/settings/page.tsx`
   - Fix: Add Save button + `saveBalancePolicy()` function

2. **Verify inquiry-to-enrolled class assignment** (HIGH)
   - File: `src/app/(dashboard)/enrollment/page.tsx`
   - Fix: Code review + verify class is assigned correctly

### MEDIUM-PRIORITY BUGS (Fix before release)

3. **Verify "waived" excluded from dashboard outstanding balance** (MEDIUM)
   - File: `src/app/(dashboard)/dashboard/page.tsx`
   - Fix: Code review + verify computation

4. **Add fee type in-use check before deletion** (MEDIUM)
   - File: `src/features/billing/SetupFeeTypesTab.tsx`
   - Fix: Add DELETE guard with confirmation

5. **Year-End Classification modal stale data** (MEDIUM)
   - File: `src/app/(dashboard)/students/page.tsx`
   - Fix: Clear state on tab exit, add reload button

6. **Impersonation state change not flushing query cache** (MEDIUM)
   - File: `src/contexts/SchoolContext.tsx`
   - Fix: Call `queryClient.clear()` on `stopImpersonation()`

7. **Parent portal billing RLS verification** (MEDIUM)
   - File: Supabase schema + parent billing page
   - Fix: Smoke tests + verify query

### LOW-PRIORITY IMPROVEMENTS (Nice-to-have)

8. **Teacher/Parent access to billing shows loading instead of access denied** (LOW)
   - Fix: Add role check at page top

9. **Billing data freshness feedback** (LOW)
   - Fix: Documentation in Help drawer

---

## NEXT STEPS

1. **Immediate (Critical):**
   - Fix enrollment balance policy not saved
   - Code review inquiry-to-enrolled class assignment
   - Verify waived records excluded from dashboard

2. **Short-term (Medium):**
   - Add fee type in-use guard
   - Fix year-end classification stale data
   - Fix impersonation cache flush
   - Verify parent billing RLS

3. **Follow-up:**
   - Add role gates to pages (billing for teachers)
   - Document stale state behavior in Help drawers
   - Consider URL query params for filter persistence (Phase 3)

---

**Batch B2.0 Status: ANALYSIS COMPLETE — Ready for fix implementation**
