# Teaching Hub backend additions (ภนว | AI Guide)

These three files are **pure additions** to the existing, live Apps Script project
"SAFETY APP ACADEMY FIRE-01 Production V1" (the same project behind `/academy/`,
`/executive/` and `?page=executive`). They do not change or remove a single
existing function, sheet, or page. No new admin account, password, or database
was created. The instructor dashboard and learner "My Class" reuse the **exact
same admin login** (`adminLogin`/`admin_()` in `Code.js`) and the **exact same
learner-identity check** already used by `lookupRegistration()` (registrationId
+ the email or phone the learner registered with).

Claude Code could not push these into the Apps Script project directly — this
session has no Google OAuth/clasp credentials, only read/write access to the
Sheet and Drive via connectors. **This is the one manual step left for the
instructor**, and it takes about 3 minutes:

## How to apply (3 minutes)

1. Open the Apps Script editor for **SAFETY APP ACADEMY FIRE-01 Production V1**
   (Google Sheet → Extensions → Apps Script, or
   `https://script.google.com/d/1JH5JvwaU0-hiv6JMKoxFZ-z2DSvx-tkHOzC1EIfKb0LBjheMUCuH3nwG/edit`).
2. Add a new script file named **Teaching** and paste the contents of
   `Teaching.js` into it.
3. Add a new HTML file named **TeachingAdmin** and paste the contents of
   `TeachingAdmin.html` into it.
4. Add a new HTML file named **MyClass** and paste the contents of
   `MyClass.html` into it.
5. Open `Code.js`. Find this exact block inside `doGet(e)` (around line 48):

   ```js
     return template.evaluate().setTitle('ภนว | AI LIVE STUDIO · SAFE-01').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
     }
     ensureCatalog_();
   ```

   Insert these two new branches **immediately above** `ensureCatalog_();` —
   nothing else in `doGet` or anywhere else in `Code.js` changes:

   ```js
   if (params.page === 'ai-guide-admin') {
     return HtmlService.createTemplateFromFile('TeachingAdmin').evaluate()
       .setTitle('แอดมิน | ภนว AI Guide').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
   }
   if (params.page === 'my-class') {
     return HtmlService.createTemplateFromFile('MyClass').evaluate()
       .setTitle('ห้องเรียนของฉัน | ภนว AI Guide').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
   }
   ```

6. Click **Deploy → Manage deployments → the existing active web app
   deployment → Edit (pencil) → New version → Deploy**. This keeps the exact
   same production URL
   (`.../AKfycbwrkoVRqjl1r6C_Q1SYA9hHX_nuyxrfdlftoBDCFqZg_23kUG8fQv3i4P4UojuTNlZv/exec`) —
   do **not** create a new deployment.

That's it. After that, these two new pages go live at:
- `…/exec?page=ai-guide-admin` — instructor dashboard (log in with the **same**
  admin secret already used on the existing Admin page).
- `…/exec?page=my-class` — learner "My Class" (log in with registrationId +
  the email/phone used to register — same as the existing "ตรวจสอบสถานะ" lookup).

The Cloudflare Pages site (`/ai-guide/admin/` and `/ai-guide/class/`) already
iframes those two URLs, the same pattern `/academy/` uses for the existing app.

## Data model added (already created in the live Sheet)

New tabs, additive only, already created via the Sheets connector on
2026-11-18: `LESSONS`, `LEARNER_PROGRESS`, `PROJECT_SUBMISSIONS`,
`APP_SHOWCASE` — exact headers as specified in
`docs/AI_GUIDE_TEACHING_SYSTEM_TH.md`. No existing tab, row, or column was
touched.

## What instructors can do once deployed

- **Overview**: upcoming classes, active registered-learner count, submissions
  awaiting review, feedback received — all real counts from the Sheet, never
  fabricated.
- **เพิ่มรุ่นอบรม**: add a new session row to an existing course, no redeploy.
- **บทเรียน**: publish lesson links (e.g. Google Drive) per course.
- **ผลงานที่ส่ง**: review learner project submissions (approve / needs revision
  / reject).
- **คลังผลงานสาธารณะ**: curate approved submissions into the public showcase.

## What learners can do once deployed

- Log in with registrationId + email/phone, see their course and lesson list,
  mark lessons done, submit a project link, see review status/feedback, and
  jump to the existing feedback form (`?page=feedback`) — no duplicate feedback
  system.
