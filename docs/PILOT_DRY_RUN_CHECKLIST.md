# PILOT ONBOARDING DRY-RUN — Lauris Learn

## Objective
Verify that Bright Kids Learning and Tutorial Center (BK) can be fully onboarded and operate through core workflows without operational breakage.

## Step-by-Step Walkthrough (40 steps)

### PHASE 1: School Setup (Super Admin)
1. Sign in as super admin
2. Navigate to `/super-admin/schools`
3. Verify BK school exists or create "Bright Kids Learning and Tutorial Center"
   - **VERIFY:** School created with trial_status and active school year
4. Set trial: start = today, end = today + 30 days
   - **VERIFY:** Trial banner shows in dashboard
5. Check trial status is "active"
   - **VERIFY:** Dashboard accessible, no read-only overlay

### PHASE 2: School Admin Setup
6. Create school_admin profile: admin@bk.test, BK school
   - **VERIFY:** Admin can sign in, lands on /dashboard
7. Create teacher: maria@bk.test, role=teacher, BK school
   - **VERIFY:** Teacher can sign in to /dashboard

### PHASE 3: School Configuration
8. Settings → School Information: verify school name, address, phone
9. Settings → School Years: verify active SY exists
10. Settings → Academic Periods: verify Regular Term and Summer exist
11. Settings → Finance:
    - **VERIFY:** 5+ fee types exist
    - **VERIFY:** Tuition configs per level/period
    - Create new fee type "Testing Fee"
    - **VERIFY:** Persists on reload

### PHASE 4: Class & Teacher Setup
12. Classes page: view existing classes (Pre-K, Kinder, etc.)
13. Add new class:
    - Name: "Toddlers A"
    - Level: "Toddlers"
    - Time: 8:00 AM – 12:00 PM
    - Capacity: 12
    - **VERIFY:** Created and appears in list
14. Assign teacher Maria to Toddlers A
    - **VERIFY:** Assignment persists on reload

### PHASE 5: Student Enrollment
15. Students page: Add student
    - Name: "Test Student 1"
    - DOB: 2023-01-15
    - Guardian: parent1@bk.test (Parent One)
    - **VERIFY:** Student and guardian created
16. Enrollments (Pipeline): Add inquiry for Test Student 1
17. Progress inquiry → Waitlisted → Enrolled in Toddlers A
    - **VERIFY:** Enrollment created

### PHASE 6: Attendance
18. Attendance page: Select Toddlers A, today's date
19. Mark Test Student 1: Present
    - **VERIFY:** Record saved in database
20. Verify in DB: SELECT * FROM attendance_records WHERE student_id = X
    - **VERIFY:** Record exists

### PHASE 7: Billing
21. Billing page: Click "Generate Billing"
    - Month: current month
    - Period: Regular Term
    - Fee type: Tuition
    - Due date: 15th of next month
    - **VERIFY:** Billing record created for Test Student 1
22. Record payment:
    - Amount: partial (e.g., 50% of balance)
    - Method: Cash
    - OR#: TEST-001
    - **VERIFY:** Payment recorded, balance updated
23. Payments tab: Verify payment visible with correct OR#, date, amount
24. Click "Receipt": **VERIFY:** Printable receipt modal opens

### PHASE 8: Parent Portal
25. Sign in as parent1@bk.test
    - **VERIFY:** Lands on /parent/dashboard
    - **VERIFY:** See Test Student 1 in child list
26. Parent Student page: **VERIFY:** Can see Test Student 1's enrollment/class
27. Parent Billing page: **VERIFY:** Can see bill and payment, NOT other students' data
28. Parent Events page: **VERIFY:** Can see school events, RSVP works
29. Parent Progress page: **VERIFY:** Can see only parent_visible observations

### PHASE 9: Teacher Portal
30. Sign in as maria@bk.test
    - **VERIFY:** See only Toddlers A in available classes
31. Attendance page: Mark Test Student 1 as Late
    - **VERIFY:** Record saved
32. Parent Updates page: Post class update
    - Text: "Great day learning colors!"
    - **VERIFY:** Post created, visible to parents

### PHASE 10: Document Coordination (if implemented)
33. Documents page: Upload document
    - Student: Test Student 1
    - Type: School Accommodation Plan
    - Title: "Toddler Allergy Plan"
    - **VERIFY:** Document created as draft
34. Mark document Active
    - **VERIFY:** Status changes to Active
35. Click View: **VERIFY:** Opens in new tab with signed URL, PDF displays

### PHASE 11: Cross-School Isolation
36. As super admin, impersonate School B (if exists)
37. Try to find Test Student 1 (BK student): **VERIFY:** NOT found (0 rows)
38. Try to enroll BK student in School B class: **VERIFY:** RLS rejects

### PHASE 12: Parent Isolation
39. Link parent2@bk.test to different student (NOT Test Student 1)
40. Sign in as parent1: Try to view parent2's child
    - **VERIFY:** Access denied or 404

## PASS/FAIL

**PASS:** All steps complete without uncaught exceptions, all data isolation verified
**FAIL:** Any exception, RLS bypass, or isolation failure

## Evidence Checklist
- [ ] Test Student 1 ID: __________________
- [ ] BK School ID: __________________
- [ ] Billing record created: [ ] Yes [ ] No
- [ ] Payment recorded: [ ] Yes [ ] No
- [ ] Parent can see child's data: [ ] Yes [ ] No
- [ ] Parent CANNOT see other children: [ ] Yes [ ] No
- [ ] Cross-school isolation verified: [ ] Yes [ ] No
- [ ] Audit logs contain ≥10 entries: [ ] Yes [ ] No
- [ ] No sensitive data in error messages: [ ] Yes [ ] No
- [ ] All pages load within 2 seconds: [ ] Yes [ ] No
