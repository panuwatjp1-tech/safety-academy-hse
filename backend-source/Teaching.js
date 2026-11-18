// ===== ภนว | AI Guide — Teaching Hub additions =====
// Added on top of the existing Academy backend (same project, same spreadsheet,
// same admin login). Does NOT modify any existing function. Reuses admin_()/
// adminLogin() for instructor auth. Learner auth reuses the same identity
// pattern as the existing lookupRegistration() (registrationId + email/phone),
// hardened with input validation and a rate limit (see teachLearnerIdentify_).
// New sheets used (added 2026-11-18, headers already created): LESSONS,
// LEARNER_PROGRESS, PROJECT_SUBMISSIONS, APP_SHOWCASE.

const TEACH_HEADERS = {
  LESSONS: ['lessonId', 'courseCode', 'title', 'ordering', 'resourceUrl', 'status'],
  LEARNER_PROGRESS: ['registrationId', 'lessonId', 'status', 'updatedAt'],
  PROJECT_SUBMISSIONS: ['submissionId', 'registrationId', 'courseCode', 'sessionId', 'projectName', 'projectUrl', 'submittedAt', 'reviewStatus', 'reviewerNote', 'permissionToPublish'],
  APP_SHOWCASE: ['appId', 'submissionId', 'title', 'description', 'publicUrl', 'permissionToPublish', 'approvedBy', 'publishedAt']
};

function teachRows_(name) {
  const sheet = sheet_(name);
  ensureHeaders_(sheet, TEACH_HEADERS[name]);
  const values = sheet.getDataRange().getValues(), out = [];
  for (let i = 1; i < values.length; i++) if (values[i][0]) out.push(rowObject_(TEACH_HEADERS[name], values[i]));
  return out;
}
function todayIso_() { return Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd'); }
function isSafeHttpUrl_(value) { return /^https:\/\/[^\s<>"']+$/i.test(String(value || '')) || /^http:\/\/[^\s<>"']+$/i.test(String(value || '')); }

// ---------------- Instructor (admin) ----------------

function teachOverview(token) {
  admin_(token);
  const sessions = rows_('SESSIONS'), regs = rows_('REGISTRATIONS'), subs = teachRows_('PROJECT_SUBMISSIONS'),
    feedback = rows_('COURSE_FEEDBACK'), courses = rows_('COURSES'), today = todayIso_();
  const courseByCode = {}; courses.forEach(c => courseByCode[c.courseCode] = c);
  const upcoming = sessions.filter(s => String(s.isoDate || '') >= today)
    .sort((a, b) => String(a.isoDate).localeCompare(String(b.isoDate)));
  const activeStatuses = ['WAITING_PAYMENT', 'PAYMENT_REVIEW', 'PENDING', 'CONFIRMED'];
  const registeredLearners = regs.filter(r => activeStatuses.indexOf(String(r.status)) >= 0).length;
  const submissionsAwaitingReview = subs.filter(s => String(s.reviewStatus || 'PENDING') === 'PENDING').length;
  const next = upcoming[0] || null;
  return {
    upcomingClassesCount: upcoming.length,
    registeredLearnersCount: registeredLearners,
    submissionsAwaitingReviewCount: submissionsAwaitingReview,
    feedbackCount: feedback.length,
    nextClass: next ? {
      courseCode: next.courseCode,
      courseName: (courseByCode[next.courseCode] || {}).courseName || next.courseCode,
      date: next.date, isoDate: next.isoDate, time: next.time, capacity: next.capacity,
      registered: regs.filter(r => String(r.courseCode) === String(next.courseCode) && String(r.sessionId) === String(next.sessionId) && activeStatuses.indexOf(String(r.status)) >= 0).length
    } : null,
    recentSubmissions: subs.slice(-5).reverse().map(s => ({
      submissionId: s.submissionId, projectName: s.projectName, projectUrl: s.projectUrl,
      courseCode: s.courseCode, submittedAt: s.submittedAt, reviewStatus: s.reviewStatus || 'PENDING'
    }))
  };
}

function teachListCourses(token) { admin_(token); return rows_('COURSES'); }

// Session IDs are per-course sequence numbers (matches the existing SESSIONS
// convention: sessionId repeats across courseCode, identity is the compound
// courseCode+sessionId). Computed from the current MAX, not the row COUNT, so
// a deleted/reordered row can never cause a duplicate id to be re-issued.
function teachAddCohort(token, input) {
  admin_(token);
  input = input || {};
  const courseCode = String(input.courseCode || '').trim();
  const course = rows_('COURSES').find(c => c.courseCode === courseCode);
  if (!course) throw new Error('COURSE_NOT_FOUND');
  const isoDate = String(input.isoDate || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) throw new Error('SESSION_DATE_INVALID');
  const time = String(input.time || '').trim() || '09.00–16.00 น.';
  const requestedCapacity = Number(input.capacity || course.capacity || 15);
  if (!Number.isFinite(requestedCapacity) || requestedCapacity <= 0 || requestedCapacity > 500) throw new Error('SESSION_CAPACITY_INVALID');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sessions = sheet_('SESSIONS');
    const allRows = sessions.getDataRange().getValues();
    const existingForCourse = [];
    let maxId = 0;
    for (let i = 1; i < allRows.length; i++) {
      if (String(allRows[i][1]) !== courseCode) continue;
      existingForCourse.push(allRows[i]);
      const n = parseInt(String(allRows[i][0]), 10);
      if (Number.isFinite(n) && n > maxId) maxId = n;
      if (String(allRows[i][3]) === isoDate) throw new Error('SESSION_DATE_DUPLICATE');
    }
    const nextId = String(maxId + 1);
    // Defensive re-check: the compound (courseCode, sessionId) key must be unique.
    if (existingForCourse.some(r => String(r[0]) === nextId)) throw new Error('SESSION_ID_COLLISION');
    const dateLabel = String(input.dateLabel || '').trim() || isoDate;
    sessions.appendRow([nextId, courseCode, dateLabel, isoDate, time, requestedCapacity]);
    audit_('SESSION_CREATED', '', 'ADMIN', nextId, courseCode + '_' + isoDate);
    return { ok: true, sessionId: nextId, courseCode, isoDate, capacity: requestedCapacity };
  } finally { lock.releaseLock(); }
}

function teachListSubmissions(token, filterStatus) {
  admin_(token);
  const subs = teachRows_('PROJECT_SUBMISSIONS');
  const byId = {}; rows_('REGISTRATIONS').forEach(r => byId[r.registrationId] = r);
  return subs.filter(s => !filterStatus || String(s.reviewStatus || 'PENDING') === filterStatus)
    .map(s => Object.assign({}, s, { learnerName: (byId[s.registrationId] || {}).name || '' }))
    .reverse();
}

function teachReviewSubmission(token, submissionId, reviewStatus, reviewerNote) {
  admin_(token);
  if (['APPROVED', 'REJECTED', 'NEEDS_REVISION', 'PENDING'].indexOf(String(reviewStatus)) < 0) throw new Error('REVIEW_STATUS_INVALID');
  const sheet = sheet_('PROJECT_SUBMISSIONS'), values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) if (String(values[i][0]) === String(submissionId)) {
    sheet.getRange(i + 1, 8).setValue(reviewStatus);
    sheet.getRange(i + 1, 9).setValue(String(reviewerNote || '').slice(0, 2000));
    audit_('SUBMISSION_REVIEWED', submissionId, 'ADMIN', '', reviewStatus);
    return { ok: true };
  }
  throw new Error('SUBMISSION_NOT_FOUND');
}

function teachListLessons(token, courseCode) {
  admin_(token);
  return teachRows_('LESSONS').filter(l => !courseCode || String(l.courseCode) === String(courseCode));
}

function teachSaveLesson(token, input) {
  admin_(token);
  input = input || {};
  const courseCode = String(input.courseCode || '').trim();
  if (!courseCode) throw new Error('LESSON_COURSE_REQUIRED');
  if (!rows_('COURSES').some(c => c.courseCode === courseCode)) throw new Error('COURSE_NOT_FOUND');
  const title = String(input.title || '').trim();
  if (!title) throw new Error('LESSON_TITLE_REQUIRED');
  const resourceUrl = String(input.resourceUrl || '').trim();
  if (resourceUrl && !isSafeHttpUrl_(resourceUrl)) throw new Error('LESSON_URL_INVALID');
  const sheet = sheet_('LESSONS');
  ensureHeaders_(sheet, TEACH_HEADERS.LESSONS);
  if (input.lessonId) {
    const values = sheet.getDataRange().getValues();
    for (let i = 1; i < values.length; i++) if (String(values[i][0]) === String(input.lessonId)) {
      sheet.getRange(i + 1, 1, 1, 6).setValues([[input.lessonId, courseCode, title, Number(input.ordering || i), resourceUrl, String(input.status || 'PUBLISHED')]]);
      return { ok: true, lessonId: input.lessonId };
    }
  }
  const id = 'LSN-' + Utilities.getUuid().slice(0, 8).toUpperCase();
  sheet.appendRow([id, courseCode, title, Number(input.ordering || teachRows_('LESSONS').length + 1), resourceUrl, String(input.status || 'PUBLISHED')]);
  return { ok: true, lessonId: id };
}

function teachListShowcaseCandidates(token) {
  admin_(token);
  // Only submissions the learner explicitly marked as okay to publish are offered here.
  return teachRows_('PROJECT_SUBMISSIONS').filter(s => String(s.reviewStatus) === 'APPROVED' && (s.permissionToPublish === true || String(s.permissionToPublish) === 'true'));
}

function teachApproveShowcase(token, submissionId, title, description, publicUrl) {
  admin_(token);
  const sub = teachRows_('PROJECT_SUBMISSIONS').find(s => String(s.submissionId) === String(submissionId));
  if (!sub) throw new Error('SUBMISSION_NOT_FOUND');
  if (String(sub.reviewStatus) !== 'APPROVED') throw new Error('SUBMISSION_NOT_APPROVED');
  // Hard gate: never publish without the learner's own recorded consent at submission time.
  if (!(sub.permissionToPublish === true || String(sub.permissionToPublish) === 'true')) throw new Error('PUBLISH_CONSENT_REQUIRED');
  const resolvedUrl = String(publicUrl || sub.projectUrl || '').trim();
  if (!isSafeHttpUrl_(resolvedUrl)) throw new Error('SHOWCASE_URL_INVALID');
  const id = 'SHOW-' + Utilities.getUuid().slice(0, 8).toUpperCase();
  sheet_('APP_SHOWCASE').appendRow([id, submissionId, String(title || sub.projectName || '').slice(0, 200), String(description || '').slice(0, 1000), resolvedUrl, true, 'ADMIN', new Date().toISOString()]);
  audit_('SHOWCASE_APPROVED', submissionId, 'ADMIN', '', id);
  return { ok: true, appId: id };
}

function teachListShowcaseAdmin(token) { admin_(token); return teachRows_('APP_SHOWCASE').reverse(); }

// ---------------- Learner (My Class) ----------------
// Same identity pattern as the existing lookupRegistration(): registrationId + the
// email or phone the learner already used to register. No new credential.
// Hardened: empty/blank input is always rejected (never matches a blank sheet
// cell), and repeated failed lookups are rate-limited the same way adminLogin()
// already rate-limits admin failures.

function teachLearnerIdentify_(registrationId, emailOrPhone) {
  registrationId = String(registrationId || '').trim();
  emailOrPhone = String(emailOrPhone || '').trim();
  if (!registrationId || !emailOrPhone) throw new Error('LOOKUP_NOT_FOUND');

  const cache = CacheService.getScriptCache();
  const rateKey = 'TEACH_LOOKUP_FAILS_' + Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, registrationId));
  if (cache.get(rateKey + '_BLOCK')) throw new Error('LOOKUP_RATE_LIMITED');

  const normalizedEmail = normalizeEmail_(emailOrPhone);
  const normalizedPhone = normalizePhone_(emailOrPhone);
  const r = registration_(registrationId);
  const emailMatches = !!normalizedEmail && normalizeEmail_(r && r.email) === normalizedEmail;
  const phoneMatches = !!normalizedPhone && normalizePhone_(r && r.phone) === normalizedPhone;

  if (!r || !(emailMatches || phoneMatches)) {
    const failures = Number(cache.get(rateKey) || 0) + 1;
    cache.put(rateKey, String(failures), 600);
    if (failures >= 8) cache.put(rateKey + '_BLOCK', '1', 600);
    throw new Error('LOOKUP_NOT_FOUND');
  }
  cache.remove(rateKey);
  return r;
}

function teachMyClass(registrationId, emailOrPhone) {
  const r = teachLearnerIdentify_(registrationId, emailOrPhone);
  const courseCode = r.courseCode || APP.COURSE_CODE;
  const lessons = teachRows_('LESSONS').filter(l => String(l.courseCode) === String(courseCode) && String(l.status || 'PUBLISHED') !== 'HIDDEN')
    .sort((a, b) => Number(a.ordering || 0) - Number(b.ordering || 0));
  const progressByLesson = {};
  teachRows_('LEARNER_PROGRESS').filter(p => String(p.registrationId) === String(r.registrationId)).forEach(p => progressByLesson[p.lessonId] = p.status);
  const mySubs = teachRows_('PROJECT_SUBMISSIONS').filter(s => String(s.registrationId) === String(r.registrationId)).reverse();
  const course = courseInfo_(courseCode);
  return {
    registrationId: r.registrationId,
    courseCode, courseName: r.courseName || (course && course.courseName) || courseCode,
    status: r.status,
    lessons: lessons.map(l => ({ lessonId: l.lessonId, title: l.title, resourceUrl: l.resourceUrl, status: progressByLesson[l.lessonId] || 'NOT_STARTED' })),
    submissions: mySubs.map(s => ({ submissionId: s.submissionId, projectName: s.projectName, projectUrl: s.projectUrl, submittedAt: s.submittedAt, reviewStatus: s.reviewStatus || 'PENDING', reviewerNote: s.reviewerNote || '' }))
  };
}

function teachMarkLesson(registrationId, emailOrPhone, lessonId, status) {
  const r = teachLearnerIdentify_(registrationId, emailOrPhone);
  if (['NOT_STARTED', 'IN_PROGRESS', 'DONE'].indexOf(String(status)) < 0) throw new Error('PROGRESS_STATUS_INVALID');
  // lessonId must actually belong to this learner's own course — never trust the client blindly.
  if (!teachRows_('LESSONS').some(l => String(l.lessonId) === String(lessonId) && String(l.courseCode) === String(r.courseCode))) throw new Error('LESSON_NOT_FOUND');
  const sheet = sheet_('LEARNER_PROGRESS'), values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) if (String(values[i][0]) === String(r.registrationId) && String(values[i][1]) === String(lessonId)) {
    sheet.getRange(i + 1, 3, 1, 2).setValues([[status, new Date().toISOString()]]);
    return { ok: true };
  }
  sheet.appendRow([r.registrationId, lessonId, status, new Date().toISOString()]);
  return { ok: true };
}

function teachSubmitProject(registrationId, emailOrPhone, input) {
  const r = teachLearnerIdentify_(registrationId, emailOrPhone);
  input = input || {};
  const projectUrl = String(input.projectUrl || '').trim();
  if (!isSafeHttpUrl_(projectUrl)) throw new Error('PROJECT_URL_INVALID');
  const projectName = String(input.projectName || '').trim().slice(0, 200) || ('ผลงานของ ' + String(r.name || ''));
  // Consent to publish is captured explicitly from the learner at submission time,
  // never assumed. Only this flag, recorded now, lets an admin publish it later.
  const permissionToPublish = input.permissionToPublish === true;
  const id = 'SUB-' + Utilities.getUuid().slice(0, 8).toUpperCase();
  sheet_('PROJECT_SUBMISSIONS').appendRow([id, r.registrationId, r.courseCode || APP.COURSE_CODE, r.sessionId || '', projectName, projectUrl, new Date().toISOString(), 'PENDING', '', permissionToPublish]);
  audit_('PROJECT_SUBMITTED', r.registrationId, 'PUBLIC', r.sessionId || '', 'PENDING');
  return { ok: true, submissionId: id };
}

function teachShowcasePublic() {
  return teachRows_('APP_SHOWCASE').filter(a => a.permissionToPublish === true || String(a.permissionToPublish) === 'true')
    .map(a => ({ appId: a.appId, title: a.title, description: a.description, publicUrl: a.publicUrl }));
}
