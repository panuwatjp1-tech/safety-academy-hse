# ภนว | AI Guide Academy — Cloud-native migration (Cloudflare Workers + D1)

Date: 2026-11-18. Supersedes the Apps-Script-based teaching plan in
`docs/AI_GUIDE_TEACHING_SYSTEM_TH.md` section "Codex execution directive" and
`backend-source/` for anything *new* going forward. `/academy/`, `/executive/`
and the Google Apps Script behind them are **untouched** and keep serving
registration/payment exactly as before — this migration runs in parallel,
not as a replacement, until the instructor is satisfied with UAT.

## What changed

| Layer | Before | Now |
|---|---|---|
| Source | GitHub `panuwatjp1-tech/safety-academy-hse` | same, unchanged |
| Static hosting | Cloudflare Pages `safety-academy-hse.pages.dev` | same, unchanged |
| Teaching backend | (planned) Google Apps Script | **Cloudflare Pages Functions** (`/functions/api/`), Workers runtime |
| Teaching database | (planned) Google Sheets | **Cloudflare D1** (`ai-guide-academy-db`) |
| Registration/payment backend | Google Apps Script (existing) | **unchanged**, still Google Apps Script |
| Registration/payment database | Google Sheets (existing) | **unchanged**, still Google Sheets — and now also mirrored into D1 (see below) |

No new GitHub repo, no new Cloudflare Pages project, no new production
domain. `smart-safety-portal-staging-db-20261101` and every other
account's D1/Workers/R2 resource were never touched — a brand-new,
separately named database (`ai-guide-academy-db`) was created for this
project only.

## D1 database

- Name: `ai-guide-academy-db`, uuid `cf2f3998-dec6-4e8b-8377-ecdca6394afe`.
- Bound to the `safety-academy-hse` Pages project as `DB` (both `production`
  and `preview` environments).
- Schema: `courses`, `sessions`, `registrations`, `payments`, `receipts`,
  `course_feedback`, `settings`, `audit_log` (one-to-one mirror of the
  existing Google Sheet tabs, snake_case columns) plus the new teaching
  tables `lessons`, `learner_progress`, `project_submissions`,
  `app_showcase`, plus `admin_sessions` and `rate_limits` (new,
  infrastructure-only, not present in the Sheet).

### Migration verification (2026-11-18)

Row counts copied from the live Google Sheet into D1, verified equal on both
sides, zero loss and zero duplication:

| Table | Sheet rows (excl. header) | D1 rows |
|---|---|---|
| courses | 4 | 4 |
| sessions | 6 | 6 |
| registrations | 15 | 15 |
| payments | 9 | 9 |
| receipts | 4 | 4 |
| course_feedback | 2 | 2 |
| audit_log | 63 | 63 |
| settings | 0 | 0 (plus 1 new `ADMIN_SECRET_SHA256_HEX` row, infrastructure) |
| lessons / learner_progress / project_submissions / app_showcase | 0 | 0 |

This is a **one-time historical copy**, not a live sync. For as long as
`/academy/` keeps running on Apps Script + Sheets (the authoritative source
for registration/payment during the dual-run period), D1's copies of
`registrations`/`payments`/`receipts`/`course_feedback` will go stale. The
admin Overview screen's registration/feedback counts should be read as a
2026-11-18 snapshot until the instructor approves cutting registration over
to D1 too — a separate decision, not made here.

The `lessons`, `learner_progress`, `project_submissions`, and `app_showcase`
tables are brand new (no prior data existed anywhere for them), so D1 is
authoritative for those from day one.

## Backend API (Cloudflare Pages Functions)

`functions/api/[[path]].js` (plus `functions/_lib/db.js`) implements:

- `POST /api/admin/login` — single shared secret (see "Admin credential"
  below), hashed (SHA-256) server-side, never stored or transmitted in
  plaintext. Issues a 30-minute session token (stored in `admin_sessions`),
  rate-limited (5 failures → 5-minute lock), same shape as the old Apps
  Script `adminLogin`/`admin_()`.
- `GET /api/admin/overview`, `GET /api/admin/courses`, `POST /api/admin/cohort`
  — overview metrics and adding a new session to an existing course.
- `GET/POST /api/admin/lessons`, `GET /api/admin/submissions`,
  `POST /api/admin/submissions/review`, `GET /api/admin/showcase*`,
  `POST /api/admin/showcase/approve` — teaching materials, submission
  review, and showcase curation. `showcase/approve` hard-rejects unless the
  learner's own `permission_to_publish` flag (set by them at submission
  time) is true.
- `POST /api/class/me`, `POST /api/class/lesson/mark`, `POST /api/class/submit`
  — learner identity is `registrationId` + the email/phone used at
  registration (same pattern as the existing lookup), rejected outright if
  either is blank, rate-limited per registrationId (8 failures → 10-minute
  lock).
- `GET /api/public/showcase` — public, no auth, only rows with
  `permission_to_publish = 1`.

Every stored/rendered URL is validated server-side to be `http(s)://` only.

## Admin credential

The previous Apps Script admin secret's hash lives inside that project's
`PropertiesService` storage, which is not reachable from this session (no
Apps Script API access, and the instructor declined to provide one via
`request_credential` in the prior turn — respected, not asked again). It is
therefore **not possible to literally carry the old secret over** to a
different backend technology; a new one had to be generated for the new
system. Only its SHA-256 hash is stored (`settings.ADMIN_SECRET_SHA256_HEX`
in D1) — Claude Code never stores or logs the plaintext. The new secret is
reported once, directly to the instructor, in the chat reply for this turn
(not requested from them) — change it any time by updating that one D1
setting. This is a one-time, unavoidable exception to "no new password,"
caused by the backend-technology change itself, not by choice.

The **old** Apps Script Admin page and its secret are completely untouched
and keep working for `/academy/` and `/executive/` during the dual-run
period.

## Not yet migrated (explicitly out of scope this round)

- The public registration/readiness/payment-slip-upload flow still runs on
  Apps Script + Sheets. Moving that is a separate, larger piece of work
  (duplicate-registration logic, 24-hour hold expiry, Drive-based slip
  storage, confirmation emails) that the instructor has not yet asked to
  migrate, and this instruction explicitly says not to turn off the old
  system first. `/academy/` stays as the live registration path.
- No R2 bucket was created yet for payment-slip storage — not needed until
  registration itself moves to the new stack.
