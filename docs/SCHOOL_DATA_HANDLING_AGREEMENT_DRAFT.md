# School Data Handling Agreement — Lauris Learn
## DRAFT FOR LEGAL REVIEW

**Last Updated:** May 2026  
**Status:** ⚠️ DRAFT — Not yet approved by legal counsel  
**Effective Date:** [To be set by legal]  

---

## 1. PURPOSE & PARTIES

This Data Handling Agreement ("Agreement") establishes the terms under which Lauris Learn ("Service Provider") processes student and school data on behalf of [School Name] ("School").

### Parties
- **Service Provider:** Lauris Learn [Legal Entity]
- **School:** [School Name] located in [State]
- **Data Subjects:** Students, parents, staff employed by or associated with the School

### Definitions

**Personal Data:** Any information that can identify a student, parent, or staff member:
- Names, dates of birth, identifiers (LRN, ID numbers)
- Contact information (email, phone, address)
- Educational records (enrollment, attendance, grades, IEPs)
- Health information (allergies, medical conditions)
- Financial information (billing, payment history)
- Observations and behavioral notes

**Educational Records:** Data defined as "educational records" under FERPA.

**Processing:** Any operation on data including collection, storage, access, modification, deletion, or sharing.

---

## 2. ROLES & RESPONSIBILITIES

### Service Provider Responsibilities

The Service Provider agrees to:

**A. Processing Limitations**
- Process data only as instructed by the School
- Process data only for purposes specified by the School
- Not use data for any other purpose (including internal analytics, marketing, profiling)
- Not combine data with data from other sources
- Not share data with third parties except as instructed

**B. Security & Protection**
- Implement and maintain reasonable security measures including:
  - Encryption in transit (TLS 1.2+) and at rest
  - Access controls limiting access to authorized personnel
  - Secure authentication for all users
  - Audit logging of all data access
  - Regular security assessments
- Promptly notify the School of any data breach or unauthorized access
- Remediate security vulnerabilities within 5 business days
- Maintain confidentiality of data

**C. Data Retention & Deletion**
- Retain data only as long as necessary for the specified purpose
- Upon School request, securely delete all data (except backups)
- Retain backups for [X] days after deletion request, then permanently delete
- Confirm deletion in writing upon request
- Provide data export in standard formats upon request

**D. Subprocessors**
- Notify School of any third-party service providers (subprocessors)
- Maintain data processing agreements with all subprocessors
- Only use subprocessors approved by the School
- Remain responsible for subprocessor conduct

**Current Subprocessors:**
- Supabase (Database & Authentication) — Asia Pacific (AP) regions, USA
- Supabase Storage — Asia Pacific (AP) regions, USA

**Notification of Changes:** Service Provider will notify School 30 days before using any new subprocessor. School may object within 10 days.

**E. Audit & Inspection**
- Allow the School to audit our processing and security practices (with 15 days notice)
- Provide audit reports, security certifications (SOC 2), and compliance documentation
- Cooperate with any legal or regulatory investigations

**F. Assistance with Rights Requests**
- Assist the School in responding to parent/staff requests for data access, correction, or deletion
- Provide data in response to FERPA requests within 5 business days
- Not prevent the School from fulfilling its FERPA obligations

### School Responsibilities

The School agrees to:

**A. Lawful Purpose**
- Use the Service Provider only for legitimate school operations
- Comply with FERPA, COPPA, IDEA, state education privacy laws
- Obtain necessary parental consent before collecting data from students
- Use the Service Provider only for education-related purposes

**B. Data Governance**
- Determine what data is collected and how it is used
- Manage user accounts and access levels
- Remove user access when staff/parents leave
- Maintain policies for appropriate use by staff and families
- Ensure compliance with the Acceptable Use Policy (separate document)

**C. Consent & Notification**
- Obtain parental consent where required by law
- Notify parents of how their data is used
- Provide families with a copy of our Privacy Policy
- Allow parents to opt out of optional sharing/communications

**D. Documentation**
- Maintain documentation of data processing purposes
- Document any additional security requirements
- Provide written instructions for any special data handling
- Notify us of any legal requests related to student data

---

## 3. AUTHORIZED USES & RESTRICTIONS

### A. Authorized Purposes

The School authorizes us to process data for:
- Student enrollment and class management
- Attendance tracking
- Progress observation and reporting
- Billing and payments
- Parent communication
- Document storage and access management
- Audit logging for compliance
- System backups and disaster recovery

### B. Prohibited Uses

The Service Provider must NOT:
- Use data for marketing to students or families
- Build behavior profiles or predictive models
- Use data for discriminatory purposes
- Share data for secondary research without consent
- Retain data longer than necessary
- Sell or license data to third parties
- Use data to train AI models without explicit consent

---

## 4. DATA SUBJECT RIGHTS

### A. Access Rights

Parents and students have the right to:
- View their data within the Platform
- Request a copy of all data we hold about them
- Receive data in machine-readable format (CSV, JSON)
- Receive a list of who has accessed their records

**School Role:** Schools are responsible for implementing internal processes to honor these requests within the Platform.

**Service Provider Role:** We will assist by exporting requested data within [X] days of request.

### B. Correction Rights

Data subjects have the right to:
- Request correction of inaccurate information
- Request updates to demographic information
- Flag disputed or incomplete records

**Correction Process:**
1. Parent or staff member submits correction request via [method]
2. School admin verifies the correction
3. Service Provider updates the record
4. Notification sent to confirm correction

**Timeline:** Corrections are made within [X] business days.

### C. Deletion Rights

Data subjects have limited deletion rights:
- Students (over age of majority) may request account deletion
- Parents may request deletion of their own profile
- Schools may request deletion of archived student records
- Deletion of records created by others (teacher notes, etc.) requires School approval

**Limitations:**
- Educational records required by law cannot be deleted
- Billing and audit records are retained per legal requirements
- Deletion may take [X] days (data must be purged from backups)

### D. Restriction of Processing

Parents or students may request that we:
- Restrict sharing of data with external organizations
- Restrict download permissions on specific documents
- Disable document access for specific recipients
- Limit who can view specific record types

**Process:** Requests are submitted to the School admin, who implements restrictions through the Platform.

---

## 5. SECURITY & PRIVACY MEASURES

### A. Technical Safeguards

**Encryption:**
- All data in transit uses TLS 1.2 or higher
- Data at rest is encrypted using AES-256
- Backup data is encrypted and stored separately

**Access Controls:**
- Role-based access control (RBAC) limits visibility by role
- Row-level security (RLS) restricts data by school and user
- Multi-factor authentication (MFA) available for admin accounts
- Session timeouts after 30 minutes of inactivity

**Monitoring & Logging:**
- All data access is logged with timestamp, user ID, and action
- Logs are retained for [X] years
- System alerts on unusual access patterns
- Monthly security reports are available to schools

**Backup & Recovery:**
- Daily automatic backups to separate encrypted storage
- Backups tested monthly for recoverability
- Recovery point objective (RPO): 24 hours
- Recovery time objective (RTO): 4 hours (infrastructure-dependent; not guaranteed in pilot)

### B. Administrative Safeguards

**Personnel:**
- Only authorized personnel access production systems
- Staff sign confidentiality agreements
- Background checks performed
- Training on data privacy required annually

**Vendor Management:**
- All subprocessors are contractually bound to this Agreement
- Subprocessors must maintain equivalent security
- Regular audits of subprocessor security

**Incident Response:**
- Incidents are documented and investigated
- Affected parties notified within [X] days
- Root cause analysis performed
- Preventive measures implemented

### C. Organizational Safeguards

**Policies & Procedures:**
- Data classification policy (determines handling requirements)
- Access control procedures
- Incident response plan
- Disaster recovery plan
- Acceptable use policy

**Regular Review:**
- Annual security assessment
- Vulnerability scanning
- Penetration testing
- Compliance audit

---

## 6. DATA BREACH NOTIFICATION

### A. Notification Trigger

A data breach is defined as unauthorized access, disclosure, or loss of data. Examples:
- Unauthorized access to accounts or databases
- Theft or loss of devices containing unencrypted data
- Transmission of data to unintended recipients
- Ransomware attack affecting data availability

**Note:** Attempted but unsuccessful access is not necessarily a breach if no data was exposed.

### B. Notification Timeline

Upon discovery of a breach, we will:
1. **Within 24 hours:** Notify the School's primary contact of the incident
2. **Within 3 days:** Provide written incident report including:
   - Nature of the breach
   - Data affected (types and estimated number of records)
   - Cause (if known)
   - Number of individuals affected
   - Remediation steps taken
3. **Within 10 days:** Provide detailed forensic investigation results

### C. Investigation & Remediation

The Service Provider will:
- Preserve evidence for investigation
- Cooperate with law enforcement if requested
- Implement corrective measures to prevent recurrence
- Provide timeline for patches/fixes
- Verify remediation was successful

### D. Notification to Data Subjects

**School's Responsibility:** School must notify affected families per FERPA and state law requirements within legally mandated timeframes (typically 30 days).

**Service Provider's Role:** We will assist by:
- Providing notification template
- Helping identify affected individuals
- Providing documentation for regulatory filings
- Coordinating with credit monitoring if required

### E. Cost Responsibility

**Covered by Service Provider:**
- Investigation and forensics
- Notification letters
- Credit monitoring (up to [X] months)
- Regulatory fines directly attributable to our breach

**Covered by School:**
- Notification costs if chosen method is more expensive than email
- Costs of School's breach response procedures
- Any fines attributable to School's failure to implement required protections

---

## 7. DATA PROCESSING & TRANSFERS

### A. Data Processing Agreement (DPA)

This Agreement supplements the Privacy Policy and Terms of Service. In case of conflict, this Agreement takes precedence for data protection matters.

### B. Subprocessor Information

**Current Subprocessors:**

| Service | Function | Location | Compliance |
|---------|----------|----------|-----------|
| Supabase | Database, Auth | [Region] | SOC 2, GDPR-ready |
| Supabase Storage | File Storage | [Region] | SOC 2, encrypted |

**Changes to Subprocessors:**
- School will be notified [X] days before adding/changing subprocessors
- School may object if the new subprocessor poses increased risk
- Service Provider may seek alternative solution or suspension may apply

### C. International Data Transfers

If data is transferred internationally:
- Transfers comply with applicable law (GDPR, CCPA, etc.)
- Standard Contractual Clauses (SCCs) or Binding Corporate Rules (BCRs) are used
- School consents to transfers necessary to operate the Platform

**Jurisdiction of Supabase Services:** [Region]

**Data Transfer Mechanism:** [Describe (e.g., EU-US Data Privacy Framework)]

---

## 8. COMPLIANCE & AUDITING

### A. Regulatory Compliance

The Service Provider commits to:
- FERPA compliance (federal education privacy law)
- COPPA compliance (children's privacy, <13 year-olds)
- State education privacy laws
- Applicable data protection laws (GDPR if EU data, CCPA if California, etc.)
- SOC 2 Type II certification (or equivalent)

### B. School Audit Rights

The School may:
- Request security audit reports or certifications
- Audit our compliance with this Agreement
- Request access to our privacy/security policies
- Conduct on-site inspection with [X] days notice
- Request remediation of any compliance gaps

**Audit Frequency:** School may conduct formal audit annually and ad-hoc audits for cause.

### C. Third-Party Audits

We may undergo audits by:
- Legal/regulatory bodies
- Payment processors or banking partners
- Insurance companies
- Law enforcement (per legal process)

**Confidentiality:** We will protect School's data and privacy during third-party audits.

---

## 9. RETENTION & DELETION

### A. Retention Schedule

| Data Type | Retention Period | Reason |
|-----------|-----------------|--------|
| Active student records | Duration of enrollment + [X] years | Educational history, FERPA |
| Attendance records | [X] years | Regulatory requirement |
| Billing records | [X] years | Tax, audit, payment disputes |
| Document access logs | [X] years | Compliance, audit trail |
| Deleted account data | [X] days | Backup recovery window |
| Backup data | [X] years | Disaster recovery |

### B. Deletion Process

Upon School request to delete data:

1. **Immediate Deletion:** Data is marked for deletion and is no longer visible in the Platform
2. **Backup Purge:** Data is removed from backups after [X] days
3. **Verification:** School receives written confirmation of deletion
4. **Logs:** Deletion is logged for audit purposes

**Exceptions to Deletion:**
- Audit logs (required by law) are retained for [X] years
- Billing records (required by tax law) are retained per School's legal obligations
- Deleted data may persist in backups for [X] days before permanent removal

### C. Data at End of Contract

Upon termination of this Agreement:
- School may export all data within [X] days
- Exported data is provided in standard formats
- Data remaining in our system after [X] days is deleted
- Backups containing School's data are purged after [X] years
- Service Provider confirms deletion in writing

---

## 10. TERM & TERMINATION

### A. Term

- **Effective Date:** [Start date]
- **Duration:** Coincides with Lauris Learn subscription term
- **Renewal:** Automatic unless either party provides [X] days notice

### B. Termination Rights

**Either party may terminate if:**
- The other party materially breaches and fails to cure within [X] days
- Required by law
- Mutual agreement

**Service Provider may terminate if:**
- School fails to pay for [X] consecutive billing cycles
- School uses the Platform in violation of Acceptable Use Policy

**School may terminate if:**
- Service Provider breaches security obligations and fails to cure within [X] days
- Service Provider discloses data in violation of this Agreement
- Service Provider uses data for unauthorized purposes

### C. Effect of Termination

- Access to the Platform terminates immediately
- Data remains accessible for [X] days for export
- Data is deleted or returned per Section 9
- Either party's confidentiality obligations survive termination

---

## 11. CONFIDENTIALITY

### A. Confidential Information

Both parties agree to keep the following confidential:
- This Agreement and its terms
- Data and information shared through the Platform
- Security measures and vulnerabilities
- Breach information (except to extent required by law)

### B. Permitted Disclosures

Either party may disclose confidential information:
- To legal/financial advisors (under confidentiality obligation)
- To law enforcement or government agencies (per legal process)
- To comply with law or court order
- To protect public safety or prevent harm to children
- As required by the other party's policies or procedures

### C. Duration

Confidentiality obligations survive termination of this Agreement for [X] years.

---

## 12. LIABILITY & INDEMNIFICATION

### A. Limitation of Liability

**Neither party is liable for:**
- Indirect, consequential, or incidental damages
- Lost profits or business opportunities
- Lost data (except to extent caused by Service Provider negligence)
- Damages exceeding the amount paid for the Platform in the past 12 months

**Exceptions:**
- Service Provider is liable for gross negligence or willful misconduct
- Service Provider is liable for breach of confidentiality
- Service Provider is liable for data breaches caused by our negligence

### B. School's Indemnification

School indemnifies Service Provider from claims:
- That School's data infringes third-party IP rights
- Arising from School's use of the Platform in violation of law
- Arising from School's failure to protect credentials or follow security guidance

### C. Service Provider's Indemnification

Service Provider indemnifies School from claims:
- That the Platform infringes third-party IP rights (excluding data provided by School)
- Arising from our unauthorized disclosure of data
- Arising from our breach of this Agreement

---

## 13. DISPUTE RESOLUTION

### A. Escalation

If a data handling dispute arises:
1. **Level 1:** School contacts [support email] with specific concern
2. **Level 2:** Escalation to [compliance officer] within [X] days
3. **Level 3:** Executive escalation (both parties' leadership) within [X] days

### B. Cooperation

Both parties agree to cooperate in good faith to resolve disputes without litigation.

### C. Jurisdiction

- Disputes are governed by the laws of [State/Country]
- Disputes are resolved by [arbitration/mediation/litigation] in [Location]

---

## 14. AMENDMENTS

This Agreement may be amended:
- By written agreement of both parties
- Unilaterally by Service Provider with [X] days notice (for non-material changes)

**Material Changes:** School may terminate if material changes are unacceptable.

---

## 15. CONTACT INFORMATION

**For Data Handling Questions:**  
[compliance@example.com]

**For Data Breaches:**  
[breach@example.com] (24/7 emergency line)

**For Legal Requests:**  
[legal@example.com]

**For Audit or Inspection:**  
[audit@example.com]

---

## ACKNOWLEDGMENT

By using Lauris Learn, the School acknowledges:
- Receipt and review of this Agreement
- Understanding of data handling practices
- Consent to processing under the terms described
- Authority to enter into this Agreement

---

**This School Data Handling Agreement is a DRAFT for legal review only.**
