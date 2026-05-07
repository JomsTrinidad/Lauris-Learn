# Tenant Lifecycle Policy — Lauris Learn
## OPERATIONAL DEFINITION OF SCHOOL SUBSCRIPTION STATES

**Last Updated:** May 2026  
**Status:** Operational Policy (not legal requirement — for internal reference)  
**Scope:** Defines what happens when schools transition between subscription states

---

## 1. OVERVIEW

A "tenant" in Lauris Learn is a school or school district subscription. Each tenant moves through lifecycle states as the subscription is created, activated, suspended, and cancelled.

This policy defines:
- **5 lifecycle states:** Trial → Active → Suspended → Cancelled → Archived
- **What users can do** in each state
- **What features are available** in each state
- **Data access rules** in each state
- **Recovery options** for each state

---

## 2. LIFECYCLE STATES & TRANSITIONS

```
┌─────────┐
│  Trial  │  (new school, limited time, payment optional)
└────┬────┘
     │ (trial expires OR payment made)
     ↓
┌─────────┐
│ Active  │  (paid subscription, full access)
└────┬────┘
     │ (non-payment OR admin request)
     ↓
┌──────────┐
│Suspended │  (payment due / policy violation / admin request)
└────┬─────┘
     │ (payment made OR violation resolved OR extends past deadline)
     ↓
┌──────────┐
│Cancelled │  (subscription ended, data retention period starts)
└────┬─────┘
     │ ([X] days later, no recovery requested)
     ↓
┌──────────┐
│ Archived │  (deleted from live system, retained in backup per policy)
└──────────┘
```

---

## 3. TRIAL STATE

### When a School Enters Trial

- New school signs up via public website
- Admin creates account with school name and contact info
- Receives 30-day free trial
- Full feature access during trial

### Duration

- **30 days** from signup date (pilot default; may be extended by support discretion)
- Can be extended by admin with approval
- Ends automatically unless payment is added

### Who Can Access

| Role | Can Login | Can View Data | Can Create/Edit |
|------|-----------|---------------|-----------------|
| School Admin | ✅ | ✅ All | ✅ Yes |
| Teacher | ✅ | ✅ Own class | ✅ Yes |
| Parent | ✅ | ✅ Own child | ✅ Limited |
| Student | ✅ | ✅ Own record | ❌ No |
| Super Admin | ✅ | ✅ All | ✅ Yes (support only) |

### Features Available

**All Features:**
- Full student management
- Attendance tracking
- Progress observations
- Document coordination
- Billing setup (but not invoicing yet)
- Parent communication
- Event management
- Settings

**Limitations:**
- Trial watermark visible on dashboard
- "Trial expires in [X] days" banner
- Limited to [X] students (or unlimited, per sales terms)
- Cannot export historical data yet
- Some reports are sample only

### Data Handling

- All data is treated same as Active tenant
- Encrypted, backed up, audited
- May be subject to demo data cleanup if never converted

### Payment & Conversion

**At end of trial:**
1. Admin receives email: "Trial expires in [7] days"
2. If no payment → school is suspended (see SUSPENDED state)
3. If payment is made → school transitions to ACTIVE

**If admin never logs in:**
- **Pilot note:** No-activity auto-suspension is not implemented in pilot. Support monitors engagement and manually suspends only after explicit attempts to contact the school.
- Reactivation available by adding payment or contacting support

---

## 4. ACTIVE STATE

### When a School Enters Active

- Trial period ended and payment received, OR
- New school purchased annual subscription
- Payment is current (not overdue)

### Duration

- Subscription term ([monthly] or [annual], per agreement)
- Renews automatically unless cancelled [X] days before renewal
- Can be cancelled at any time (ends at billing cycle end or immediately per terms)

### Who Can Access

| Role | Can Login | Can View Data | Can Create/Edit |
|------|-----------|---------------|-----------------|
| School Admin | ✅ | ✅ All | ✅ Yes |
| Teacher | ✅ | ✅ Own class | ✅ Yes |
| Parent | ✅ | ✅ Own child | ✅ Limited |
| Student | ✅ | ✅ Own record | ❌ No |
| Super Admin | ✅ | ✅ All | ✅ Support/override |

### Features Available

**All Features (100%):**
- Student management (unlimited students)
- Attendance, enrollment, promotions
- Progress observations and reports
- Full document coordination with external sharing
- Billing with invoicing
- Parent & student communication
- Event RSVP
- Full data export
- Audit logs and reporting
- API access (if included in plan)

**No Limitations:**
- No watermark or banners (except legal notices)
- Can generate all reports
- Can export unlimited data
- Full compliance auditing

### Data Handling

- Fully encrypted, backed up daily
- Audit logging of all access
- Full FERPA compliance
- Data retention per policy

### Parent Access

- Parents see only their child's information
- Can receive messages and announcements
- Can RSVP to events
- Can view progress and attendance
- Can access shared documents
- Cannot modify educational records
- Can restrict external sharing

---

## 5. SUSPENDED STATE

### When a School Enters Suspended

**Automatic suspension if:**
- **Pilot note:** Automatic suspension is not implemented. All suspensions are manual by support staff.
- Typically triggered by: Payment 14+ days overdue, invoice not paid within 14 days of due date

**Manual suspension if:**
- School admin requests suspension
- Policy violation detected (e.g., unauthorized external sharing)
- Legal hold or investigation initiated
- Court order or law enforcement request

### Duration

- Temporary (typically [30] days)
- Can be extended by admin
- Can be lifted by payment or remediation
- Automatically transitions to CANCELLED after [X] days without resolution

### Who Can Access

| Role | Can Login | Can View Data | Can Create/Edit |
|------|-----------|---------------|-----------------|
| School Admin | ✅ Limited | ✅ View only | ❌ No (except payment) |
| Teacher | ❌ Locked out | ❌ Cannot view | ❌ No |
| Parent | ✅ (read-only) | ✅ View child data | ❌ No |
| Student | ✅ (read-only) | ✅ View own record | ❌ No |
| Super Admin | ✅ | ✅ All | ✅ Yes |

### Features Available

**Limited Features:**
- ✅ View attendance, progress, documents
- ✅ Download documents (for parents/students)
- ✅ Make and view billing payments
- ❌ Create/edit any new data
- ❌ Upload documents
- ❌ Change settings
- ❌ Invite new users
- ❌ Export data (unless during remediation period)

**Read-Only Mode:**
- Parents can see but not modify
- Teachers cannot access (locked out)
- Only admin can make payments
- View-only audit trail available

### Banner & Notification

**Prominent banner:**
"This school's access is suspended. Contact support to restore access. [Restore Payment / Contact Admin]"

**Emails sent to:**
- Admin: "Payment [X] days overdue. Access suspended. Pay by [date] to restore."
- Parents (optional): "Temporary access restriction. Please contact school."

### Data Handling

- Data remains fully protected
- Backups continue normally
- All access is logged
- Can view but not modify

### Recovery from Suspension

**To restore access:**

1. **Payment path (most common):**
   - Admin adds payment
   - System processes within 24 hours (next business day)
   - Full access restored
   - Notification sent

2. **Admin path:**
   - Admin contacts support
   - Support lifts suspension manually (e.g., after investigation)
   - Access restored
   - Notification sent

3. **Remediation path:**
   - Issue is investigated
   - School takes corrective action
   - Super admin lifts suspension
   - Access restored

**Grace period:** Admin has 30 days to resolve before school is moved to CANCELLED state by support.

---

## 6. CANCELLED STATE

### When a School Enters Cancelled

**Intentional cancellation:**
- School admin requests cancellation (via settings or email)
- Effective at end of billing cycle (or immediately per terms)
- Cancellation reason recorded

**Automatic cancellation:**
- Suspension expires without resolution (after [X] days)
- Repeated policy violations
- Legal request to cease operations

### Duration

- Subscription ends on scheduled date
- Data retention period begins (30 days minimum in hot backup; 7 years in cold archive per data type)
- School can request re-activation within 30 days of cancellation (full restore)
- After 30 days, school moves to ARCHIVED (data deleted from live system per retention policy)

### Who Can Access

| Role | Can Login | Can View Data | Can Create/Edit |
|------|-----------|---------------|-----------------|
| School Admin | ✅ 30 days | ✅ View all | ❌ No |
| Teacher | ❌ Locked out | ❌ Cannot view | ❌ No |
| Parent | ❌ Locked out | ❌ Cannot view | ❌ No |
| Student | ❌ Locked out | ❌ Cannot view | ❌ No |
| Super Admin | ✅ | ✅ All | ✅ For data export |

### Features Available

**During Cancellation (30-Day Window):**
- ✅ Admin can login (view-only)
- ✅ Data export (CSV, JSON, PDF)
- ✅ Download all documents
- ✅ View audit logs
- ❌ No modifications
- ❌ No new uploads
- ❌ No parent/teacher access

**After 30 Days:**
- ❌ All access locked
- Data moves to archive storage
- Only accessible via legal process

### Banner & Notification

**Visible to admin only:**
"Your Lauris Learn subscription has been cancelled. You have 30 days to export your data. After that, all access will be removed and data will be archived. [Export Data Button]"

**Emails sent to:**
- Admin: "Your subscription is cancelled. Export your data by [date]. [Export Link]" (support to fill in deadline)
- Parents (if contact provided): "School's Lauris Learn access has ended."

### Data Handling

**During retention period:**
- Data is fully retained
- Backups continue
- No automatic deletion
- Accessible to admin for export

**Transition to Archived:**
- Data is moved to archive storage (no live access)
- Admin access disabled
- Parent/student access disabled
- Can only be accessed via legal request

### Re-activation (Within Grace Period)

**School can request to re-activate within 30 days of cancellation:**
1. Admin contacts support: "We want to restore our subscription"
2. Support verifies school identity and situation
3. If within 30 days → full re-activation possible:
   - All data restored
   - Access re-enabled
   - Same subscription level (or renegotiated per support)
4. New payment begins immediately (or on original renewal date, per negotiation)

**After 30 days:** No re-activation possible; school enters ARCHIVED state. Restoration only via legal process.

---

## 7. ARCHIVED STATE

### When a School Enters Archived

- Cancelled subscription reaches end of 30-day grace period
- No re-activation requested
- Admin has not exported data
- **Pilot note:** Data is NOT automatically purged. Support manually archives data after 30-day window, moved to cold backup storage.

### Duration

- Permanent (unless legal request to restore)
- Historical data remains in secure backup for 7 years (per tax/legal holds and IRS requirements)
- Accessible ONLY via legal process (subpoena, court order, law enforcement)

### Who Can Access

| Role | Can Login | Can View Data | Can Create/Edit |
|------|-----------|---------------|-----------------|
| School Admin | ❌ No | ❌ No | ❌ No |
| Teacher | ❌ No | ❌ No | ❌ No |
| Parent | ❌ No | ❌ No | ❌ No |
| Student | ❌ No | ❌ No | ❌ No |
| Super Admin | ✅ (forensics only) | ✅ (read-only) | ❌ No |

### Features Available

- ❌ Zero access for school
- ❌ Zero access for parents/students
- ❌ Zero access for teachers

### Data Handling

- Deleted from live system
- Retained in backup/archive storage per retention policy
- Encrypted and physically isolated
- Accessible only to super admin + legal counsel (if required)
- Automatically deleted after [X] years per data retention policy

### Recovery from Archived

**Not possible via normal channels:**
- School cannot request restoration after archival
- Data cannot be exported
- System cannot provide access to school

**Access only via legal process:**
- Subpoena or court order: Can access data for litigation
- Law enforcement request: Can provide data for investigation
- Regulatory audit: Can provide aggregate data
- **Pilot note:** All legal requests routed through support lead for verification

---

## 8. STATE TRANSITIONS & RULES

### Automatic Transitions

| From | To | Trigger | Timeline |
|------|-----|---------|----------|
| Trial | Active | Payment received | Immediate |
| Trial | Suspended | No payment + trial expires | Auto-suspend |
| Active | Suspended | Payment [X] days overdue | Auto-suspend |
| Suspended | Cancelled | [X] days no resolution | Auto-cancel |
| Cancelled | Archived | [X] days after cancellation, no re-activation requested | Auto-archive |

### Manual Transitions

| From | To | Who | Action | Effect |
|------|-----|-----|--------|--------|
| Any | Any | School Admin | Click "Cancel Subscription" | Transition to Cancelled at cycle end |
| Suspended | Active | School Admin | Make payment | Immediate restore |
| Cancelled | Active | School Admin (within [X] days) | Request re-activation | Restore all data |
| Any | Suspended | Super Admin | Manual suspension (violation, hold, etc.) | Transition immediately |

### Impossible Transitions

**The system prevents:**
- Trial → Cancelled (must go through Active or Suspended)
- Archived → Any other state (one-way door)
- Suspended → Active without payment/remediation
- Active → Archived (must go through Cancelled)

---

## 9. MULTI-SCHOOL CUSTOMERS

### If Operator = Multi-School District

**Each school is a separate tenant:**
- School A = one lifecycle state
- School B = different lifecycle state
- No state dependency between schools

**Billing:**
- Can be consolidated (one invoice for all schools)
- Or separate (per school)
- Suspension/cancellation of one school doesn't affect others

**Super Admin Management:**
- Super admin can manage each school's state independently
- Can suspend one school while others remain active
- Can view all schools' data regardless of state (for support)

---

## 10. OPERATIONAL PROCEDURES

### For School Admin

**Check subscription status:**
- Dashboard → Settings → Subscription Status
- Shows current state, renewal date, days remaining
- Shows any payment issues

**Manage subscription:**
- Settings → Billing → Manage Subscription
- View invoices
- Add/update payment method
- Request cancellation
- Request re-activation (if cancelled)

**Export before cancellation:**
- Settings → Data Management → Export
- Select data types and date range
- Initiate export
- Receive download link within [X] hours

### For Support Team

**Identify school state:**
- Admin console → Schools → [School Name]
- Shows current state, trial end date, payment status
- Shows history of transitions

**Transition school manually:**
- Can suspend for policy violation or investigation
- Can override suspension for remediation
- Can force cancellation per legal request
- All transitions logged with reason

**Resolve payment issues:**
- Contact school admin with payment reminder
- Offer payment plan options (if available)
- Provide payment link
- Confirm receipt and restore access

**Data recovery:**
- If school requests restore after accidental cancellation (within grace period)
- Super admin can trigger data restore from backup
- Restore completed within [X] hours
- Restore confirmed to school

---

## 11. DATA RECOVERY & LEGAL HOLDS

### Cancellation with Investigation/Legal Hold

**If data must be preserved:**
1. Support tags school with "Legal Hold"
2. Data is NOT deleted despite cancellation
3. Cannot be overwritten or archived
4. Retained until legal process resolves
5. At end of hold, data is purged per policy

### Dispute Resolution

**School disputes being suspended:**
1. School contacts support with dispute
2. Escalated to supervisor for review
3. If error found → access restored, no charges
4. If justified → suspension confirmed

**School disputes data loss:**
1. School reports missing data within grace period
2. Super admin checks backup
3. If recoverable → restored from backup
4. If not recoverable → documented as lost

---

## 12. POLICY CHANGES & NOTICES

### Notice Requirements

**For policy changes:**
- 30 days notice for changes that affect existing schools
- Changes take effect on next billing cycle (at earliest)
- Schools have right to cancel if changes are unacceptable

**For state transitions:**
- 7 days notice before suspension (when possible; manual by support)
- 14 days notice before cancellation (when possible; manual by support)
- Immediate notice of suspension (with reason)
- 48 hours notice for planned maintenance windows
- Notification via email and dashboard banner

### Escalation

**If school disputes state transition:**
1. Contact [support@example.com]
2. Escalate to [operations manager]
3. If needed, escalate to [VP/Director]
4. Decision documented
5. Appeal process available within [X] days

---

## 13. SPECIAL CASES

### School Bankruptcy/Closure

**If school ceases operations:**
1. State education authority may notify
2. School transitioned to CANCELLED
3. Data retained per policy for [X] days
4. Parents may request export of child records
5. After [X] days, data archived
6. State authority can request data per legal process

### Acquisition/Merger

**If school is acquired by another school:**
1. Acquiring school can request consolidation
2. Data migrated to new school's tenant
3. Old tenant marked "Merged"
4. Old tenant data deleted after [X] days

### Multi-Location School

**If school has multiple campuses/branches:**
1. Each branch can have separate admin
2. All branches share one tenant
3. Central admin can see all branches
4. Suspension affects all branches equally

---

## APPENDIX A: STATE QUICK REFERENCE

| State | Duration | Admin Access | Parent Access | Data | Billing |
|-------|----------|--------------|---------------|------|---------|
| Trial | [X] days | ✅ Full | ✅ Full | ✅ Encrypted | Optional |
| Active | Per subscription | ✅ Full | ✅ Full | ✅ Encrypted | ✅ Paid |
| Suspended | [X] days | ✅ View-only | ✅ View-only | ✅ Protected | ⚠️ Past due |
| Cancelled | [X] days | ✅ Export-only | ❌ Locked | ✅ Retained | Ended |
| Archived | [X] years | ❌ Locked | ❌ Locked | ✅ Backup only | N/A |

---

**This Tenant Lifecycle Policy is operational documentation and does not require legal review unless incorporated into customer contracts.**
