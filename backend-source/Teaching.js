// ===== ภนว | AI Guide — Teaching Hub additions =====
// Added on top of the existing Academy backend (same project, same spreadsheet,
// same admin login). Does NOT modify any existing function. Reuses admin_()/
// adminLogin() for instructor auth and the same email+phone identity check
// pattern as the existing lookupRegistration() for learner auth.
// New sheets used (added 2026-11-18, headers already created): LESSONS,
// LEARNER_PROGRESS, PROJECT_SUBMISSIONS, APP_SHOWCASE.

const TEACH_HEADERS = {
  LESSONS: ['lessonId', 'courseCode', 'title', 'ordering', 'resourceUrl', 'status'],
  LEARNER_PROGRESS: ['registrationId', 'lessonId', 'status', 'updatedAt'],
  PROJECT_SUBMISSIONS: ['submissionId', 'registrationId', 'courseCode', 'sessionId', 'projectName', 'projectUrl', 'submittedAt', 'reviewStatus', 'reviewerNote'],
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

function teachAddCohort(token, input) {
  admin_(token);
  input = input || {};
  const courseCode = String(input.courseCode || '').trim();
  const course = rows_('COURSES').find(c => c.courseCode === courseCode);
  if (!course) throw new Error('COURSE_NOT_FOUND');
  const isoDate = String(input.isoDate || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) throw new Error('SESSION_DATE_INVALID');
  const time = String(input.time || '').trim() || '09.00–16.00 น.';
  const capacity = Number(input.capacity || course.capacity || 15);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sessions = sheet_('SESSIONS');
    const existing = rows_('SESSIONS').filter(s => String(s.courseCode) === courseCode);
    if (existing.some(s => String(s.isoDate) === isoDate)) throw new Error('SESSION_DATE_DUPLICATE');
    const nextId = String(existing.length + 1);
    const dateLabel = String(input.dateLabel || '').trim() || isoDate;
    sessions.appendRow([nextId, courseCode, dateLabel, isoDate, time, capacity]);
    audit_('SESSION_CREATED', '', 'ADMIN', nextId, courseCode + '_' + isoDate);
    return { ok: true, sessionId: nextId, courseCode, isoDate };
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
    sheet.getRange(i + 1, 9).setValue(String(reviewerNote || ''));
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
  const title = String(input.title || '').trim();
  if (!title) throw new Error('LESSON_TITLE_REQUIRED');
  const sheet = sheet_('LESSONS');
  ensureHeaders_(sheet, TEACH_HEADERS.LESSONS);
  if (input.lessonId) {
    const values = sheet.getDataRange().getValues();
    for (let i = 1; i < values.length; i++) if (String(values[i][0]) === String(input.lessonId)) {
      sheet.getRange(i + 1, 1, 1, 6).setValues([[input.lessonId, courseCode, title, Number(input.ordering || i), String(input.resourceUrl || ''), String(input.status || 'PUBLISHED')]]);
      return { ok: true, lessonId: input.lessonId };
    }
  }
  const id = 'LSN-' + Utilities.getUuid().slice(0, 8).toUpperCase();
  sheet.appendRow([id, courseCode, title, Number(input.ordering || teachRows_('LESSONS').length + 1), String(input.resourceUrl || ''), String(input.status || 'PUBLISHED')]);
  return { ok: true, lessonId: id };
}

function teachListShowcaseCandidates(token) {
  admin_(token);
  return teachRows_('PROJECT_SUBMISSIONS').filter(s => String(s.reviewStatus) === 'APPROVED');
}

function teachApproveShowcase(token, submissionId, title, description, publicUrl) {
  admin_(token);
  const sub = teachRows_('PROJECT_SUBMISSIONS').find(s => String(s.submissionId) === String(submissionId));
  if (!sub) throw new Error('SUBMISSION_NOT_FOUND');
  const id = 'SHOW-' + Utilities.getUuid().slice(0, 8).toUpperCase();
  sheet_('APP_SHOWCASE').appendRow([id, submissionId, String(title || sub.projectName || ''), String(description || ''), String(publicUrl || sub.projectUrl || ''), true, 'ADMIN', new Date().toISOString()]);
  audit_('SHOWCASE_APPROVED', submissionId, 'ADMIN', '', id);
  return { ok: true, appId: id };
}

function teachListShowcaseAdmin(token) { admin_(token); return teachRows_('APP_SHOWCASE').reverse(); }

// ---------------- Learner (My Class) ----------------
// Same identity pattern as the existing lookupRegistration(): registrationId + the
// email or phone the learner already used to register. No new credential.

function teachLearnerIdentify_(registrationId, emailOrPhone) {
  const r = registration_(registrationId);
  if (!r || (normalizeEmail_(r.email) !== normalizeEmail_(emailOrPhone) && normalizePhone_(r.phone) !== normalizePhone_(emailOrPhone))) throw new Error('LOOKUP_NOT_FOUND');
  return r;
}

function teachMyClass(registrationId, emailOrPhone) {
  const r = teachLearnerIdentify_(registrationId, emailOrPhone);
  const courseCode = r.courseCode || APP.COURSE_CODE;
  const lessons = teachRows_('LESSONS').filter(l => String(l.courseCode) === String(courseCode) && String(l.status || 'PUBLISHED') !== 'HIDDEN')
    .sort((a, b) => Number(a.ordering || 0) - Number(b.ordering || 0));
  const progressByLesson = {};
  teachRows_('LEARNER_PROGRESS').filter(p => String(p.registrationId) === String(registrationId)).forEach(p => progressByLesson[p.lessonId] = p.status);
  const mySubs = teachRows_('PROJECT_SUBMISSIONS').filter(s => String(s.registrationId) === String(registrationId)).reverse();
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
  teachLearnerIdentify_(registrationId, emailOrPhone);
  if (['NOT_STARTED', 'IN_PROGRESS', 'DONE'].indexOf(String(status)) < 0) throw new Error('PROGRESS_STATUS_INVALID');
  const sheet = sheet_('LEARNER_PROGRESS'), values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) if (String(values[i][0]) === String(registrationId) && String(values[i][1]) === String(lessonId)) {
    sheet.getRange(i + 1, 3, 1, 2).setValues([[status, new Date().toISOString()]]);
    return { ok: true };
  }
  sheet.appendRow([registrationId, lessonId, status, new Date().toISOString()]);
  return { ok: true };
}

function teachSubmitProject(registrationId, emailOrPhone, input) {
  const r = teachLearnerIdentify_(registrationId, emailOrPhone);
  input = input || {};
  const projectUrl = String(input.projectUrl || '').trim();
  if (!/^https?:\/\//i.test(projectUrl)) throw new Error('PROJECT_URL_INVALID');
  const projectName = String(input.projectName || '').trim() || ('ผลงานของ ' + String(r.name || ''));
  const id = 'SUB-' + Utilities.getUuid().slice(0, 8).toUpperCase();
  sheet_('PROJECT_SUBMISSIONS').appendRow([id, registrationId, r.courseCode || APP.COURSE_CODE, r.sessionId || '', projectName, projectUrl, new Date().toISOString(), 'PENDING', '']);
  audit_('PROJECT_SUBMITTED', registrationId, 'PUBLIC', r.sessionId || '', 'PENDING');
  return { ok: true, submissionId: id };
}

function teachShowcasePublic() {
  return teachRows_('APP_SHOWCASE').filter(a => a.permissionToPublish === true || String(a.permissionToPublish) === 'true')
    .map(a => ({ appId: a.appId, title: a.title, description: a.description, publicUrl: a.publicUrl }));
}
