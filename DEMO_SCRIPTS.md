# Lauris Care — Demo Scripts

_Last updated: 2026-05-05_

---

## Demo Accounts

| Role | Email | Password |
|---|---|---|
| **Primary demo** (therapist) | `care.speech.north@lauris.demo` | `Demo2026!` |
| Admin (if you need to show admin actions) | `care.admin.north@lauris.demo` | `Demo2026!` |

**Best demo child:** Sofia Reyes (North clinic, speech therapy)
— 11 sessions, rich session history, multiple notes with progress arc, 2 published parent summaries, clinic documents on file.

---

## What Is Clickable

The following screens are live and functional. Everything in the demo flow maps to one of these:

| Screen | Route | What you can do |
|---|---|---|
| Sessions view | `/care/sessions` | Filter by date, status, therapy type. Click any row to open Edit Session. |
| Child list | `/care/children` | See all children with Clinic client / Shared badges. Click a row to open the child. |
| Child detail | `/care/children/[id]` | Identity card, identifiers, sessions list with Notes badge, clinic docs, timeline. |
| Edit Session modal | (from any session row) | Edit status, therapist, type. Fill in all 6 structured note fields. |
| Child Timeline | Bottom of child detail | Chronological feed of sessions + clinic docs + school-shared docs. |
| Clinic Documents | Child detail (owned children) | View uploaded documents. Upload new ones as admin. |

**Note on goals, milestones, and home activities:** These are in the database and seeded with real clinical data. The dedicated UI panels land in the next sprint. For the demo, map them to the **Progress observed** field (goals progress) and the **Home practice** field (home activities) in the session notes. Mention the panels as "coming in the next two weeks" only if directly asked.

---

# 5-Minute Demo

_Best for: clinic owners, center directors, or a quick intro call. No deep diving. Keep it moving._

---

**Before you start:** Log in as `care.speech.north@lauris.demo`. Navigate to `/care/sessions`. Set the date range to include today's date. Make sure Sofia Reyes has at least one scheduled session visible.

---

**Open:** Sessions view

> "So this is the first thing a therapist sees when they log in. Today's schedule — who's coming in, what type of session, and whether notes have already been written."

> "The 'Notes' badge here tells you at a glance which sessions have been documented. No more wondering whether the previous therapist left any context."

_Click on a session with existing notes (a "Completed" one from Sofia Reyes)._

**Open:** Edit Session modal — scroll to the structured notes section

> "When a session is finished, therapists fill this in. It's structured on purpose — not a blank text box."

> "Session objective. What you actually did. How the child responded. What progress you observed. And the home recommendation."

> "That last one — home practice — goes straight to the parent in plain language. Not clinical jargon. Something a mom or dad can actually use at dinner tonight."

_Scroll to show the Home practice field with seeded content._

**Close modal. Click on Sofia Reyes in the session list to open her child detail.**

**Open:** Child detail — scroll to the Timeline

> "This is the child's full history in one place. Every session, every document, newest first. If Sofia has a new therapist next month, they can read this top to bottom and be caught up in three minutes."

> "That's the problem we're solving. Clinics lose so much when therapists leave or switch clients. This keeps the knowledge with the child, not in someone's head."

**Close. End demo.**

Total time: ~4 minutes. Leave 1 minute for one question.

---

# 10-Minute Demo

_Best for: a therapist demo, a director who wants to understand the workflow, or a second call where they're already interested._

---

**Before you start:** Log in as `care.speech.north@lauris.demo`. Have two browser tabs open: `/care/sessions` and `/care/children`.

---

### Step 1 — Today's Schedule (Sessions view, ~1 min)

> "When you open Lauris Care, this is your starting point. Today's sessions, with filters so you can narrow by type — speech, OT, behavioral."

_Point out the default date range: −7 days to +14 days._

> "The window is intentional. You can see what just happened and what's coming. You're not flying blind."

_Point to a session with the Notes badge._

> "The Notes badge means documentation is already there. No badge means nothing has been written yet. Simple."

> "If someone no-showed or cancelled, that's logged too. You're not losing that context."

---

### Step 2 — Pre-Session Prep (Child detail, ~1.5 min)

_Click on Sofia Reyes from the sessions list — either click her name or open `/care/children` and click her row._

> "This is Sofia. She's been coming in since February. Speech therapy, biweekly."

_Point to the identity card._

> "Basic profile up top. Date of birth, primary language — things that matter when you're planning a session."

_Scroll down to the Timeline._

> "Here's the real value for prep. Before Sofia walks in, I can scroll this and see what we did last time, how she responded, and what I asked her parents to practice at home."

_Click on the most recent Completed session row in the timeline to open it._

> "Last session we focused on phonological awareness — rhyme identification and initial sound segmentation. She got 75% on rhyme sorting. Struggled with consonant blends."

_Point to the Progress observed field._

> "I wrote this right after the session while it was still fresh. Now anyone who picks up Sofia's case has the same starting point I do."

_Close the modal._

---

### Step 3 — Running the Session (Edit Session, ~2 min)

_Find today's scheduled session for Sofia (or a recent one if none today). Click it._

> "Session starts. I open this before we begin — session objective is already drafted from last time's notes."

_If it's a fresh session with no notes, type something short in the objective field:_
> "Carryover of /s/ sounds in conversational context. Extend topic maintenance to 6 exchanges."

> "I'm typing this while Sofia's settling in. Takes 30 seconds."

_During the session, fill in Activities:_
> "Picture description, conversational practice. I can update this as we go or fill it in right after."

_After simulating the session, fill in Child response:_
> "She caught herself mid-word twice and self-corrected. That's new. Topic maintenance extended to 6 exchanges — that's her personal best."

_Fill in Progress observed:_
> "Conversational carryover at 60% — first real generalization beyond drills. MLU in free play: 2.8 words."

> "This goes directly into her history. If Sofia's OT needs to reference her speech progress for a report, it's right here."

---

### Step 4 — Writing the Parent Update (Home practice field, ~1 min)

_Fill in Home practice / recommendation:_

> "This is the part parents actually care about. What should they do at home between sessions?"

> "I write this in plain language. No clinical terms. No jargon."

_Type or show existing content:_
> "Keep up the 'talk time' each evening. Take turns asking questions and really listen before responding. She maintained a topic for 6 exchanges today — that's double what she could do when she started."

> "This is what gets sent to the parent. Not a three-page report they won't read. One practical thing they can do tonight."

_Change status to Completed. Save._

---

### Step 5 — Progress View (Child detail / Timeline, ~1.5 min)

_Back on Sofia's detail page. Scroll to the Timeline._

> "Now let's look at what three months of this looks like."

_Scroll through the timeline — sessions, clinic documents._

> "February: baseline session, 55% accuracy. April: 78%, approaching goal. Today: first signs of carryover into real conversation."

> "This is the story of a child's progress. Told in real clinical language, with real data, without anyone having to sit down and write a report from scratch."

_If clinic documents are visible, point to one._

> "Documents uploaded by the clinic — evaluations, reports — sit in the same timeline. Everything in one place."

> "If this child's school wants to share their IEP with us, that lands here too. We're not working in a silo."

---

### Step 6 — Wrap (30 sec)

> "That's the core of it. Schedule, prep, document, update the parent, see the arc of progress over time."

> "The thing therapists tell us is that they spend 45 minutes doing a session and then another 45 writing notes. We want to get that second 45 down to ten."

> "And the thing clinic owners tell us is that when a therapist leaves, they take everything they know about a child with them. This solves that."

_Open for questions._

---

# Click Path

Use this as a navigation checklist. Have it open in a second window or printed.

```
1. /care/sessions
   ↳ Filter date range to include today
   ↳ Point out Notes badge
   ↳ Click a completed session to show existing structured notes

2. /care/children → click Sofia Reyes
   ↳ Identity card (name, DOB, language)
   ↳ Scroll to Timeline
   ↳ Click a timeline session row to show past notes

3. Back to /care/sessions → click today's scheduled session
   ↳ Show Session objective field — type or show existing
   ↳ Show Activities field
   ↳ Show Child response field
   ↳ Show Progress observed field
   ↳ Show Home practice / recommendation field
   ↳ Show Private internal note (mention: never shared with parents)
   ↳ Change status to Completed → Save

4. /care/children → Sofia Reyes → scroll to Timeline
   ↳ Show chronological arc of sessions
   ↳ Scroll to a clinic document if any visible

5. (Optional, admin account only) Show Upload Document button
   ↳ "Clinic can upload their own evaluation reports here"
```

---

# Screen Talking Points

### Sessions View (`/care/sessions`)

- **Date filter:** "Default window is last 7 days to next 14 days. You can narrow it to just today."
- **Notes badge:** "This tells you immediately which sessions are documented and which aren't. No chasing down notes."
- **Status tags:** Scheduled / Completed / No-show / Cancelled. "No-shows are tracked — that's clinical data too."
- **Therapy type filter:** "If you only do speech, you can filter to just your sessions."
- **Multiple therapists visible:** "Clinic-wide view. Admin sees everyone's schedule. Therapist sees the same thing — full transparency."

### Child Detail — Identity card

- **Display name + preferred name:** "If a child goes by a nickname, it shows separately."
- **Date of birth:** "Age is right there — no math required."
- **Primary language:** "Relevant for session planning and parent communication."
- **Clinic client badge:** "This child was added directly by the clinic. No school required."

### Child Detail — Therapy Sessions list

- **Notes badge per row:** "One glance tells you if that session is documented."
- **Therapist name on each row:** "Continuity is visible. If a session was done by someone else, you know immediately."
- **Click any row:** "Opens the full session — all the structured notes, not just a title."

### Edit Session modal — Structured notes section

- **Session objective:** "What were you trying to accomplish? Type it before the session. Takes 20 seconds."
- **Activities:** "What did you actually do? Running record or summary — whatever works for you."
- **Child response:** "The most clinically important field. How did they respond? What was surprising? What broke down?"
- **Progress observed:** "Compared to last session, what changed? This is the progress narrative."
- **Home practice / recommendation:** "Written for the parent, not for a chart. Plain language. One actionable thing."
- **Private internal note:** "Never shared. This is where you write what you wouldn't put in an official report."

### Child Timeline

- **Mixed feed:** "Sessions, clinic documents, and school-shared documents all in one place. No switching between systems."
- **Notes badge on session rows:** "Click any session to read the full notes."
- **Chronological order:** "Newest first. Scroll back to see the full arc."
- **Clinic doc rows:** "Evaluation reports, assessments — visible in context alongside session history."

---

# Fallback Plan

### If login fails
- Check that the demo database has been seeded. Run `node scripts/seed-care-demo-logins.mjs` then `node scripts/seed-care-demo-data.mjs`.
- Use `care.admin.north@lauris.demo` / `Demo2026!` instead — admin has all the same views.

### If Sofia Reyes doesn't appear
- She should be in the North clinic. Confirm you're logged in as a North clinic account (either `care.speech.north@lauris.demo` or `care.admin.north@lauris.demo`).
- If the sessions view is empty, check the date range — the seeded sessions span Feb–June 2026.

### If the sessions view is empty
- The default range is −7 days to +14 days from today. The seeded sessions are on specific dates. **Set the From date to 2026-02-01** to see the full history.
- Or navigate to Sofia's child detail directly from `/care/children` and click a session from her timeline — same modal, same notes.

### If a session note is blank
- Some sessions are intentionally seeded without notes (no-shows, scheduled sessions, one draft). Choose a **Completed** session — those have full structured notes.
- Good dates to target: 2026-03-31, 2026-04-14, 2026-05-05 (all Completed, all have notes).

### If the Edit Session modal looks empty
- Make sure you clicked a **Completed** session, not a Scheduled or Cancelled one.
- The notes fields load after the modal opens (async fetch). Wait 1 second before scrolling.

### If someone asks about goals, milestones, or home activity panels
- "Those are coming in the next sprint. The data is already there — you can see the home practice field now, which is the core of it. The structured goal-tracking panel is in active development."
- Do NOT show the database directly. Do NOT apologize. Keep moving.

### If someone asks about the parent app
- "The parent-facing summary is what therapists write in the Home practice field. The parent portal UI is part of the next release. The clinical content is already being captured."

### If someone asks about billing or scheduling
- "Billing and scheduling are in the roadmap. The core clinical workflow — documenting what happens in sessions — is what we're demoing today."

### If the app is slow or loading
- "We're running on a development instance. Production will be significantly faster."
- While waiting: narrate what the screen will show. "This will load the structured session notes — the key fields are session objective, activities, child response, progress, and home practice."

---

# What Not To Say

| Don't say | Say instead |
|---|---|
| "This is basically just a note-taking app." | "This is the connective tissue of a clinic — sessions, history, progress, parent communication, all in one place." |
| "We're still building a lot of this." | Only say "in active development" for specific named features, if asked directly. |
| "It's kind of like [other tool]." | Let the demo speak. Don't invite comparisons. |
| "Sorry, it's a bit slow." | "We're on the development server — production will be faster." |
| "You can see we don't have X yet." | Don't volunteer gaps. Answer direct questions honestly but briefly. |
| "The parent app isn't built yet." | "The parent-facing content is captured in the Home practice field. The parent portal is the next release." |
| "I need to find the right account." | Know your accounts cold before the call. Have them in a password manager or printed. |
| "It's pretty simple right now." | Never undersell. What exists is real and useful. |
| "This is still early." | Say "this is the v1 focused on the core clinical workflow." |
| "I'll just quickly set this up." | Have everything pre-loaded. Nothing should be set up live in front of the audience. |

---

# Best Demo Account / Child

## Primary demo setup

| | |
|---|---|
| **Login** | `care.speech.north@lauris.demo` |
| **Password** | `Demo2026!` |
| **Clinic** | Lauris Care Demo Clinic North |
| **Role** | Therapist (can view all sessions, edit sessions, write notes) |

## Best demo child

**Sofia Reyes** — North clinic, speech therapy

- 11 sessions seeded from February to June 2026
- 6 sessions Completed with full structured notes
- 1 no-show (March 17) — realistic
- 1 cancelled (April 28) — realistic
- 2 upcoming scheduled sessions (May 19, June 2, June 16)
- Clear progress arc: 55% accuracy in session 1 → 78% in session 5 → conversational carryover in session 8
- Home practice recommendations seeded in plain parent-friendly language
- Clinic documents seeded on file

## Secondary demo child (if needed)

**Paolo Villanueva** — South clinic, speech therapy (same rich story, use `care.speech.south@lauris.demo`)

## If you need admin actions (upload, edit child)

- Log in as `care.admin.north@lauris.demo` / `Demo2026!`
- This account can upload clinic documents, edit Sofia's identity fields, and schedule sessions on behalf of any therapist.
- For the 5-minute demo, stay on the therapist account — simpler story.

---

## Pre-Demo Checklist

Run through this 10 minutes before the call:

- [ ] Logged in as `care.speech.north@lauris.demo`
- [ ] `/care/sessions` loads and shows sessions
- [ ] Date range set to **2026-02-01 → 2026-06-30** to see all of Sofia's history
- [ ] Sofia Reyes appears in the list
- [ ] Clicking a Completed session shows structured notes in the modal
- [ ] Sofia's child detail at `/care/children` shows the Timeline with sessions and documents
- [ ] All tabs and modals open without errors
- [ ] Second browser window ready at `/care/children` for quick navigation
