# Production Runbook — Lauris Learn
## DEPLOYMENT, OPERATIONS & INCIDENT RESPONSE

**Last Updated:** May 2026  
**Audience:** DevOps, IT Operations, Support Team  
**Scope:** Deployment, monitoring, rollback, disaster recovery  

---

## 1. PRE-DEPLOYMENT CHECKLIST

### 1.1 Code & Configuration Review

- [ ] Code merged to main branch
- [ ] All tests passing (TypeScript, unit, smoke)
- [ ] Code review approved by [reviewer name]
- [ ] No console.error or debug logs in production code
- [ ] All sensitive data in environment variables (no hardcoded secrets)
- [ ] .env.production verified and not in git

### 1.2 Database & Migrations

- [ ] All migrations created and tested locally
- [ ] Migration syntax verified in PostgreSQL/Supabase
- [ ] RLS policies tested and verified
- [ ] Smoke tests written and passing
- [ ] Rollback plan documented for each migration
- [ ] No destructive migrations (dropping columns) without data backup
- [ ] Data migration scripts tested on copy of production data

### 1.3 Dependencies & Environment

- [ ] `npm audit` clean (no critical vulnerabilities)
- [ ] All dependencies pinned to specific versions
- [ ] Node.js version matches production environment
- [ ] Environment variables documented
- [ ] Supabase project verified (correct region, backup enabled)
- [ ] Storage buckets verified (correct permissions, encryption)
- [ ] Rate limiting configured (if applicable)

### 1.4 Secrets & Credentials

- [ ] No API keys, tokens, or passwords in code
- [ ] All secrets stored in [Supabase Vault / environment]
- [ ] Staging credentials do NOT match production
- [ ] Service account keys rotated (if applicable)
- [ ] Backup credentials stored in secure location [describe]
- [ ] Emergency access procedure documented

### 1.5 Monitoring & Logging

- [ ] Error reporting configured (Sentry / similar)
- [ ] Logging endpoints verified
- [ ] Dashboards created for key metrics
  - [ ] Page load times
  - [ ] API response times
  - [ ] Database query performance
  - [ ] RLS rejection rate
  - [ ] Document access success rate
  - [ ] Error rate by endpoint
- [ ] Alerts configured for:
  - [ ] High error rate (>5% of requests)
  - [ ] Slow response times (>5s for API)
  - [ ] Database connection exhaustion
  - [ ] Disk space warning
  - [ ] Failed login attempts (brute force)

### 1.6 Backup & Disaster Recovery

- [ ] Database backup schedule confirmed
- [ ] Storage backup schedule confirmed
- [ ] Backup encryption verified
- [ ] Restore from backup tested in past [X] days
- [ ] Recovery time objective (RTO) documented: [X] hours
- [ ] Recovery point objective (RPO) documented: [X] hours
- [ ] Backup retention policy verified: [X] days to [X] years per data type

### 1.7 Security Verification

- [ ] HTTPS enforced everywhere
- [ ] TLS version 1.2+ required
- [ ] CORS headers verified
- [ ] SQL injection prevention verified (parameterized queries)
- [ ] CSRF tokens enabled
- [ ] XSS protection enabled (CSP headers)
- [ ] Rate limiting configured per endpoint
- [ ] DDoS mitigation configured (if applicable)

### 1.8 Performance Verification

- [ ] Page load time <3s for 90th percentile
- [ ] API response time <1s for 90th percentile
- [ ] Database queries optimized (no N+1 queries)
- [ ] Indexes verified on high-query tables
- [ ] Database connection pool configured: [X] connections
- [ ] Memory usage expected: [X] MB per server instance
- [ ] Load testing completed with [X] concurrent users

---

## 2. DEPLOYMENT PROCESS

### 2.1 Staging Deployment (First)

**Purpose:** Verify deployment process and identify issues before production.

**Steps:**
1. Checkout deployment branch (typically `main`)
2. Build application:
   ```bash
   npm ci
   npm run build
   ```
   - Verify no build errors
   - Verify output bundle size: [X] MB acceptable range

3. Deploy to staging environment:
   ```bash
   npm run deploy:staging
   ```
   - Check deployment logs for errors
   - Verify deployment time: typically [X] minutes

4. Run smoke tests against staging:
   ```bash
   npm run test:smoke -- --staging
   ```
   - All tests must pass
   - No timeouts or flake

5. Manual verification:
   - [ ] Login with test user works
   - [ ] Create student works
   - [ ] Upload document works
   - [ ] Record attendance works
   - [ ] Generate billing works
   - [ ] Parent portal accessible

6. Verify monitoring is active:
   - [ ] Error logs appearing
   - [ ] Performance metrics reporting
   - [ ] No critical alerts triggered

7. Verify data integrity:
   - [ ] RLS queries returning correct results
   - [ ] No orphaned records
   - [ ] Audit trails complete

**If issues found:**
- Abort deployment
- Fix issues locally
- Re-test and re-deploy to staging
- Do NOT proceed to production until staging is clean

### 2.2 Production Deployment

**Prerequisites:**
- Staging deployment successful
- All tests green
- Approvals: [list who must approve]

**Timing:**
- Preferred: [X] am/pm UTC (low-traffic window)
- Duration: [X] minutes expected
- Maintenance window: [X] minutes (brief, during health checks)
- Blackout period: [if any]

**Steps:**

1. **Notify stakeholders:**
   ```
   Email: [ops channel, support team, key stakeholders]
   Subject: [Deployment] Lauris Learn v[version] → Production
   Message: Deployment starting at [time]. Expected duration: [X] minutes. 
            Minimal disruption. Updates will be invisible to users.
   ```

2. **Pre-deployment snapshot:**
   ```bash
   # Backup current state for quick rollback
   npm run backup:pre-deploy
   
   # Verify database state
   npm run verify:db -- --production
   ```

3. **Build for production:**
   ```bash
   npm ci
   npm run build -- --production
   
   # Verify build succeeded
   ls -la .next/
   # Expected: [list key files]
   ```

4. **Run migrations (if any):**
   ```bash
   npm run migrate:production -- --dry-run
   # Review changes
   npm run migrate:production -- --apply
   
   # Verify migration applied
   npm run migrate:verify -- --production
   ```
   - Each migration should complete in <[X] seconds
   - Zero data loss
   - Rollback tested separately beforehand

5. **Deploy new build:**
   ```bash
   npm run deploy:production
   
   # Expected output:
   # ✅ Build deployed successfully
   # ✅ DNS updated (wait 30-60s for propagation)
   # ✅ Health checks passing
   ```

6. **Verify deployment:**
   ```bash
   npm run verify:deployment -- --production
   
   # Should verify:
   # ✅ Web servers responding
   # ✅ Database accessible
   # ✅ Storage accessible
   # ✅ All services healthy
   ```

7. **Run smoke tests:**
   ```bash
   npm run test:smoke -- --production
   
   # All tests must pass:
   # ✅ Login works
   # ✅ Document access works
   # ✅ Billing calculation works
   # ✅ Parent portal works
   ```

8. **Manual verification by [Support/QA]:**
   - [ ] Login flow works
   - [ ] Create student works
   - [ ] Document upload works
   - [ ] Billing generation works
   - [ ] Parent invites work
   - [ ] External document sharing works

9. **Monitor for [X] hours post-deployment:**
   - [ ] Error rate <1%
   - [ ] Response times normal
   - [ ] No critical alerts
   - [ ] User reports: none received (in [support channel])

10. **Post-deployment notification:**
    ```
    Email: [stakeholders]
    Subject: ✅ Deployment Complete — Lauris Learn v[version]
    Message: Successfully deployed at [time]. 
             Monitoring active. All systems nominal.
    ```

---

## 3. MIGRATION EXECUTION

### 3.1 Safe Migration Pattern

**Never:** Run migrations that modify existing data in production without testing.

**Always:**

1. **Write migration in development**
   - Test locally first
   - Verify on copy of production data
   - Document expected impact (rows affected, time to complete)

2. **Create rollback migration**
   ```sql
   -- 123_forward.sql (ADD COLUMN)
   ALTER TABLE students ADD COLUMN new_field TEXT;
   
   -- 124_rollback.sql (DROP COLUMN)
   ALTER TABLE students DROP COLUMN new_field;
   ```

3. **Schedule during low-traffic window**
   - Preferred: [X] am/pm UTC
   - Never during school hours in key regions
   - Have rollback ready

4. **Run migration with monitoring**
   ```bash
   # Start migration with timeout warning
   npm run migrate:production -- --timeout 5m
   
   # Monitor in real-time:
   tail -f logs/migration.log
   
   # If slow: CANCEL and investigate
   ```

5. **Verify migration success:**
   ```sql
   -- Run verification queries
   SELECT COUNT(*) FROM students;  -- Should be same as before
   SELECT * FROM migrations WHERE name = '123_forward';  -- Should show success
   ```

6. **Test application against new schema:**
   ```bash
   npm run test:smoke -- --production
   ```

7. **If migration fails:**
   - Immediately rollback: `npm run migrate:rollback -- 123_forward`
   - Verify rollback succeeded
   - Investigate failure
   - Do NOT reattempt same migration same day

### 3.2 Zero-Downtime Migration Pattern

**For large tables (>1M rows):**

1. **Add new column as NULL:**
   ```sql
   ALTER TABLE child_documents ADD COLUMN new_column VARCHAR(255) NULL;
   ```
   - Instant (metadata only, no lock)

2. **Backfill in batches:**
   ```sql
   -- Run in background, in small batches
   UPDATE child_documents 
   SET new_column = 'default_value'
   WHERE id IN (
     SELECT id FROM child_documents 
     WHERE new_column IS NULL 
     LIMIT 1000
   );
   ```
   - Does NOT lock table for reads
   - Application continues normally
   - Repeat until all rows backfilled

3. **Add NOT NULL constraint:**
   ```sql
   ALTER TABLE child_documents 
   ALTER COLUMN new_column SET NOT NULL;
   ```
   - Only proceeds if all rows have values
   - Quick operation

4. **Update application code** to use new column
5. **Drop old column** (in subsequent migration, if replacing)

---

## 4. ROLLBACK PROCESS

### 4.1 When to Rollback

**Rollback immediately if:**
- [ ] >5% of requests are errors
- [ ] Critical feature completely broken (e.g., login unavailable)
- [ ] Database unreachable
- [ ] Data corruption detected
- [ ] Security breach confirmed

**Do NOT rollback if:**
- Single user reported issue (investigate first)
- Performance is slightly slower (monitor before reverting)
- Minor UI bug (fix in next release)

### 4.2 Rollback Procedure

**Step 1: Declare incident**
```bash
npm run incident:declare -- \
  --title "Critical bug in v[version]" \
  --severity critical \
  --rollback-target v[previous-version]
```

**Step 2: Stop traffic to new version**
- Disable health checks for new version
- Route traffic to previous version
- Deployment load balancer fallback to previous Docker image

**Step 3: Restore from backup (if data issue)**
```bash
npm run restore:backup -- \
  --timestamp "2026-05-07T10:00:00Z" \
  --verify
```
- Restore to known good state before deployment
- Verify data integrity
- Confirm with stakeholders

**Step 4: Verify rollback succeeded**
```bash
npm run test:smoke -- --production
npm run verify:data -- --production
```

**Step 5: Notify stakeholders**
```
Email: [ops channel, stakeholders]
Subject: ⚠️ Rollback — Lauris Learn v[version] → v[previous]
Message: Rolled back due to [reason]. 
         All systems restored. Investigation ongoing.
```

**Step 6: Investigate root cause**
- Review deployment logs
- Check database before/after
- Identify what went wrong
- Document lessons learned

**Step 7: Fix and redeploy**
- Do NOT deploy same code again
- Fix identified issue
- Retesting on staging
- Deploy with lesson learned in place

---

## 5. RESTORE PROCESS

### 5.1 Database Restore

**Scenario:** Data corruption, accidental deletion, or failed migration.

**Restore steps:**

1. **Identify restore point:**
   ```bash
   npm run backups:list -- --last 7d
   
   # Output:
   # 2026-05-07 10:00:00Z - Daily backup - Good
   # 2026-05-07 09:00:00Z - Daily backup - SKIP (after incident)
   # 2026-05-06 10:00:00Z - Daily backup - Good
   ```

2. **Verify backup integrity:**
   ```bash
   npm run backup:verify -- --backup-id backup-2026-05-06-10-00-00
   # ✅ Backup integrity verified
   ```

3. **Restore to point-in-time:**
   ```bash
   npm run restore:db -- \
     --timestamp "2026-05-06T10:00:00Z" \
     --dry-run  # First, show what will happen
   
   # Review output
   
   npm run restore:db -- \
     --timestamp "2026-05-06T10:00:00Z" \
     --apply    # Actually restore
   ```

4. **Verify restored data:**
   ```bash
   npm run verify:data -- --production
   # ✅ All tables present
   # ✅ Row counts match expected
   # ✅ Referential integrity ok
   ```

5. **Verify application works:**
   ```bash
   npm run test:smoke -- --production
   # All tests pass
   ```

6. **Track what was lost:**
   ```bash
   # Data from restore point to now: [X] minutes of activity lost
   # Affected schools: [list or "all"]
   # Affected students: [count]
   # Affected documents: [count]
   ```

7. **Notify users of data loss:**
   ```
   Email: [affected schools]
   Subject: Data Recovery Complete — Minimal Loss
   Message: We restored your data due to [incident]. 
            You lost data from [time to time]. 
            Contact us if you notice missing information.
   ```

### 5.2 Storage Restore

**Scenario:** Deleted documents need recovery.

**Restore steps:**

1. **Identify deleted object:**
   ```bash
   npm run storage:deleted -- --since "2 hours ago"
   
   # Output:
   # [school-id]/[student-id]/[doc-id]/v1.pdf - Deleted 1h ago
   # [school-id]/[student-id]/[doc-id]/v2.pdf - Deleted 1h ago
   ```

2. **Restore from backup:**
   ```bash
   npm run storage:restore -- \
     --path "[school-id]/[student-id]/[doc-id]/v1.pdf" \
     --backup-date "2026-05-06"
   ```

3. **Update database metadata:**
   ```bash
   npm run update:document-version -- \
     --document-id [doc-id] \
     --version-number 1 \
     --is-hidden false
   ```

4. **Verify document accessible:**
   - Test with school admin
   - Verify document access log records the restore
   - Notify school of recovery

---

## 6. INCIDENT RESPONSE PROCEDURES

### 6.1 Critical Incident (System Down)

**Alert triggers:**
- Login unavailable
- Database unreachable
- All API endpoints returning 500

**Response:**

1. **Immediate action ([0-5 min):**
   ```bash
   npm run status:all -- --verbose
   # Check: Web servers, Database, Storage, Auth
   ```

2. **Declare incident ([5 min):**
   - Page on-call engineer
   - Notify ops team
   - Post status update

3. **Investigation ([5-15 min):**
   ```bash
   # Check recent changes
   git log --oneline -10
   
   # Check error logs
   tail -f logs/error.log
   
   # Check Supabase status
   curl https://status.supabase.com/api/v2/summary.json
   ```

4. **Mitigation ([15-30 min):**
   - Restart services if hung
   - Failover to standby (if available)
   - Rollback if deployment-related
   - Restore from backup if data-related

5. **Communication:**
   - Status page update every 15 minutes
   - Email to affected schools
   - Slack #incidents channel

6. **Resolution:**
   - Get system back to normal
   - Verify all services healthy
   - Run smoke tests
   - Post-incident report within [X] hours

---

### 6.2 Data Integrity Incident

**Symptoms:**
- RLS policy returning wrong data
- Calculations incorrect
- Audit logs show unauthorized access

**Response:**

1. **Isolate issue:**
   ```bash
   npm run verify:data -- --detailed
   # Identify which tables/schools affected
   ```

2. **Check RLS policies:**
   ```bash
   npm run verify:rls -- --test-queries
   # Verify each policy returns correct data
   ```

3. **Review audit logs:**
   ```bash
   npm run audit:query -- --since "1 hour ago"
   # Who accessed what, when
   ```

4. **Assess impact:**
   - How many rows affected
   - How many students/schools affected
   - Was sensitive data exposed
   - Was data modified

5. **Remediate:**
   - Fix RLS policy (if wrong)
   - Restore from backup if needed
   - Recompute affected data
   - Audit all downstream effects

6. **Notify affected parties:**
   - Schools whose data was affected
   - Parents (if sensitive data exposed)
   - Legal/compliance team (if breach)

---

### 6.3 Security Incident

**Symptoms:**
- Unauthorized document access
- Login from unexpected location
- Brute force attempts detected

**Response:**

1. **Contain (immediate):**
   - Disable affected accounts
   - Revoke affected tokens
   - Enable additional logging

2. **Investigate:**
   ```bash
   npm run security:audit -- --incident
   # Timeline of actions
   # What was accessed
   # From where
   ```

3. **Notify:**
   - Inform affected schools/parents
   - Prepare breach notification if needed
   - Contact [Legal/Compliance]

4. **Remediate:**
   - Force password reset
   - Require MFA re-setup
   - Rotate compromised credentials
   - Update WAF rules if needed

5. **Post-incident:**
   - Security review of incident
   - Policy updates
   - Employee training if applicable

---

## 7. MONITORING & ALERTING

### 7.1 Key Metrics to Monitor

**Application Performance:**
- HTTP request count (per endpoint)
- HTTP error rate (5xx errors)
- Response time (p50, p95, p99)
- Page load time (from browser)

**Database Performance:**
- Query execution time (slow query log)
- Connection pool usage
- Replication lag (if applicable)
- Query count per hour

**RLS Performance:**
- RLS policy evaluation time
- RLS rejection rate (authorized denials)
- RLS bypass (super_admin) calls
- RLS bug detection

**Document Access:**
- Signed URL generation time
- Document download success rate
- Document access denied rate

**Billing:**
- Billing record creation success rate
- Payment processing success rate
- Tax calculation accuracy

**Errors:**
- Error rate by module (documents, enrollment, billing, etc.)
- Error rate by severity (warning, error, critical)
- Unhandled exceptions

### 7.2 Alert Thresholds

**Page immediately on-call engineer if:**
- Error rate >5% sustained for >5 minutes
- Database unavailable
- Login completely broken
- Document access broken for >1% of users

**Email ops team if:**
- Error rate >1% sustained for >15 minutes
- Response time >5s for >5 minutes
- Slow query detected (>5s)
- RLS rejection rate >10%

**Post to #incidents channel if:**
- Any incident page triggered
- Any service degradation
- Any security alert

### 7.3 Dashboard Setup

**Create dashboards for:**
1. **Health Dashboard:**
   - Service status (green/yellow/red)
   - Error rate trend
   - Response time trend
   - Database connection pool

2. **Business Dashboard:**
   - New schools signed up (daily)
   - Students enrolled (daily)
   - Documents uploaded (daily)
   - Payments recorded (daily)

3. **Ops Dashboard:**
   - Deployments (when, by whom, status)
   - Incident timeline
   - Database query performance
   - Storage usage trend

---

## 8. POST-DEPLOYMENT VERIFICATION

### 8.1 Immediate (0-5 min post-deploy)

- [ ] Web server responding to requests
- [ ] Database connections established
- [ ] Health check endpoint returning 200
- [ ] No error spike in logs
- [ ] Monitoring pipeline receiving data

### 8.2 Short-term (5-30 min post-deploy)

- [ ] Smoke tests all passing
- [ ] Manual verification (login, create, view, etc.)
- [ ] Error rate <1%
- [ ] Response times normal
- [ ] No user reports in support channel

### 8.3 Medium-term (30 min - 2 hours post-deploy)

- [ ] Error rate stays <1%
- [ ] Database queries running normally
- [ ] All features tested manually
- [ ] Parent portal accessible
- [ ] No performance regression

### 8.4 Long-term (2 hours - next business day)

- [ ] All automated tests passing
- [ ] No data corruption detected
- [ ] Audit logs complete and correct
- [ ] Billing/attendance not affected
- [ ] No escalations from schools

---

## 9. EMERGENCY CONTACTS & ESCALATION

### 9.1 Escalation Path

**Level 1: On-Call Engineer**
- [Name] — [Phone] — [Email]
- Available 24/7
- First responder for critical issues

**Level 2: Ops Manager**
- [Name] — [Phone] — [Email]
- Available [business hours + on-call]
- Escalate if Level 1 cannot resolve in [15] min

**Level 3: Director / VP**
- [Name] — [Phone] — [Email]
- Escalate if incident affects [X] schools or has legal implications

### 9.2 Customer Communication

**Critical (all users notified):**
- [Status page: status.example.com]
- [Email to: all-schools@list]
- [Slack announcement: #announcements]

**Incident (schools affected only):**
- Email to affected school admins
- Follow-up within [X] hours with resolution

**Post-Incident:**
- Root cause analysis published within [X] hours
- Prevent similar incidents [action items]

---

## 10. DEPLOYMENT APPROVAL & CHANGE CONTROL

### 10.1 Approval Required For

- [ ] Any code change to production
- [ ] Any database migration
- [ ] Any security configuration change
- [ ] Any infrastructure change
- [ ] Any dependency update

### 10.2 Approval Checklist

```
Deployment Approval Form

Version: [version]
Deployer: [name]
Approved by: [name]
Date: [date]

Pre-flight Checks:
  [ ] All tests passing
  [ ] Code reviewed and approved
  [ ] Migrations tested
  [ ] Rollback plan documented
  [ ] Monitoring verified
  [ ] Backup verified
  [ ] No breaking changes

Approval:
  [ ] I have reviewed this deployment
  [ ] I understand the changes
  [ ] I approve deployment to production
  
Signed: ________________ Date: ________
```

---

## APPENDIX: RUNBOOK MAINTENANCE

This runbook should be updated:
- [ ] Quarterly (every 3 months)
- [ ] After every incident (lessons learned)
- [ ] When architecture changes
- [ ] When new tools/services added

**Last reviewed:** [Date]  
**Next review:** [Date]  
**Reviewed by:** [Name]  

---

**End of Production Runbook**
