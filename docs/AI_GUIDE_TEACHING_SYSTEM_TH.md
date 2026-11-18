# ภนว | AI Guide — Unified Teaching System
Version: design baseline 18 November 2026
Status: Phase 1 added to existing Cloudflare Pages; backend integration pending original Google Apps Script source/API.

## Scope and non-negotiables
- Single entry point at /ai-guide/ on the EXISTING safety-academy-hse.pages.dev domain.
- Preserve /academy/ and /executive/ and existing Google Apps Script backend. No replacement of production URL.
- Keep the existing Google Sheets as source of truth for courses, sessions, registration, payments, receipts, feedback and audit. No mirror database and no public direct access to the sheets.
- No private student records, receipts, payment slips, access tokens or admin secrets in the static repository or browser.
- Prior course SAFE-01 remains unchanged. The 28 November 2026 AI App Builder workshop must NOT be shown as bookable through old SAFE-01 sessions until its own session is created and validated.
- User is responsible for UAT.

## What was verified against the existing sources
Production application: Google Apps Script Web App (linked in existing /academy/ wrapper).
Public wrapper repository: panuwatjp1-tech/safety-academy-hse, main branch.
Original Cloudflare Pages pages: /, /academy/, /executive/.
Existing Google Sheets database title: SAFETY APP ACADEMY · FIRE-01 PRODUCTION.
Existing tabs and headers:
- COURSES: courseCode, courseName, fullTitle, instructor, capacity, fee, paymentRule
- SESSIONS: sessionId, courseCode, date, isoDate, time, capacity
- REGISTRATIONS: registrationId, createdAt, name, email, phone, courseCode, sessionId, agent, readinessPassed, readinessCount, status, seatStatus, slipFileId, note, receiptNo, courseName, sessionDate, emailStatus
- PAYMENTS: paymentId, registrationId, amount, requiredAmount, status, slipFileId, reviewedAt, reviewedBy, note
- RECEIPTS: receiptNo, registrationId, issuedAt, fileId
- COURSE_FEEDBACK: id, submittedAt, session, overall, content, clarity, handsOn, workUsefulness, pace, venue, confidence, recommend, highlight, improvement, nextTopic
- SETTINGS: key, value
- AUDIT_LOG: timestamp, action, registrationId, actor, sessionId, status
SESSIONS contained SAFE-01 (24/25 Oct 2026) and FIRE-01 (17/18 Oct 2026) and STICKER-01 (18 Oct 2026), but no session on 28 Nov 2026 at the time of inspection.
Important: sessionId values repeat across courseCode. Use the compound (courseCode, sessionId) identity, not sessionId alone.
Important: spreadsheet timezone appears as America/New_York. Backend date handling needs inspection before changing sheet timezone; training locale is Asia/Bangkok.

## Unified student journey
1. Landing and course information (public; /ai-guide/)
2. Select course + session, readiness, registration, payment and receipt (EXISTING /academy/ backend, once course/session is validated).
3. Start a project brief: user selects work domain, app name, users, desired features and fields. Frontend generates a reusable Thai AI prompt; no personal data or draft gets saved.
4. Guided classroom project: requirement -> AI prompt -> form/frontend -> backend/database -> dashboard -> deploy/test.
5. Submit work (future secured backend endpoint), storing project URL, project status, review date and instructor feedback linked to registrationId. Until built, work can be shared through the existing LINE contact; do not claim submissions are tracked in the database.
6. Feedback (existing COURSE_FEEDBACK; currently existing form/API only, new frontend integration still pending).
7. Post-training follow-up and project revisions (future secured endpoint, no invented scores).

## Data design: protect existing tables, add only what is needed
Existing entities should remain intact. When the Apps Script backend implementation is accessible, extend the existing database with minimal purpose-specific tables rather than creating a second backend:
- LESSONS: lessonId, courseCode, title, ordering, resourceUrl, status
- LEARNER_PROGRESS: registrationId, lessonId, status, updatedAt
- PROJECT_SUBMISSIONS: submissionId, registrationId, courseCode, sessionId, projectName, projectUrl, submittedAt, reviewStatus, reviewerNote
- APP_SHOWCASE: appId, submissionId, title, description, publicUrl, permissionToPublish, approvedBy, publishedAt
Use registrationId as the learner's cross-table key and the compound courseCode/sessionId for session references.
Before adding tabs, inspect existing Apps Script APIs, duplicates, form auth and naming conventions. Do not infer permissions or backfill unknown student work.

## Instructor-only operations (to be wired into existing authenticated admin)
- View cohorts from COURSES + SESSIONS + REGISTRATIONS; never display all names publicly.
- Review payments and receipts from PAYMENTS/RECEIPTS, preserving approval and audit trail.
- View session progress and submitted app URL after authorization.
- Choose showcase projects only after learner approval and privacy review.
- Analyze course feedback (existing COURSE_FEEDBACK), track improvements for the next workshop.
- Existing Admin labels: ภาพรวม | ผู้สมัคร | ตรวจยอด; keep this layout for the old academy while adding teaching functions in a separate authorized section.

## What is implemented in the repository
- /ai-guide/index.html: a responsive teaching-hub page and working browser-side project brief/prompt generator.
- Existing homepage has a direct and prominent link to /ai-guide/.
- Original /academy/ is retained as the sole route to existing enrollment/finance logic.
- Existing public demo links include JP Risk AI and a Wedding E-Card example; corporate/private records are not exposed in the public catalogue.
- Course 2 uses the published LINE registration/contact link and existing venue map, not stale SAFE-01 dates.
- No changes to old database or authentication.

## Next implementation gates (do not report as already complete)
A. Obtain and inspect the original Apps Script source or supported API interface, including authentication and deployment ownership.
B. Add and validate the November 28 course/session with user-selected courseCode, correct Thai time zone and capacity; check fee = 990 THB and payment flow.
C. Implement class materials, learner login, authorized submissions, review workflow and progress using the existing backend/database.
D. Connect feedback and instructor reporting to the same registrationId/session composite.
E. Regression test previous academy registration, payment, receipt, and executive page before and after each deployment.
F. Production verification and user UAT: phone and laptop, non-programmer flow, actual registration only with consent, privacy access, and app submission. Roll back only touched files if necessary.

## Teaching date handoffs
- 24 Oct 2026: first AI Safety App Builder workshop, real practice with contractor registration and safety induction/test examples.
- 24 Nov 2026: Chonburi Safety Day; JP Risk AI demo can be used as a real-world case.
- 28 Nov 2026: AI APP BUILDER รุ่นที่ 2, 09.00–16.00, Miracle Café Bang Lamung Chonburi, fee 990 THB including lunch and two breaks.

## Validation status
- Repository create/update calls succeeded; new page and homepage link can be read back from the main branch.
- Script parses in JavaScript and code-level checks are to be performed.
- Cloudflare production page/browser UAT not yet independently verified. Do not call it production PASS until live site is tested.
