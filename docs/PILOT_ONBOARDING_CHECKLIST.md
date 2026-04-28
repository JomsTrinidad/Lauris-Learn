# Pilot School Onboarding Checklist

A practical, step-by-step guide for setting up a new pilot school in Lauris Learn.
This is written for the platform owner (you), not the school's technical staff.

---

## Before You Start

- [ ] School owner or designated admin contact confirmed
- [ ] Pilot agreement or terms acknowledged (even informally)
- [ ] Support contact explained to school (your email / messaging channel)
- [ ] School logo file ready (PNG or JPG, under 1 MB)

---

## Step 1 — Create the School in the Platform

As super admin:

1. Go to `/super-admin/schools`
2. Click **New School**
3. Enter the school name exactly as it should appear in the platform
4. Set trial start and end dates (default 14 days; extend if needed)
5. Leave "mark as demo" unchecked for real pilot schools
6. Enter the admin's email and full name (they must already have an account, or create one at `/login` first)
7. Click **Create School**

**Verify:** The school appears in the schools list with Trial status.

---

## Step 2 — Configure School Profile

Log in as the school admin (or impersonate the school):

1. Go to **Settings → School Information**
2. Fill in: school name, address, phone number
3. Upload the school logo (under 1 MB)
4. Set primary and secondary brand colors if desired
5. Save — the logo should appear in the sidebar immediately

---

## Step 3 — Set Up the School Year

1. Go to **Settings → School Years**
2. Click **Add School Year**
3. Enter the year name (e.g. "SY 2025–2026"), start date, end date
4. Set status to **Active**
5. Save

Then add Academic Periods (Terms):
1. Expand the school year → click **Add Term**
2. Add "Regular Term" with correct dates
3. Add "Summer Term" if applicable

---

## Step 4 — Set Up Fee Types

1. Go to **Finance → Fee Types**
2. Add the fees this school uses (e.g. "Tuition Fee", "Miscellaneous Fee")
3. Add descriptions if helpful
4. Mark all as Active

---

## Step 5 — Configure Tuition Rates (Optional for Pilot)

If the school wants to use auto-generate billing:

1. Go to **Finance → Tuition Setup**
2. Select the academic period (Regular Term)
3. Add a rate for each level/grade (e.g. Kinder: ₱5,000/month)

This step can be skipped if billing will be entered manually.

---

## Step 6 — Add Classes

1. Go to **Classes**
2. Click **New Class**
3. For each class: enter name, level/grade, capacity
4. Assign a teacher if staff are already set up

Repeat for all classes. Typical preschool: Toddler, Pre-Kinder, Kinder.

---

## Step 7 — Add Staff (Teachers and Admins)

1. Go to **Settings → Staff**
2. Click **Add Teacher** or **Add Admin**
3. Enter their email address (they will need to sign up at `/login` first)
4. Set their name and role
5. Upload a profile photo if desired

**Note:** Staff must create their own Lauris Learn account before they can be added here. Their account links automatically once the email matches.

---

## Step 8 — Add Students

1. Go to **Students**
2. Click **Add Student**
3. For each student: full name, date of birth (optional), grade/level
4. Enroll the student into a class in the same modal

Repeat for all students. Students can be imported manually; bulk import is not yet available.

---

## Step 9 — Link Parents / Guardians

For each student:

1. Open the student record (click the student's name in Students)
2. Click **Add Guardian**
3. Enter the parent's name, email, and relationship (e.g. Mother)
4. Mark as Primary if they are the main contact
5. Click **Send Invite** — an email is sent to the parent with a link to create their account

**After the parent accepts the invite:**
- The parent can log in at `/login`
- They are redirected to the parent portal automatically
- They can see their child's attendance, class updates, billing, and progress

---

## Step 10 — Test Core Flows

Before handing over to the school, verify these yourself:

- [ ] Attendance: mark one class for today → confirm records saved
- [ ] Class update: post a text update with a photo → confirm parent sees it in their portal
- [ ] Billing: generate one billing record → record a test payment → confirm parent sees it
- [ ] Proud moment: add one for a student → confirm it appears in the student record
- [ ] Parent portal: log in as a linked parent → confirm child info, updates, billing are visible

---

## Step 11 — Hand Off to the School

- [ ] Share the platform URL with the school admin
- [ ] Walk the admin through: adding students, marking attendance, posting updates
- [ ] Provide your support contact for questions
- [ ] Explain the parent invite flow so the admin can do it themselves
- [ ] Set a check-in date (1 week in is a good first touchpoint)

---

## Common Issues at Onboarding

| Issue | Likely Cause | Fix |
|---|---|---|
| Parent can't log in | They haven't accepted the invite | Resend invite from Students → guardian record |
| Parent sees no data | Guardian email doesn't match their login email | Check email spelling in guardian record |
| Attendance won't save | No active school year set | Go to Settings → School Years → mark one as Active |
| Billing generate does nothing | No fee types configured | Add at least one fee type in Finance → Fee Types |
| Logo not showing | File too large (>1 MB) | Resize or compress the image and re-upload |
