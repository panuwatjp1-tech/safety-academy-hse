// ภนว | AI Guide Academy — Cloud-native API (Cloudflare Pages Functions + D1)
// Replaces the Google Apps Script backend for the teaching system going
// forward. Does not touch Smart Safety Portal, HSE Executive, or any other
// project's Workers/D1/R2 resources — this file only ever uses env.DB, which
// is bound (see wrangler-style Pages binding) to ai-guide-academy-db alone.

import { json, err, ApiError, readJson, adminLogin, requireAdmin, identifyLearner, isSafeHttpUrl, audit } from '../_lib/db.js';

function todayIso() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }); // YYYY-MM-DD
}

const ACTIVE_STATUSES = ['WAITING_PAYMENT', 'PAYMENT_REVIEW', 'PENDING', 'CONFIRMED'];

async function handle(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/?/, '');
  const method = request.method;

  // ---------------- Admin ----------------
  if (path === 'admin/login' && method === 'POST') {
    const body = await readJson(request);
    const token = await adminLogin(env, body.secret);
    return json({ ok: true, token });
  }

  if (path === 'admin/overview' && method === 'GET') {
    await requireAdmin(env, url.searchParams.get('token'));
    const today = todayIso();
    const upcoming = await env.DB.prepare(
      'SELECT s.*, c.course_name FROM sessions s JOIN courses c ON c.course_code = s.course_code WHERE s.iso_date >= ? ORDER BY s.iso_date ASC'
    ).bind(today).all();
    const activePlaceholders = ACTIVE_STATUSES.map(() => '?').join(',');
    const registeredLearners = await env.DB.prepare(
      `SELECT COUNT(*) n FROM registrations WHERE status IN (${activePlaceholders})`
    ).bind(...ACTIVE_STATUSES).first();
    const submissionsAwaiting = await env.DB.prepare(
      "SELECT COUNT(*) n FROM project_submissions WHERE COALESCE(review_status,'PENDING') = 'PENDING'"
    ).first();
    const feedbackCount = await env.DB.prepare('SELECT COUNT(*) n FROM course_feedback').first();
    const next = upcoming.results[0] || null;
    let nextClass = null;
    if (next) {
      const registered = await env.DB.prepare(
        `SELECT COUNT(*) n FROM registrations WHERE course_code = ? AND session_id = ? AND status IN (${activePlaceholders})`
      ).bind(next.course_code, next.session_id, ...ACTIVE_STATUSES).first();
      nextClass = {
        courseCode: next.course_code, courseName: next.course_name,
        date: next.date_label, isoDate: next.iso_date, time: next.time_label,
        capacity: next.capacity, registered: registered.n
      };
    }
    const recentSubs = await env.DB.prepare(
      'SELECT submission_id, project_name, project_url, course_code, submitted_at, review_status FROM project_submissions ORDER BY submitted_at DESC LIMIT 5'
    ).all();
    return json({
      upcomingClassesCount: upcoming.results.length,
      registeredLearnersCount: registeredLearners.n,
      submissionsAwaitingReviewCount: submissionsAwaiting.n,
      feedbackCount: feedbackCount.n,
      nextClass,
      recentSubmissions: recentSubs.results.map((s) => ({
        submissionId: s.submission_id, projectName: s.project_name, projectUrl: s.project_url,
        courseCode: s.course_code, submittedAt: s.submitted_at, reviewStatus: s.review_status || 'PENDING'
      }))
    });
  }

  if (path === 'admin/courses' && method === 'GET') {
    await requireAdmin(env, url.searchParams.get('token'));
    const rows = await env.DB.prepare('SELECT * FROM courses ORDER BY course_code').all();
    return json(rows.results.map((c) => ({ courseCode: c.course_code, courseName: c.course_name, capacity: c.capacity, fee: c.fee })));
  }

  if (path === 'admin/cohort' && method === 'POST') {
    const body = await readJson(request);
    await requireAdmin(env, body.token);
    const courseCode = String(body.courseCode || '').trim();
    const course = await env.DB.prepare('SELECT * FROM courses WHERE course_code = ?').bind(courseCode).first();
    if (!course) throw new ApiError('COURSE_NOT_FOUND', 404);
    const isoDate = String(body.isoDate || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) throw new ApiError('SESSION_DATE_INVALID', 400);
    const time = String(body.time || '').trim() || '09.00–16.00 น.';
    const capacity = Number(body.capacity || course.capacity || 15);
    if (!Number.isFinite(capacity) || capacity <= 0 || capacity > 500) throw new ApiError('SESSION_CAPACITY_INVALID', 400);
    const existing = await env.DB.prepare('SELECT session_id, iso_date FROM sessions WHERE course_code = ?').bind(courseCode).all();
    if (existing.results.some((r) => r.iso_date === isoDate)) throw new ApiError('SESSION_DATE_DUPLICATE', 409);
    const maxId = existing.results.reduce((m, r) => Math.max(m, parseInt(r.session_id, 10) || 0), 0);
    const nextId = String(maxId + 1);
    const dateLabel = String(body.dateLabel || '').trim() || isoDate;
    await env.DB.prepare('INSERT INTO sessions (session_id, course_code, date_label, iso_date, time_label, capacity) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(nextId, courseCode, dateLabel, isoDate, time, capacity).run();
    await audit(env, 'SESSION_CREATED', '', 'ADMIN', nextId, courseCode + '_' + isoDate);
    return json({ ok: true, sessionId: nextId, courseCode, isoDate, capacity });
  }

  if (path === 'admin/lessons' && method === 'GET') {
    await requireAdmin(env, url.searchParams.get('token'));
    const courseCode = url.searchParams.get('courseCode') || '';
    const rows = courseCode
      ? await env.DB.prepare('SELECT * FROM lessons WHERE course_code = ? ORDER BY ordering').bind(courseCode).all()
      : await env.DB.prepare('SELECT * FROM lessons ORDER BY course_code, ordering').all();
    return json(rows.results.map((l) => ({ lessonId: l.lesson_id, courseCode: l.course_code, title: l.title, ordering: l.ordering, resourceUrl: l.resource_url, status: l.status })));
  }

  if (path === 'admin/lessons' && method === 'POST') {
    const body = await readJson(request);
    await requireAdmin(env, body.token);
    const courseCode = String(body.courseCode || '').trim();
    if (!courseCode) throw new ApiError('LESSON_COURSE_REQUIRED', 400);
    const course = await env.DB.prepare('SELECT 1 FROM courses WHERE course_code = ?').bind(courseCode).first();
    if (!course) throw new ApiError('COURSE_NOT_FOUND', 404);
    const title = String(body.title || '').trim();
    if (!title) throw new ApiError('LESSON_TITLE_REQUIRED', 400);
    const resourceUrl = String(body.resourceUrl || '').trim();
    if (resourceUrl && !isSafeHttpUrl(resourceUrl)) throw new ApiError('LESSON_URL_INVALID', 400);
    const status = String(body.status || 'PUBLISHED');
    if (body.lessonId) {
      await env.DB.prepare('UPDATE lessons SET course_code=?, title=?, ordering=?, resource_url=?, status=? WHERE lesson_id=?')
        .bind(courseCode, title, Number(body.ordering || 1), resourceUrl, status, body.lessonId).run();
      return json({ ok: true, lessonId: body.lessonId });
    }
    const countRow = await env.DB.prepare('SELECT COUNT(*) n FROM lessons').first();
    const id = 'LSN-' + crypto.randomUUID().slice(0, 8).toUpperCase();
    await env.DB.prepare('INSERT INTO lessons (lesson_id, course_code, title, ordering, resource_url, status) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(id, courseCode, title, Number(body.ordering || countRow.n + 1), resourceUrl, status).run();
    return json({ ok: true, lessonId: id });
  }

  if (path === 'admin/submissions' && method === 'GET') {
    await requireAdmin(env, url.searchParams.get('token'));
    const status = url.searchParams.get('status') || '';
    const rows = status
      ? await env.DB.prepare('SELECT * FROM project_submissions WHERE review_status = ? ORDER BY submitted_at DESC').bind(status).all()
      : await env.DB.prepare('SELECT * FROM project_submissions ORDER BY submitted_at DESC').all();
    const regs = await env.DB.prepare('SELECT registration_id, name FROM registrations').all();
    const nameById = {}; regs.results.forEach((r) => nameById[r.registration_id] = r.name);
    return json(rows.results.map((s) => ({
      submissionId: s.submission_id, registrationId: s.registration_id, learnerName: nameById[s.registration_id] || '',
      projectName: s.project_name, projectUrl: s.project_url, submittedAt: s.submitted_at,
      reviewStatus: s.review_status || 'PENDING', reviewerNote: s.reviewer_note || '',
      permissionToPublish: !!s.permission_to_publish
    })));
  }

  if (path === 'admin/submissions/review' && method === 'POST') {
    const body = await readJson(request);
    await requireAdmin(env, body.token);
    const reviewStatus = String(body.reviewStatus || '');
    if (!['APPROVED', 'REJECTED', 'NEEDS_REVISION', 'PENDING'].includes(reviewStatus)) throw new ApiError('REVIEW_STATUS_INVALID', 400);
    const result = await env.DB.prepare('UPDATE project_submissions SET review_status=?, reviewer_note=? WHERE submission_id=?')
      .bind(reviewStatus, String(body.reviewerNote || '').slice(0, 2000), body.submissionId).run();
    if (!result.meta.changes) throw new ApiError('SUBMISSION_NOT_FOUND', 404);
    await audit(env, 'SUBMISSION_REVIEWED', body.submissionId, 'ADMIN', '', reviewStatus);
    return json({ ok: true });
  }

  if (path === 'admin/showcase/candidates' && method === 'GET') {
    await requireAdmin(env, url.searchParams.get('token'));
    const rows = await env.DB.prepare(
      "SELECT * FROM project_submissions WHERE review_status = 'APPROVED' AND permission_to_publish = 1"
    ).all();
    return json(rows.results.map((s) => ({ submissionId: s.submission_id, projectName: s.project_name, projectUrl: s.project_url })));
  }

  if (path === 'admin/showcase' && method === 'GET') {
    await requireAdmin(env, url.searchParams.get('token'));
    const rows = await env.DB.prepare('SELECT * FROM app_showcase ORDER BY published_at DESC').all();
    return json(rows.results.map((a) => ({ appId: a.app_id, title: a.title, description: a.description, publicUrl: a.public_url })));
  }

  if (path === 'admin/showcase/approve' && method === 'POST') {
    const body = await readJson(request);
    await requireAdmin(env, body.token);
    const sub = await env.DB.prepare('SELECT * FROM project_submissions WHERE submission_id = ?').bind(body.submissionId).first();
    if (!sub) throw new ApiError('SUBMISSION_NOT_FOUND', 404);
    if (sub.review_status !== 'APPROVED') throw new ApiError('SUBMISSION_NOT_APPROVED', 409);
    if (!sub.permission_to_publish) throw new ApiError('PUBLISH_CONSENT_REQUIRED', 403);
    const resolvedUrl = String(body.publicUrl || sub.project_url || '').trim();
    if (!isSafeHttpUrl(resolvedUrl)) throw new ApiError('SHOWCASE_URL_INVALID', 400);
    const id = 'SHOW-' + crypto.randomUUID().slice(0, 8).toUpperCase();
    await env.DB.prepare('INSERT INTO app_showcase (app_id, submission_id, title, description, public_url, permission_to_publish, approved_by, published_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)')
      .bind(id, body.submissionId, String(body.title || sub.project_name || '').slice(0, 200), String(body.description || '').slice(0, 1000), resolvedUrl, 'ADMIN', new Date().toISOString()).run();
    await audit(env, 'SHOWCASE_APPROVED', body.submissionId, 'ADMIN', '', id);
    return json({ ok: true, appId: id });
  }

  // ---------------- Learner (My Class) ----------------
  if (path === 'class/me' && method === 'POST') {
    const body = await readJson(request);
    const reg = await identifyLearner(env, body.registrationId, body.contact);
    const course = await env.DB.prepare('SELECT * FROM courses WHERE course_code = ?').bind(reg.course_code).first();
    const lessons = await env.DB.prepare("SELECT * FROM lessons WHERE course_code = ? AND COALESCE(status,'PUBLISHED') != 'HIDDEN' ORDER BY ordering").bind(reg.course_code).all();
    const progress = await env.DB.prepare('SELECT lesson_id, status FROM learner_progress WHERE registration_id = ?').bind(reg.registration_id).all();
    const progressByLesson = {}; progress.results.forEach((p) => progressByLesson[p.lesson_id] = p.status);
    const subs = await env.DB.prepare('SELECT * FROM project_submissions WHERE registration_id = ? ORDER BY submitted_at DESC').bind(reg.registration_id).all();
    return json({
      registrationId: reg.registration_id,
      courseCode: reg.course_code, courseName: reg.course_name || (course && course.course_name) || reg.course_code,
      status: reg.status,
      lessons: lessons.results.map((l) => ({ lessonId: l.lesson_id, title: l.title, resourceUrl: l.resource_url, status: progressByLesson[l.lesson_id] || 'NOT_STARTED' })),
      submissions: subs.results.map((s) => ({ submissionId: s.submission_id, projectName: s.project_name, projectUrl: s.project_url, submittedAt: s.submitted_at, reviewStatus: s.review_status || 'PENDING', reviewerNote: s.reviewer_note || '' }))
    });
  }

  if (path === 'class/lesson/mark' && method === 'POST') {
    const body = await readJson(request);
    const reg = await identifyLearner(env, body.registrationId, body.contact);
    const status = String(body.status || '');
    if (!['NOT_STARTED', 'IN_PROGRESS', 'DONE'].includes(status)) throw new ApiError('PROGRESS_STATUS_INVALID', 400);
    const lesson = await env.DB.prepare('SELECT 1 FROM lessons WHERE lesson_id = ? AND course_code = ?').bind(body.lessonId, reg.course_code).first();
    if (!lesson) throw new ApiError('LESSON_NOT_FOUND', 404);
    await env.DB.prepare(
      'INSERT INTO learner_progress (registration_id, lesson_id, status, updated_at) VALUES (?, ?, ?, ?) ' +
      'ON CONFLICT(registration_id, lesson_id) DO UPDATE SET status = ?, updated_at = ?'
    ).bind(reg.registration_id, body.lessonId, status, new Date().toISOString(), status, new Date().toISOString()).run();
    return json({ ok: true });
  }

  if (path === 'class/submit' && method === 'POST') {
    const body = await readJson(request);
    const reg = await identifyLearner(env, body.registrationId, body.contact);
    const projectUrl = String(body.projectUrl || '').trim();
    if (!isSafeHttpUrl(projectUrl)) throw new ApiError('PROJECT_URL_INVALID', 400);
    const projectName = String(body.projectName || '').trim().slice(0, 200) || ('ผลงานของ ' + String(reg.name || ''));
    const permissionToPublish = body.permissionToPublish === true ? 1 : 0;
    const id = 'SUB-' + crypto.randomUUID().slice(0, 8).toUpperCase();
    await env.DB.prepare(
      'INSERT INTO project_submissions (submission_id, registration_id, course_code, session_id, project_name, project_url, submitted_at, review_status, reviewer_note, permission_to_publish) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, reg.registration_id, reg.course_code, reg.session_id, projectName, projectUrl, new Date().toISOString(), 'PENDING', '', permissionToPublish).run();
    await audit(env, 'PROJECT_SUBMITTED', reg.registration_id, 'PUBLIC', reg.session_id, 'PENDING');
    return json({ ok: true, submissionId: id });
  }

  // ---------------- Public ----------------
  if (path === 'public/showcase' && method === 'GET') {
    const rows = await env.DB.prepare('SELECT title, description, public_url FROM app_showcase WHERE permission_to_publish = 1 ORDER BY published_at DESC').all();
    return json(rows.results.map((a) => ({ title: a.title, description: a.description, publicUrl: a.public_url })));
  }

  return err('NOT_FOUND', 404);
}

export async function onRequest(context) {
  try {
    return await handle(context.request, context.env);
  } catch (e) {
    if (e instanceof ApiError) return err(e.message, e.status);
    return err('INTERNAL_ERROR: ' + String(e && e.message || e), 500);
  }
}
