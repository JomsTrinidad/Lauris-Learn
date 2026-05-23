# Lauris — Demo Scripts (Cross-App: Learn + Care)

_Last updated: 2026-05-24_

> The demo is built by [`scripts/demo/seed.mjs`](scripts/demo/seed.mjs). It anchors the **Learn**
> side on the real **Sunshine Learning Center** pilot and builds a **Care** demo around two
> clinics. To (re)build: `node scripts/demo/seed.mjs --reset`, then `node scripts/demo/verify.mjs`
> (expect `✓ ALL PASS`). To remove the older Maple Grove / Riverside demos:
> `node scripts/demo/cleanup.mjs` (dry-run) → `--apply`.

---

## Demo Accounts

Care + parent logins share the password **`LaurisDemo2026!`**. The Learn (school) side uses the
existing **Sunshine** `@sunshine.test` pilot logins.

| App | Email | Role | Use it to show |
|---|---|---|---|
| **Care** (`/care`) | `admin1@lauriscare.test` | clinic_admin | Maple Grove Therapy Center — full clinic workload + intake queue |
| **Care** | `admin2@lauriscare.test` | clinic_admin | Northside Pediatric Therapy — the transfer-receiving clinic |
| **Care** | `therapist1@lauriscare.test` | therapist | Bea Navarro — **Speech** caseload |
| **Care** | `therapist2@lauriscare.test` | therapist | Joaquin Reyes — **OT**; works at **both** clinics (handles the transfer) |
| **Care** | `therapist3@lauriscare.test` | therapist | Carla Mendoza — **OT** caseload |
| **Care** | `therapist4@lauriscare.test` | therapist | Miguel Torres — **ABA** caseload |
| **Learn** (`/login`) | `admin@sunshine.test` | school_admin | Sunshine sharing a student's IEP with the clinic |
| **Learn + Care parent** (`/parent`) | `parent1@laurisparent.test` | parent | A Sunshine-shared child on **both** apps |
| **Learn + Care parent** (`/parent`) | `parent2@laurisparent.test` | parent | A second Sunshine-shared child on both apps |

> **Lauris Med** (`admin1/admin2/doctor1/doctor2@laurismed.test`) is **reserved naming only** — not seeded.

**The clinic at a glance:** 4 therapists (2 OT, 1 Speech, 1 ABA), ~6 children each, **3 children in
the intake queue with no therapist yet**, and a handful of children who **also attend Sunshine**
(shared into Care via real consent grants). One of those Sunshine children is mid-**transfer** from
Maple Grove Therapy to Northside Pediatric Therapy.

---

## The Headline (lead with this)

> "Most therapy software stops at the clinic door. The child's school has an IEP, the clinic has
> therapy notes, and nobody sees the whole picture. Lauris connects them — and when a child moves
> between clinics, the records move with them. Watch."

---

## What Is Clickable

**Care app** (`/care`) as `admin1@lauriscare.test`:

| Screen | What you can do |
|---|---|
| `/care/children` | The clinic's caseload. Owned children + **"Shared · Identity + IDs"** badges on the Sunshine children. Three children sit in intake (no sessions yet). |
| `/care/children/[id]` | Identity, identifiers, sessions list/timeline; for Sunshine children, the **school-shared IEP**. |
| `/care/sessions` | Filter by date / status / therapy type. Click a row → Edit Session (structured notes). |
| `/care/documents` | The Sunshine IEPs shared into the clinic — View + Download. |

**Transfer story** — sign in as `admin2@lauriscare.test` (Northside): the transferred child
appears (shared from Sunshine to the receiving clinic) with an **upcoming** session, while the
**history** stays at Maple Grove. Northside cannot see Maple Grove's other children.

**Learn app** (`/login` → `/dashboard`) as `admin@sunshine.test`:

| Screen | What you can do |
|---|---|
| `/students` | Sunshine roster; the shared children have a "Share with Clinic" entry point. |
| `/documents` | The shared IEPs; **Clinic Sharing** tab shows the active grants to Maple Grove Therapy. |
| `/parent` (as `parent1`) | The school-side view of a shared child. |

---

## 5-Minute Demo

1. **Care — the caseload (~1 min).** `/care/children` as `admin1@lauriscare.test`. "Four therapists,
   about six kids each, three more waiting in intake. Speech, OT, ABA — all in one place."
2. **Care — a shared child (~1.5 min).** Open a child with a **"Shared · Identity + IDs"** badge →
   point to the school-shared IEP. "This child also goes to Sunshine. Their teacher's IEP is right
   here — the clinic plans around the same goals."
3. **Learn — the source (~1 min).** `/documents` as `admin@sunshine.test` → the IEP → Clinic Sharing.
   "The school owns it and shared it — view + download, time-bounded, revocable."
4. **Care — the transfer (~1.5 min).** Sign in as `admin2@lauriscare.test` (Northside). "This child
   transferred here. We see their records and the next appointment; the old clinic keeps the
   history. Nothing re-keyed."

---

## Fallback Plan

- **Login fails / data missing:** re-run `node scripts/demo/seed.mjs` then `node scripts/demo/verify.mjs` (`✓ ALL PASS`).
- **Sessions view empty:** the default range is −7d → +14d; the demo's sessions run **Mar–Jun 2026** — set From to `2026-03-01`.
- **A child has no notes:** intake children have none by design; open an *owned/assigned* child's completed session.
- **Don't show the database.** If asked about goals/milestones panels: "the data's there in the session notes; the dedicated panels are in active development."

---

## Pre-Demo Checklist

- [ ] `node scripts/demo/verify.mjs` → `✓ ALL PASS`
- [ ] Tab A: Care as `admin1@lauriscare.test`, `/care/children` shows the caseload
- [ ] Tab B: Care as `admin2@lauriscare.test`, the transferred child is visible at Northside
- [ ] Tab C: Learn as `admin@sunshine.test`, `/documents` shows the shared IEP + clinic grant
- [ ] Care `/care/sessions` date range set to **2026-03-01 → 2026-06-30**
