// Shared helpers for the ภนว | AI Guide Academy Cloudflare Pages Functions API.
// Backed by D1 (env.DB). Nothing here touches Smart Safety Portal, HSE
// Executive, or any other project's resources.

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

export function err(message, status = 400) {
  return json({ ok: false, error: message }, status);
}

export class ApiError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export async function readJson(request) {
  try { return await request.json(); } catch (e) { throw new ApiError('INVALID_JSON', 400); }
}

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(24))).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---- Admin auth: single shared secret, hashed, short-lived session tokens.
// Same shape as the login experience on the previous Apps Script Admin page
// (one secret, no separate accounts) — see backend-source/README.md for why
// the literal old secret could not be migrated.
export async function adminLogin(env, secret) {
  const rateKey = 'ADMIN_LOGIN';
  await checkRateLimit(env, rateKey);
  const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind('ADMIN_SECRET_SHA256_HEX').first();
  const expected = row && row.value;
  const got = await sha256Hex(String(secret || ''));
  if (!expected || got !== expected) {
    await recordRateLimitFailure(env, rateKey, 5, 5 * 60 * 1000);
    throw new ApiError('ADMIN_AUTH_FAILED', 401);
  }
  await clearRateLimit(env, rateKey);
  const token = randomToken();
  const now = Date.now();
  await env.DB.prepare('INSERT INTO admin_sessions (token, created_at, expires_at) VALUES (?, ?, ?)')
    .bind(token, now, now + 30 * 60 * 1000).run();
  return token;
}

export async function requireAdmin(env, token) {
  if (!token) throw new ApiError('ADMIN_AUTH_REQUIRED', 401);
  const now = Date.now();
  const row = await env.DB.prepare('SELECT token FROM admin_sessions WHERE token = ? AND expires_at > ?').bind(token, now).first();
  if (!row) throw new ApiError('ADMIN_AUTH_REQUIRED', 401);
}

// ---- Learner identity: registrationId + the email/phone used to register.
// Same pattern the old Apps Script lookupRegistration() used. Blank input is
// always rejected, and repeated failures per registrationId are rate-limited.
function normalizeEmail(v) { return String(v || '').trim().toLowerCase(); }
function normalizePhone(v) { return String(v || '').replace(/\D/g, '').replace(/^0+/, ''); }

export async function identifyLearner(env, registrationId, contact) {
  registrationId = String(registrationId || '').trim();
  contact = String(contact || '').trim();
  if (!registrationId || !contact) throw new ApiError('LOOKUP_NOT_FOUND', 404);

  const rateKey = 'LEARNER_LOOKUP_' + registrationId;
  await checkRateLimit(env, rateKey);

  const reg = await env.DB.prepare('SELECT * FROM registrations WHERE registration_id = ?').bind(registrationId).first();
  const normEmail = normalizeEmail(contact);
  const normPhone = normalizePhone(contact);
  const emailMatches = !!normEmail && reg && normalizeEmail(reg.email) === normEmail;
  const phoneMatches = !!normPhone && reg && normalizePhone(reg.phone) === normPhone;

  if (!reg || !(emailMatches || phoneMatches)) {
    await recordRateLimitFailure(env, rateKey, 8, 10 * 60 * 1000);
    throw new ApiError('LOOKUP_NOT_FOUND', 404);
  }
  await clearRateLimit(env, rateKey);
  return reg;
}

async function checkRateLimit(env, key) {
  const row = await env.DB.prepare('SELECT blocked_until FROM rate_limits WHERE rkey = ?').bind(key).first();
  if (row && row.blocked_until && row.blocked_until > Date.now()) throw new ApiError('RATE_LIMITED', 429);
}
async function recordRateLimitFailure(env, key, maxFailures, blockMs) {
  const now = Date.now();
  const row = await env.DB.prepare('SELECT fail_count FROM rate_limits WHERE rkey = ?').bind(key).first();
  const failCount = (row ? row.fail_count : 0) + 1;
  const blockedUntil = failCount >= maxFailures ? now + blockMs : 0;
  await env.DB.prepare(
    'INSERT INTO rate_limits (rkey, fail_count, blocked_until, updated_at) VALUES (?, ?, ?, ?) ' +
    'ON CONFLICT(rkey) DO UPDATE SET fail_count = ?, blocked_until = ?, updated_at = ?'
  ).bind(key, failCount, blockedUntil, now, failCount, blockedUntil, now).run();
}
async function clearRateLimit(env, key) {
  await env.DB.prepare('DELETE FROM rate_limits WHERE rkey = ?').bind(key).run();
}

export function isSafeHttpUrl(value) {
  return /^https:\/\/[^\s<>"']+$/i.test(String(value || '')) || /^http:\/\/[^\s<>"']+$/i.test(String(value || ''));
}

export async function audit(env, action, registrationId, actor, sessionId, status) {
  try {
    await env.DB.prepare('INSERT INTO audit_log (timestamp, action, registration_id, actor, session_id, status) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(new Date().toISOString(), action, registrationId || null, actor, sessionId || null, status).run();
  } catch (e) { /* audit failures never block the main action */ }
}
