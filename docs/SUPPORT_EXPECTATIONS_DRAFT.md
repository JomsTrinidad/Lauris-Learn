# Support & Incident Expectations — Lauris Learn
## Pilot Stage Operational Commitments

**Status:** DRAFT for Operations Review  
**Last Updated:** May 2026  
**Applies to:** Lauris Learn Pilot Phase (all schools)  

---

## OVERVIEW

This document defines realistic support expectations for the Lauris Learn pilot phase. These are **NOT SLAs** (Service Level Agreements), which would be contractual commitments. These are **operational targets** and **best-effort commitments** appropriate for a product in pilot stage.

**Key principle:** Pilot-stage support prioritizes problem-solving and learning over response-time guarantees. As the product matures, support infrastructure will upgrade to formal SLAs.

---

## SUPPORT CHANNELS

### Primary Channel: Email

**Address:** `support@laurislearn.ph`

**Purpose:** All formal requests, documented support cases, feature requests, complaints

**Characteristics:**
- Asynchronous (not real-time)
- Fully documented and auditable
- Tracked in ticketing system (future: Zendesk, Linear, etc.)
- Creates a paper trail for disputes

**Expected turnaround:** See severity levels below

---

### Secondary Channel: Slack (Internal Only)

**Channel:** `#support-bk` (Lauris Learn team)

**Purpose:** Internal team coordination, informal escalation, real-time coordination

**Characteristics:**
- Real-time messaging for internal team only
- NOT a customer support channel
- Used to escalate urgent issues while email case is being opened
- Informal; not part of official record

**When to use:** "I got an email that our system is down, let me ping the team on Slack immediately"

---

### Emergency Channel: Phone (Limited, Pilot Only)

**Available:** For CRITICAL incidents only (system down, data loss, security breach)

**How to access:** 
- Email `support@laurislearn.ph` with subject "CRITICAL: [issue]"
- Ops lead will call back within 2 hours during business hours
- After-hours: email + monitoring team alert (response time: best-effort, typically 30 min – 2 hours)

**Note:** Phone support is manual and limited. Once proper SLA infrastructure is in place (post-pilot), phone support may be expanded.

---

## SEVERITY LEVELS & RESPONSE TIMES

### CRITICAL Severity

**Definition:**
- System is completely down or inaccessible
- Core functionality is broken for all users
- Data loss or suspected data loss
- Security breach or suspected breach
- All teachers locked out
- All parents locked out

**Examples:**
- "Lauris Learn won't load at all"
- "We can't mark attendance — it's returning an error for every student"
- "All student records disappeared"
- "We received an email about unauthorized access"

**Response Target:** 2 hours (business hours); best-effort after-hours

**Resolution Target:** Next business day (within 24 hours if possible; may extend for complex issues)

**Who:** On-call support lead + development team

**What happens:** Ops lead calls/emails within 2 hours, starts active investigation, commits to hourly status updates

---

### HIGH Severity

**Definition:**
- Major feature is broken or severely degraded
- Significant portion of users affected
- Workaround exists but is cumbersome
- Payment processing blocked
- Document uploads failing

**Examples:**
- "The progress page loads but shows no data"
- "Billing records are showing incorrect balances"
- "Parent portal is very slow (10+ seconds per page)"
- "Email invitations aren't sending"
- "Attendance page crashes when saving"

**Response Target:** 8 hours (business hours only)

**Resolution Target:** 48 hours or best-effort if requiring code changes

**Who:** Support team + development team (if needed)

**What happens:** Support team opens a case, investigates, coordinates with dev team, provides daily updates

---

### MEDIUM Severity

**Definition:**
- Feature is degraded or has a workaround
- Small subset of users affected
- Non-critical functionality impaired
- Documentation issue

**Examples:**
- "The date picker doesn't work on Safari"
- "Attendance export is slow for large classes"
- "Can't see photos in parent updates on iPhone"
- "Help drawer article is out of date"

**Response Target:** 24 hours (standard business hours)

**Resolution Target:** 1–2 weeks (roadmap item, no urgency)

**Who:** Support team (escalates to dev if needed)

**What happens:** Case opened, added to backlog, acknowledged within 1 business day with timeline estimate

---

### LOW Severity

**Definition:**
- Enhancement request
- Minor cosmetic issue
- Feature request
- Documentation feedback

**Examples:**
- "Can we add dark mode?"
- "The button text is hard to read"
- "Could you translate this page to Tagalog?"
- "Can we export as PDF?"

**Response Target:** Best effort, no guarantee

**Resolution Target:** No commitment; may be released in future version

**Who:** Support team (may forward to product team)

**What happens:** Case logged as feature request, reviewed in product planning, may be discussed in roadmap

---

## BUSINESS HOURS

**Support is staffed:** Mon–Fri, 9:00 AM – 5:00 PM (Manila time, UTC+8)

**Weekend/holiday coverage:** Emergency phone available (best-effort response)

**Holidays:** Philippine national holidays; support staff may be unavailable

---

## WHO DETERMINES SEVERITY?

**Initial determination:** School submits via email with a severity self-assessment

**Support review:** Support team may adjust severity if needed

**Examples of severity upgrades:**
- "It's slow" → on investigation, turns out it's actually CRITICAL data loss → upgraded to CRITICAL
- "Email isn't sending" → actually blocking all teacher communication → upgraded to HIGH

**Severity downgrades:** If a CRITICAL issue is determined to be a user-error or documented limitation, support may downgrade

**Dispute resolution:** If school disagrees with severity, escalate to ops lead for review

---

## WHAT SUPPORT DOES (AND DOESN'T DO)

### What Support Will Do

- ✅ Investigate system bugs and performance issues
- ✅ Help troubleshoot school configuration problems
- ✅ Reset passwords and unlock accounts
- ✅ Provide documentation and training
- ✅ Escalate feature requests to product team
- ✅ Respond to data export requests
- ✅ Investigate and respond to security reports
- ✅ Assist with onboarding and feature discovery

### What Support Won't Do

- ❌ Customize the platform (development work)
- ❌ Integrate with external systems (unless pre-built)
- ❌ Provide 24/7 phone support (pilot stage)
- ❌ Guarantee SLA response times (pilot stage)
- ❌ Accept bug reports via phone only (must be email for tracking)
- ❌ Bypass security policies or access controls
- ❌ Delete data on verbal request alone (requires written request with verification)

---

## PLANNED MAINTENANCE & UPDATES

### Maintenance Windows

**Frequency:** 1–2 times per month (during pilot development phase)

**Preferred time:** Sunday, 6:00 PM – 9:00 PM (Manila time)

**Duration:** Typically 30 minutes; may extend to 3 hours for major migrations

**Notification:** 
- 48 hours advance notice via email
- Dashboard banner displayed during window
- Follow-up email with status after maintenance

**During maintenance:** System may be unavailable or degraded

**Pilot-stage note:** Maintenance windows may be cancelled or shortened with short notice if deployment is delayed

---

## BACKUP & RESTORE EXPECTATIONS

### Backup Frequency

**Automatic backups:** Daily (taken at 2:00 AM Manila time)

**Retention:** 90 days of point-in-time backups available

**Cost:** Included in pilot subscription (no separate backup fee)

---

### Restore Process (If Needed)

**Point-in-time restore:** Available back 90 days

**Timeline:** 4+ hours (manual process; not automated in pilot)

**Process:**
1. School reports data loss or requests restore
2. Support team investigates and confirms what was lost
3. Support team identifies appropriate backup point
4. Infrastructure team restores database from backup
5. Data is validated and checked for completeness
6. School is notified of restore completion

**Limitations (pilot stage):**
- No automated restore; all manual verification required
- Single-row or single-file restores may not be possible
- Restore is "all or nothing" for the school's database
- May take 4–24 hours depending on backup size

---

### What's Covered

✅ **Accidental deletion of student records:** Can restore if within 90 days  
✅ **Corrupted data:** Can restore from clean backup  
✅ **System failure:** Can restore from last backup  

❌ **Data older than 90 days:** Not available in backup system (retained only in cold archive per policy)  
❌ **Selective record restores:** "Restore just this one student's grades" not available (restore is database-wide)  
❌ **Restore outside of 90 days:** Requires manual archive retrieval (support request)  

---

## UPTIME TARGETS

### Monthly Uptime Target: 99%

This means:
- Approximately 7–8 hours of downtime allowed per month
- Planned maintenance is included in this calculation
- Unplanned incidents are included in this calculation

**This is NOT a guarantee.** It's a design target for the pilot phase.

### What This Doesn't Guarantee

- ❌ No downtime will occur
- ❌ All requests will be fast
- ❌ All features will work perfectly
- ❌ Zero data loss

### What This Is

A target that indicates we're aiming for a reliable service. If we consistently miss this target, we'll communicate the issue and plan for improvement.

---

## MONITORING & ALERTING

### What We Monitor

- Application uptime (web, API)
- Database connectivity and performance
- Storage availability
- Error rates and crashes
- API response time
- Database query performance
- RLS policy enforcement

### How We're Alerted

- Automated monitoring (Sentry, New Relic, or equivalent — future)
- Manual checks during business hours
- Logs reviewed daily
- Community-reported issues (email)

### What You'll Know

- If the system goes down, we'll know within 10 minutes and start investigating
- Major incidents will trigger a status update within 2 hours
- We won't hide problems; if something's wrong, we'll tell you

---

## INCIDENT COMMUNICATION

### During an Incident

**Within 30 minutes:** Acknowledgment email + initial assessment

**Every 2 hours:** Status update (even if only "still investigating")

**When resolved:** Full incident report + root cause explanation

### After an Incident

**Post-mortem (if CRITICAL):** Support team meets to understand what happened and prevent recurrence

**Feedback:** School can request a call to discuss the incident in detail

### Transparency

We won't:
- Hide incidents
- Blame schools for issues we caused
- Promise quick fixes for complex problems

We will:
- Admit when something is wrong
- Explain what we're doing to fix it
- Share learnings to prevent future incidents

---

## ESCALATION & DISPUTE RESOLUTION

### Escalation Path

**Level 1:** Support team email response  
→ If not satisfied or complex issue

**Level 2:** Support lead (ops lead) review  
→ Within 1 business day

**Level 3:** Executive escalation (CEO + CTO if needed)  
→ Only for contracts or strategic issues

### How to Escalate

Reply to email: "I'd like to escalate this issue"

Include:
- Specific problem and what went wrong
- Why the current resolution isn't acceptable
- What resolution you're requesting

### Dispute Examples

- School: "Your support team told me to do X, but that broke my data"
- Support: "You requested Y feature, but we said it was declining; you installed anyway"
- Both: "We disagree on whether something is a bug or a feature"

**Resolution:** Ops lead reviews, makes a decision, communicates in writing

---

## PILOT-STAGE LIMITATIONS

### What's Limited in Pilot

- ❌ No 24/7 support
- ❌ No phone support (email + emergency phone only)
- ❌ No SLA guarantees
- ❌ No automated escalations
- ❌ No real-time status page (coming post-pilot)
- ❌ No integration with school IT systems
- ❌ No on-site support

### What's Included in Pilot

- ✅ Email support with response targets
- ✅ Emergency phone access for critical issues
- ✅ Daily monitoring and alerting
- ✅ Data backups and restore capability
- ✅ Security incident response
- ✅ Access to technical team for complex issues

---

## FEEDBACK & IMPROVEMENT

We're in pilot stage, which means:

**You help us improve:** Report issues, suggest improvements, tell us what's not working

**We listen:** Every issue reported is reviewed and prioritized

**We communicate changes:** If we change support policies, we'll announce 30 days in advance

**Expectations will evolve:** As we learn, support practices will improve post-pilot

---

## CONTACT INFORMATION

**Email:** support@laurislearn.ph

**Slack (internal):** #support-bk

**Emergency (critical incidents):** Email + phone callback available during business hours

**General inquiries:** support@laurislearn.ph

**Feedback:** support@laurislearn.ph (subject: "Feedback: [topic]")

---

## SIGN-OFF

This support policy reflects our pilot-stage commitments. As we graduate from pilot to full launch, this document will be updated and formalized into official SLAs.

**Approved by:** Operations Lead  
**Effective:** Pilot Launch Date  
**Next Review:** End of Pilot Phase (date TBD)

