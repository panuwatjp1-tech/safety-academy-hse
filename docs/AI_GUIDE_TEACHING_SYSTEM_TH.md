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


---

## Architecture Decision: ONE PLATFORM / ONE ADMIN / EXISTING IDENTITY

**User requirement (18 November 2026):** The teaching platform is a single long-lived system. The instructor does not want new websites, new databases, new admin accounts, or new passwords for each workshop or app. All *teaching-related* work should operate in the cloud. Corporate large-scale systems are excluded and must remain intact. This is a design directive; **no credentials are known, copied or changed by this document**.

### 1. One long-lived project
- Canonical source: \`panuwatjp1-tech/safety-academy-hse\`, branch \`main\`.
- Canonical production domain: \`https://safety-academy-hse.pages.dev/\`.
- Canonical teaching entry: \`https://safety-academy-hse.pages.dev/ai-guide/\`.
- Preserve \`/academy/\`, \`/executive/\` and the original Apps Script web-app URL.
- Treat courses and cohorts as *records*, not new software projects or deployments.
- A new cohort means a new SESSIONS record under an existing or newly approved COURSES record. Never clone the site, create a new sheet, invent a new password, or duplicate an identity merely to announce a course.

### 2. Identity & password continuity (critical)
- Identify the current Academy Admin login / session mechanism from **actual Apps Script source**; do not assume Google login, PIN, static admin key, or OAuth.
- Preserve existing user accounts, admin permissions, login identifiers, and associated course codes.
- Prefer federated sign-in / SSO using an *already-used* account (for example existing Google identity) **only where the original backend can securely validate that identity**. Don't invent credentials, reset a password, or ask a user to paste an existing password or secret into a prompt/issue/file.
- One sign-in does **not** mean copying the same plaintext password or static admin key into all systems. Never reuse/store/expose a password in a repository, Google Sheet, browser frontend, logs, or documentation. Use backend-verified tokens/sessions, least privilege, and existing secure identity where possible.
- For an outside application that does not support secure federation, provide a **single-launch link** in the portal, keep its existing login untouched, and disclose explicitly that its separate sign-in remains. Never claim cross-app SSO works without a live test.
- Keep original course codes (SAFE-01, FIRE-01 etc.), registration IDs and link destinations. For new course/session entries, generate the identifier *once* within the existing system, enforce uniqueness, and retain it for future cohorts. NEVER renumber historical keys.
- If current authentication cannot be reused securely, complete all non-authenticated site functions and document the exact source-level integration limitation; do not stop other work or create a second password system.

### 3. Single instructor home and information architecture
A single Admin menu within the existing Academy authentication, with clear role isolation:
- Overview: today/upcoming classes, published courses, registration counts, submissions awaiting review, feedback counts, verified status labels.
- Courses and Cohorts: add/edit course and session records; create cohorts without redeploying.
- Registrations: reuse REGISTRATIONS / PAYMENTS / RECEIPTS with no parallel tables; protect private data.
- Teaching Materials: structured lessons, Drive links, versioned course resources; source files cloud-only.
- Class Workspace: practical exercise/brief, existing prompt builder, progress and relevant tools.
- Assignments: learner app URL submission, instructor review, per-learner feedback; role-restricted.
- App Showcase: curated, consent-approved public demo links, clear validity status; no ingestion of corporate data.
- Feedback and Reports: COURSE_FEEDBACK, cross-cohort lessons learned, real counts only.
- Settings: verified admin identity and authorized integrations, without displaying or modifying secrets.
Every student has an individual, authorized "My Class" view separate from instructor/admin, with one consistent navigation and mobile-friendly action buttons.

### 4. Core information flow
PUBLIC SITE → existing COURSES & SESSIONS → existing REGISTRATIONS → verified learner identity → LESSONS & LEARNER_PROGRESS (only if needed) → PROJECT_SUBMISSIONS (only if needed) → teacher review → COURSE_FEEDBACK → permitted APP_SHOWCASE.

- The existing spreadsheet is the sole source of truth for classes and registrations.
- Do not create student-record replicas in Cloudflare KV, Durable Objects, D1 or a second Sheets file.
- Optional supporting tabs ONLY after inspecting current backend schemas and access rights:
  - LESSONS (lessonId, courseCode, title, ordering, resourceUrl, status)
  - LEARNER_PROGRESS (registrationId, lessonId, status, updatedAt)
  - PROJECT_SUBMISSIONS (submissionId, registrationId, courseCode, sessionId, projectName, projectUrl, submittedAt, reviewStatus, reviewerNote)
  - APP_SHOWCASE (appId, submissionId, title, description, publicUrl, permissionToPublish, approvedBy, publishedAt)
- Every change that matters for student records or admin decisions must have permission checks and auditability; maintain old financial workflow unchanged.

### 5. Cloud-only rule and explicit exceptions
- GitHub = authoritative source code and revision history.
- Cloudflare Pages = static front-end on the **existing project**.
- Existing Google Apps Script = authoritative backend and Admin business logic.
- Existing Google Sheets = authoritative data, not a new student database.
- Google Drive = teaching materials and approved class files; reuse project folders when available, inspect before uploading.
- The laptop/desktop/tablet/phone is a client used to view/edit/test. No on-prem server, local folder, local database, localhost, or local terminal is allowed as a prerequisite for running the deployed teaching platform.
- A cloud IDE/CI runner may execute build/test/deploy. Legacy local-only teaching slides should be updated to cloud-first instruction without deleting historical materials.
- Heavy corporate systems such as Smart Safety Portal, HSE Executive, PPE or ISO/QHSE production: **do not migrate, refactor, or couple student data**. Existing wrapper/home navigation to HSE Executive may remain as-is without modification.
- Show external work apps solely as demo links when safe/authorized, not as a demand for shared credentials or merged databases.

### 6. One-time setup, unlimited future cohorts
One-time Codex configuration:
1. Inspect source and actual Apps Script admin login; record dependency graph, data ownership and deployment ownership without exposing secrets.
2. Consolidate instructor navigation on /ai-guide/ while preserving all legacy pages and features.
3. Map existing database + authorized APIs and add only missing teaching tables.
4. Establish secure identity reuse/federated access where supported; do not disturb existing credentials.
5. Put all currently accessible teaching assets under existing cloud storage with stable references; inventory missing assets instead of inventing them.
6. Implement and verify learner progress, submissions, instructor reviews and feedback through the original authenticated backend.
7. Deploy through original project and verify production + security + legacy regression.
Then for each subsequent cohort:
- Instructor chooses an existing course or adds a course record once.
- Instructor adds a cohort/session with date/time/capacity.
- Learners register and use the same teaching hub.
- No new website, no extra password, no copied spreadsheet, no new GitHub repo.

### 7. Acceptance tests beyond functionality
- Instructor can open the **same** teaching-hub URL and reach all teaching operations.
- Opening a new cohort never requires a new URL/domain/repository/storage namespace.
- Existing Admin account still signs in after changes; no password reset and no requirement to learn a new password. If cross-provider SSO is not feasible, preserve original external login and report actual limitations.
- Training round 1 and other historical registrations remain unchanged.
- Instructor and learner cannot access each other's private information across roles.
- Simulate an additional future cohort as a **test record in an isolated test environment** (never pollute real production or charge customers), proving the repeatable flow.
- All real teaching assets can be opened from a separate device without local computer dependencies.
- Original /academy/, /executive/ and original Apps Script backend still function.
- Any status "Production PASS" requires a genuine live check and must not be inferred from local or CI pass.
- Instructor is the final UAT owner.

### 8. UI screen concept to implement, not a new project
Public hero: "ภนว | AI Guide Academy" with cards for "เปิดหลักสูตร", "เข้าสู่ห้องเรียน", "ทดลองสร้าง App", "ดูผลงานจริง".
Signed-in instructor dashboard: top bar logo/course session selector/account, left-side menu (collapsible on mobile), four metric cards (upcoming classes, registered learners, submissions to review, outstanding feedback), large next-class card, recent submissions and a single "เพิ่มรุ่นอบรม" action.
Signed-in learner dashboard: class name, progress tracker, "เรียนต่อ", "ส่งลิงก์ผลงาน", "ประเมินผล" buttons.
Never display fabricated metrics, dummy submissions, or fake completed statuses.

### 9. Codex execution directive
Use this document as canonical design together with existing backend code, not as license for scope expansion. Implement only changes needed for the one-platform teaching goal, verify code and database, test, deploy on original URLs, and return exact commit, deployment, production verification, and issues for instructor UAT. **Do not create new repositories, deployments, accounts, passwords or databases to simplify development.**
