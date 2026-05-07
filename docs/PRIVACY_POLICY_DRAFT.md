# Privacy Policy — Lauris Learn
## DRAFT FOR LEGAL REVIEW

**Last Updated:** May 2026  
**Status:** ⚠️ DRAFT — Not yet approved by legal counsel  
**Effective Date:** [To be set by legal]  

---

## 1. INTRODUCTION

Lauris Learn is a school operations platform operated by [School Operator Name] on behalf of schools and their families. This Privacy Policy describes how we collect, use, protect, and disclose information when you use our platform.

**This is a draft document intended for review by legal counsel. Do not rely on this as final policy until approved.**

---

## 2. INFORMATION WE COLLECT

### A. Information Provided Directly

**School Administrators & Teachers:**
- Full name, email address, phone number (optional)
- Login credentials (managed by Supabase Auth)
- School assignment and role (admin, teacher, parent)
- Notes and observations about students

**Parents & Guardians:**
- Full name, email address, phone number (optional)
- Relationship to student
- Login credentials (managed via invite link + Supabase Auth)
- Communication preferences

**Students:**
- Full name, preferred name, legal name components
- Date of birth, gender, preferred pronouns
- Allergies, medical conditions, special needs
- Emergency contact information
- Authorized pickup contacts
- Profile photo (optional)
- Identifiers: Learning Registration Number (LRN), passport, national ID, etc.

### B. Information We Collect Automatically

**Device & Access Information:**
- IP address (captured with document/billing access events)
- User agent / browser info (captured with access events)
- Login timestamps and frequency
- Page access logs (document views, downloads, signed URL access)

**Usage Data:**
- Student attendance records (dates, status)
- Class enrollment and promotion history
- Document uploads and access events
- Billing record creation and payment history
- Parent update views and engagement

### C. Data Created by Users

**Teachers & School Staff:**
- Class attendance records
- Progress observations and ratings
- Student plans (IEPs, behavior plans, etc.)
- Parent updates, announcements, class feeds
- Document notes and versioning history

**Parents:**
- Consent grants for document access
- RSVP responses to school events
- Absence notifications
- Payment records and receipts

---

## 3. HOW WE USE INFORMATION

### A. Operational Use (Primary)

We use collected information to:
- Authenticate users and maintain secure sessions
- Display student information to authorized school staff and parents
- Record attendance, enrollment, and class assignments
- Manage billing records and payments
- Store and version control important documents (IEPs, medical records, etc.)
- Generate reports for school operations and regulatory compliance
- Track document access for audit and safety purposes

### B. Communication

We use contact information to:
- Send login invitations to new users
- Notify parents of school announcements and updates
- Send billing statements and payment reminders
- Provide technical support
- Notify of security incidents (if required)

### C. Analytics & Improvement (Limited)

We may use aggregated, non-identifying data to:
- Understand feature usage patterns
- Identify and fix technical issues
- Improve user experience
- Monitor system performance

**We do NOT:**
- Create student behavior profiles
- Use student data for marketing
- Share usage data with third parties (except as required by law)
- Sell or monetize student information

---

## 4. DATA RETENTION & DELETION

### A. Active Data (While Enrolled)

As long as a student is enrolled or a staff/parent relationship is active:
- All student records, documents, and access logs are retained
- Billing records remain visible to authorized parties
- Attendance and progress records are maintained

### B. Data After Enrollment Ends

**Upon student withdrawal or graduation:**
- Student records may be archived but remain accessible to authorized staff
- Documents remain in the student's record for historical reference
- Attendance and billing records remain for audit purposes
- Parent access is disabled unless explicitly granted ongoing access

**Timeline:** Data is retained for [X years] per school policy and applicable law.

### C. Account Deletion

**Staff/Parent Account Deletion:**
- Upon request, staff and parent login accounts can be deactivated
- Associated records (documents they uploaded, notes they wrote) remain
- Their user ID is anonymized in audit logs to protect privacy
- Full deletion requires principal/admin approval

**Complete School Deletion:**
- When a school ends its subscription, all data can be exported or archived
- Data is not automatically deleted; school retains copy
- Deleted data is removed from live servers after [X] days but may exist in backups for up to [X] years
- Backups are automatically deleted after [X] years per our retention schedule

### D. Data Subject Access & Correction

Parents and staff can:
- Request a copy of all data we hold about them
- Request correction of inaccurate information
- Request deletion of their own profile (staff) or child's non-essential data (parents)

**Process:** Submit request to [support email]. We will respond within [X] business days.

---

## 5. WHO WE SHARE DATA WITH

### A. Within Your School

Data is visible to:
- **School Administrators:** all student and staff records, billing, documents
- **Teachers:** student records for classes they teach, attendance, progress, documents uploaded for their students
- **Parents/Guardians:** only their own child's records, attendance, progress, documents shared with them by school

### B. External Sharing (Requires School Action)

Data is ONLY shared with external organizations (therapy clinics, medical practices) when:
- School admin explicitly grants document or identity access to that organization
- Parent consent is recorded in the system for sensitive documents (IEPs, medical records)
- Sharing is time-limited and can be revoked at any time

**External parties receive:**
- Identity information (name, DOB, identifiers) if identity grant includes identifiers scope
- Specific documents the school selects to share
- Access logs showing who accessed what and when

**External parties do NOT receive:**
- Teacher notes or progress observations (unless explicitly included in shared documents)
- Billing or payment information
- Other students' information
- Access to upload new documents (unless specifically granted)

### C. Service Providers

We share data with:
- **Supabase (Database & Auth):** [country], compliant with [data agreement terms]
- **Storage Provider (Supabase Storage):** [country], encrypted at rest and in transit
- **Error Monitoring (Optional):** [service name if enabled], aggregated error data only

**All service providers are contractually bound to:**
- Use data only to provide the service
- Maintain confidentiality
- Not use data for marketing or profiling
- Notify us of security breaches

### D. Legal Compliance

We may disclose information when:
- Required by law (subpoena, court order)
- Necessary to protect safety (imminent harm to a child)
- To enforce our Terms of Service
- To protect our legal rights

We will notify you of such disclosure unless legally prohibited.

---

## 6. DATA SECURITY

### A. Technical Safeguards

We protect data through:
- **Encryption in Transit:** All data transferred over HTTPS with TLS 1.2+
- **Encryption at Rest:** Database and storage encryption enabled in Supabase
- **Authentication:** Supabase Auth with secure password handling
- **Access Control:** Row-level security (RLS) policies restrict access by role
- **Audit Logging:** All document access, status changes, and access attempts are logged
- **Regular Backups:** Daily automated backups stored in encrypted storage

### B. Administrative Safeguards

- Limited staff access to production systems (only support/ops team)
- Staff access is logged and auditable
- No staff member can access raw student data without explicit authorization
- Regular security reviews and penetration testing

### C. Physical Security

Data is hosted on Supabase infrastructure in [region(s)]. Supabase maintains SOC 2 compliance and physical security controls.

### D. What You Should Do

- Keep your password strong and unique
- Do not share your login with other people
- Sign out after using Lauris Learn on shared devices
- Report suspicious activity immediately

---

## 7. CHILDREN'S PRIVACY (FERPA & COPPA)

### A. Family Educational Rights & Privacy Act (FERPA)

Lauris Learn is designed specifically to facilitate FERPA compliance:
- School administrators, teachers, and parents have role-based access only
- External sharing requires school and parent consent
- Access is logged for audit purposes
- Parents can request correction of student records
- Students' educational records are protected by law

### B. Children's Online Privacy Protection Act (COPPA)

For students under 13:
- Parents provide consent for their child to use parent-facing features
- We do not market to children
- We do not collect unnecessary information beyond what's needed for school operations
- Parents can request deletion of their child's profile (school retains educational records)

### C. School Responsibility

Schools remain responsible for:
- Notifying parents about Lauris Learn and obtaining permission
- Complying with state data protection laws
- Managing parental access and consent
- Conducting their own privacy impact assessments per their policies

---

## 8. YOUR RIGHTS & CHOICES

### A. Access & Portability

You can:
- Download your data in standard formats (CSV for records, PDF for documents)
- Request we export your child's complete educational record
- Access audit logs showing who accessed your child's documents

### B. Correction

You can:
- Update your own name, contact information, and preferences
- Request correction of your child's demographic information
- Admins can update student information

### C. Deletion & Withdrawal

You can:
- Withdraw your child from classes/school
- Request your own account deactivation
- Request deletion of documents you uploaded (with school approval)

**Note:** Deleting your account does not delete records created by others (teacher notes, attendance records, etc.) which remain the school's educational records.

### D. Opting Out

You can:
- Opt out of optional communications (announcements, reminders)
- Restrict document sharing with external organizations
- Disable view/download permissions for specific documents
- Revoke access grants to external parties

---

## 9. INTERNATIONAL DATA TRANSFER

If your school is located outside the region where Supabase operates:
- Your data may be transferred to and stored in [region]
- We ensure appropriate safeguards are in place
- You may request where your data is stored

**Data Protection Agreements:** We maintain data processing agreements compliant with applicable laws including GDPR (if applicable) and local data protection regulations.

---

## 10. THIRD-PARTY LINKS & SERVICES

Lauris Learn may include links to:
- Class management portals
- Online learning platforms
- Payment processors
- Parent communication apps

These third parties have their own privacy policies. We are not responsible for their practices. Schools should review third-party terms before integrating them.

---

## 11. POLICY CHANGES

We may update this policy to:
- Reflect changes in how we use data
- Comply with new laws
- Improve clarity

**Notification:** We will notify schools and users of material changes [X] days before they take effect. Continued use constitutes acceptance.

---

## 12. CONTACT US

**For Privacy Questions:**
- Email: [privacy@example.com]
- School Admin Contact: [admin contact form in app]
- Data Subject Access Request: [dsar@example.com]

**For Legal Requests:**
- Subpoena/Legal Process: [legal@example.com]
- Emergency Safety Concerns: [emergency@example.com]

---

## APPENDIX A: FERPA & State-Specific Requirements

### FERPA Directory Information (Opt-Out Available)

Schools may designate the following as directory information (shareable without consent):
- Student name, address, phone
- Grade level
- Dates of attendance
- Degrees/honors awarded

**Parents can opt out via:** [School's directory opt-out process]

### State-Specific Notices

**[State Name]:** [State-specific requirement, e.g., California CCPA notice]

---

## APPENDIX B: Data Processing Agreement (DPA)

[Optional: Include DPA template for GDPR/CCPA compliance if applicable]

**This privacy policy is a DRAFT for legal review only.**
