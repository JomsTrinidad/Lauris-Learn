# Data Retention & Deletion Policy — Lauris Learn
## DRAFT FOR LEGAL REVIEW

**Last Updated:** May 2026  
**Status:** ⚠️ DRAFT — Not yet approved by legal counsel  

---

## 1. OVERVIEW

This policy defines how long Lauris Learn retains different types of school and student data, and how data is deleted or archived when no longer needed.

**Goals:**
- Comply with FERPA, state education laws, and tax/audit requirements
- Minimize data retention risk while honoring legal obligations
- Provide schools with clarity on data lifecycle
- Enable parents/students to request data deletion where permitted

---

## 2. RETENTION PRINCIPLES

### A. Legal Minimization

We retain data only as long as:
- Required by law (FERPA, tax law, child labor law, etc.)
- Necessary for school operations
- Requested in writing by the school

### B. School Authority

Schools determine:
- Whether to use Lauris Learn
- Which data to collect
- Retention period (within our policy)
- Deletion timeline

### C. Permanent Records

Some records are legally permanent and cannot be deleted:
- Educational records (per FERPA)
- Accounting records (per tax law)
- Special education records (per IDEA)

Schools may archive but not delete these.

---

## 3. RETENTION SCHEDULE BY DATA TYPE

### A. Student Educational Records (Permanent)

**Definition:**
- Enrollment records
- Attendance records
- Grades and progress reports
- Teacher observations and evaluations
- Behavioral records
- Disciplinary records
- Accommodations and special education records

**Retention:** **Permanent in educational records**

**Rationale:**
- FERPA defines these as educational records; schools must retain for audit
- Students need permanent transcript access
- Schools need records for cumulative file

**Disposal:**
- Records are archived, not deleted
- Archive remains accessible to school staff
- Archive remains accessible to students (per FERPA)
- Archive is not accessible to parents after student reaches age of majority (unless student consents)
- Archive can be sealed upon request if record is disputed or corrected

---

### B. Student Demographic Information (Duration of Enrollment + X Years)

**Definition:**
- Name, date of birth, gender, identifiers
- Address, phone, emergency contacts
- Medical information (allergies, conditions)
- Photo/profile picture

**Retention:** **Active enrollment + 3 years**

**Rationale:**
- Needed while student is active (directory, communication, safety)
- Retained 3 years after graduation in case of appeal, transcript request, or alumni communication

**Disposal After 3 Years:**
- Demographic information is deleted from active system
- Historical data may be retained in archive for cumulative file
- Medical information is flagged "archived" rather than deleted
- Identifiers (LRN, passport number) are retained only for audit trail, actual values deleted

---

### C. Billing & Payment Records (7 Years)

**Definition:**
- Billing records (monthly tuition, fees, charges)
- Payment records (amount, date, method, receipt)
- Payment receipts (photos or documents)
- Discounts and credits applied
- Tuition configuration and pricing history

**Retention:** **[7 years] from date of transaction**

**Rationale:**
- IRS requires 7-year retention for business records
- Tax audit lookback is up to 7 years
- Disputes may arise years later
- Parent may request refund/credit documentation

**Disposal After 7 Years:**
- Billing data is deleted from active system
- Summary ledger (total paid, total owed, balance history) may be retained
- Individual payment records are deleted
- Parent invoices and receipts are deleted
- Payment method details (card number, bank account) are deleted after [X] days per PCI-DSS

---

### D. Teacher Observations & Notes (Duration of Enrollment + 1 Year)

**Definition:**
- Teacher progress notes
- Classroom observations
- Behavioral incidents (non-disciplinary)
- Intervention records
- Meeting notes (parent-teacher conferences)

**Retention:** **Duration of enrollment + [1 year]**

**Rationale:**
- Relevant only while student is active
- [1 year] buffer allows for year-end cleanup and archive before deletion
- Some states require 1-year retention for audit

**Disposal Process:**
1. Teacher notes remain visible during enrollment
2. Upon graduation/withdrawal, notes are marked "archived"
3. After [1 year], archived notes are deleted
4. No opt-out — these are deleted by policy after [1 year]

**Exception — Special Education:**
- IEP meetings notes are retained as part of permanent special ed file
- Behavior incident records in IEPs are retained per IDEA (permanent)

---

### E. Document Access Logs & Audit Trails (3 Years)

**Definition:**
- Timestamps of document access
- User who accessed the document
- Action taken (view, download, preview)
- Signed URLs minted
- Consent grants and revocations
- Permission changes

**Retention:** **[3 years]**

**Rationale:**
- Needed for audit and compliance verification
- Supports FERPA audit requirements
- Useful for security investigations
- Helps resolve disputes about data access

**Disposal After 3 Years:**
- Logs are archived to encrypted backup
- Archives are deleted after [5 years] total retention
- Data subject cannot request deletion of audit logs (these are for school's protection)

---

### F. Parent & Guardian Contact Information (Active + [X] Years)

**Definition:**
- Parent name, email, phone
- Relationship to student
- Communication preferences
- Billing address

**Retention:** **Active enrollment + 2 years**

**Rationale:**
- Needed to contact parents during enrollment
- Used for billing after graduation
- 2 years allows for final billing/credit resolution and sibling continuation

**Disposal:**
- After 2 years, contact is deleted unless required for other purposes
- Parent email/phone is removed from active contact list
- Archived contact in old billing records is anonymized

---

### G. Backup Data & Snapshots (90 Days)

**Definition:**
- Automatic daily backups
- Database snapshots for recovery
- Point-in-time recovery copies

**Retention:** **[90 days]**

**Rationale:**
- Enables recovery from accidental deletion
- Supports disaster recovery
- Balances recovery needs with storage cost

**Disposal:**
- After [90 days], backups are automatically overwritten
- No recovery possible after [90 days] unless school has paid for extended archive
- Deleted data is purged from backups and is permanently unrecoverable

---

### H. Device/Access Logs (1 Year)

**Definition:**
- Login timestamps
- Failed login attempts
- IP addresses
- Device information (browser, OS)
- Session information

**Retention:** **[1 year]**

**Rationale:**
- Needed for security investigations and anomaly detection
- Helps identify compromised accounts
- Supports incident response

**Disposal:**
- Logs older than [1 year] are archived
- Archived logs are deleted after [3 years]
- User cannot request deletion of own access logs

---

### I. Invite Tokens & Temporary Data (30 Days)

**Definition:**
- One-time invite links sent to new users
- Password reset tokens
- Session tokens
- Temporary files during uploads
- Session tokens and invite tokens

**Retention:** **30 days or upon use (whichever is sooner)**

**Rationale:**
- Invites expire to prevent unauthorized access
- Used invites are immediately invalidated
- Temporary data is cleaned up after upload succeeds/fails

**Disposal:**
- Expired invites are automatically deleted after 30 days
- Temporary upload data is deleted immediately after final save or rollback
- Tokens are never cached for more than 24 hours

---

### J. Incident Reports & Investigation Records (7 Years)

**Definition:**
- Reports of bullying, abuse, or safety concerns
- Investigation notes and findings
- Corrective actions taken
- Suspension/expulsion records

**Retention:** **[7 years]**

**Rationale:**
- Legal liability for incidents may extend 7 years (age of majority + repose period)
- May be needed for civil litigation
- School needs historical context for pattern identification

**Disposal:**
- Records older than [7 years] are archived
- Archived records are available upon legal request
- Annual review by school administrators

---

## 4. RETENTION BY ROLE & CONTEXT

### A. Student Records (by Grade)

| Grade | During Enrollment | After Graduation | Permanent File |
|-------|------------------|-----------------|-----------------|
| PreK–K | All records | Delete after [X] years | Name, DOB, grades |
| Elementary | All records | Delete after [X] years | Name, DOB, grades, major incidents |
| Middle | All records | Delete after [X] years | Name, DOB, grades, major incidents, IEP (if applicable) |
| High School | All records | Retained [X] years for transcript requests | Name, DOB, grades, diploma info, IEP (if applicable) |

---

### B. Staff Records

**Teacher/Staff Name & Email:** Retained while employed + [1 year]  
**Lesson Plans/Notes Created:** Owned by school, retained per school policy  
**Access Logs:** [3 years] per general audit policy  
**Evaluations/Performance Reviews:** School's policy + [1 year] after separation  

---

### C. School Administrator Records

**Trial/License Info:** Retained duration of relationship + [X] years  
**Billing & Invoice:** [7 years]  
**System Configuration:** Retained while school is active + [1 year] after  
**Admin Activity Logs:** [1 year]  

---

## 5. DATA DELETION PROCESS

### A. Automated Deletion

**Data automatically deleted by the system:**
- Expired invite tokens (after [30 days])
- Failed temporary uploads (after [24 hours] or on retry)
- Expired password reset tokens (after [1 hour])
- Session tokens (upon logout or [24] hour expiry)
- Audit logs older than [3 years] (annual cleanup)

**Schedule:** Automated weekly/monthly cleanup runs at [UTC time] with no service impact.

---

### B. School-Requested Deletion

Schools may request deletion of:
- Student records (after graduation retention period expires)
- Archived documents
- Payment records (after [7 years])
- Staff accounts and associated notes

**Process:**

1. **School submits deletion request** to [deletion@example.com]
   - What data to delete (student ID, staff ID, date range, etc.)
   - Reason (graduation, withdrawal, privacy request, etc.)
   - Confirmation that billing is settled

2. **We verify the request**
   - Check student/staff status
   - Verify deletion is permitted by policy
   - Confirm no legal hold or pending investigation

3. **Data is marked for deletion**
   - Marked with deletion date + 30-day grace period
   - Remains viewable in system (marked "PENDING DELETION")
   - Parents/students can dispute within grace period

4. **Final deletion**
   - After grace period, data is deleted from live system
   - Removed from backups after 30 days (at next backup cycle)
   - Deletion confirmed in writing to school

5. **Exceptions are documented**
   - If deletion cannot proceed (legal hold, dispute, policy block), school is notified with reason

---

### C. Data Subject (Parent/Student) Deletion Request

Parents/students may request deletion of:
- Their own contact information (after student graduated)
- Photos or media they provided
- Specific documents they uploaded
- Data created about them (subject to exceptions)

**Cannot be deleted:**
- Educational records (per FERPA)
- Attendance and grades
- Billing records (per tax law)
- Audit logs
- Behavior/discipline records
- IEP and special ed records

**Process:**

1. **Subject submits deletion request** via [dsar@example.com]
   - Specifies what data to delete
   - Provides reason/justification

2. **School reviews request**
   - School determines if deletion is permitted
   - School may deny if deletion violates law
   - School may offer alternative (anonymize instead of delete)

3. **If approved, data is deleted** per process above

4. **Confirmation** is provided to subject within 5 business days

---

## 6. DELETION IMPACT & CONSTRAINTS

### A. What Cannot Be Deleted

- Educational records (grades, attendance, progress)
- Assessment results and test scores
- Disciplinary records
- Special education records and IEPs
- Audit logs and access trails
- Billing records required by law
- Any data subject to legal hold

### B. Partial Deletions

Data may be partially deleted if permitted:

| Data Type | Can Anonymize | Can Delete | Outcome |
|-----------|---------------|-----------|---------|
| Student name | Yes | Only if record deleted | Name removed, record preserved |
| Grade/score | No | No | Permanently retained |
| Address | Yes (after retention period) | Yes | Address deleted, record remains |
| Photo | Yes | Yes | Photo deleted, record text remains |
| Medical info | No (educational record) | No | Retained per FERPA |
| Teacher notes | No (educational record) | No | Retained as part of file |

---

### C. Anonymization Alternative

If deletion is not permitted but privacy is a concern:
- Name is replaced with "Student [ID]"
- Contact information is removed
- Identifying details are redacted
- Record remains for audit but is de-identified

---

## 7. ARCHIVAL (vs. Deletion)

### Definition

**Archival** = Data is removed from active access but retained for historical reference and legal compliance.

**Deletion** = Data is permanently destroyed and unrecoverable.

### When Archival is Used Instead of Deletion

- Educational records (archived, never deleted)
- Billing records at end of [7 years] (moved to archive storage)
- Special education records (archived after graduation)
- Disciplinary records (archived after statute of limitations)
- Audit logs (archived after [3 years], deleted after [5 years])

### Archive Access

- School admins can access archives via secure portal
- Archive queries are logged
- No student/parent access to old archives
- External access requires legal process (subpoena)

---

## 8. SCHOOL TRANSITION & DATA EXPORT

### A. School Changing Providers

If a school leaves Lauris Learn:

1. **Data Export** (within [30 days])
   - School receives complete export of all records
   - Format options: CSV, JSON, PDF
   - Encrypted transfer

2. **Continuing Access** ([X] days after cancellation)
   - School admin can still access data for [X] days
   - Can export additional files or make corrections
   - Read-only access only

3. **Deletion** (after [X] days)
   - Data is deleted from Lauris Learn servers
   - School retains its exported copy
   - Backups purged after [90 days]

---

### B. School Bankruptcy or Closure

If a school ceases operations:

1. **Data is preserved** for 30 days to allow parent access
2. **Parents can request export** of their child's records
3. **After 30 days**, data is archived or deleted per this policy
4. **State education authority** may be notified of closure (per law)

---

## 9. SPECIAL CIRCUMSTANCES

### A. Student Aging Out (Turns 18)

Upon reaching age of majority (18), student may:
- Access own records
- Manage own consent for future sharing
- Request deletion of certain data (if permitted)
- Parent loses automatic access (unless student consents)

**Records retained** even after student turns 18:
- Educational records (permanent)
- Grades and attendance
- Documents student needs for college/career
- Billing records (if student responsible for payment)

---

### B. Student Withdraws Mid-Year

Records retention does not change:
- All records retained per standard retention schedule
- Billing for partial month may be retained per school policy
- Access logs retained for [3 years]
- Graduation retention period starts from withdrawal date

---

### C. FERPA Amendment (Disputes)

If a parent disputes the accuracy of a record:
- A note of dispute is added to the record
- The disputed record is not deleted
- Both the original and dispute note are retained
- Amendment is available per FERPA request process

---

### D. Identity Theft or Fraud

If a data breach or identity theft is suspected:
- Investigation hold is placed on the record
- Record is not deleted during investigation
- Credit monitoring or remediation may be offered
- Records preserved for [X] additional years beyond normal retention

---

## 10. DOCUMENTATION & REPORTING

### A. Retention Schedule Audit

We will:
- Audit actual data retention quarterly
- Report compliance to school annually
- Flag any data retained beyond scheduled period
- Provide corrective action plan if issues found

---

### B. Deletion Log

All deletions are logged:
- Date of deletion
- Type of data deleted
- Number of records deleted
- Reason for deletion
- Authorized by (school admin or system)

**Log retention:** [7 years] for audit purposes.

---

### C. School Reporting

Schools can request:
- Data retention report (what data we hold, retention dates)
- Deletion history (what was deleted, when, why)
- Compliance certification (we are following this policy)

---

## 11. POLICY CHANGES & NOTICE

### A. Changes to This Policy

We may update this policy:
- Changes to retention periods require [X] days notice
- Changes to deletion processes require [X] days notice
- Material changes (e.g., new data types) require [X] days notice
- Schools may cancel if changes are unacceptable

### B. Legal Changes

If law requires different retention:
- We will comply with the law
- We will notify schools of required changes
- We will implement with minimal notice (if law requires)

---

## 12. CONTACT & REQUESTS

**For data retention questions:**  
[retention@example.com]

**For deletion requests (school):**  
[deletion@example.com]

**For data subject access/deletion requests:**  
[dsar@example.com]

**For policy clarification:**  
[compliance@example.com]

---

## APPENDIX A: RETENTION PERIODS QUICK REFERENCE

| Data Type | Retention Period | Delete | Archive |
|-----------|-----------------|--------|---------|
| Educational records (grades, attendance) | Permanent | ❌ | ✅ |
| Student demographic info | Enrollment + [X] years | ✅ | ✅ |
| Medical/allergy information | Permanent (archived) | ❌ | ✅ |
| Billing records | [7 years] | ✅ | ✅ |
| Access logs | [3 years] | ✅ | ✅ |
| Teacher observations | Enrollment + [1 year] | ✅ | ❌ |
| Special ed records | Permanent | ❌ | ✅ |
| Incident/discipline records | [7 years] | Varies | ✅ |
| Staff records | Employment + [1 year] | ✅ | ✅ |
| Backup data | [90 days] | ✅ (automatic) | ❌ |

---

**This Data Retention & Deletion Policy is a DRAFT for legal review only.**
