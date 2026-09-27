// Helpers do livro de visitas (sem dependências: Node 18+ com fetch e crypto nativos)
const crypto = require('crypto');

const TABLE = 'guestbook_messages';
const PUBLIC_COLS = 'id,name,message,created_at,reply,replied_at';
const COOKIE = 'gb_admin';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 dias

function env(name) {
  const v = process.env[name];
  if (!v) throw Object.assign(new Error(`Variável de ambiente ausente: ${name}`), { status: 500, expose: false });
  return v;
}

/* ---------------- HTTP ---------------- */
function send(res, status, data, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(data));
}

class HttpError extends Error {
  constructor(status, code, message) { super(message || code); this.status = status; this.code = code; this.expose = true; }
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const ct = String(req.headers['content-type'] || '');
  if (!ct.includes('application/json')) throw new HttpError(415, 'unsupported_media_type');
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { throw new HttpError(400, 'invalid_json'); } }
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > 16 * 1024) throw new HttpError(413, 'payload_too_large'); chunks.push(c); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { throw new HttpError(400, 'invalid_json'); }
}

/** Envolve um handler: trata erros e métodos permitidos */
function handler(methods) {
  return async (req, res) => {
    const fn = methods[req.method];
    if (!fn) return send(res, 405, { error: 'method_not_allowed' }, { Allow: Object.keys(methods).join(', ') });
    try { await fn(req, res); }
    catch (err) {
      if (err.expose) return send(res, err.status || 400, { error: err.code || 'error', ...(err.extra || {}) });
      console.error('[guestbook]', err);
      send(res, 500, { error: 'server_error' });
    }
  };
}

function clientIp(req) {
  const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xff || String(req.headers['x-real-ip'] || '') || (req.socket && req.socket.remoteAddress) || '0.0.0.0';
}
const ipHash = ip => crypto.createHash('sha256').update(`${ip}|${env('IP_SALT')}`).digest('hex');

/* ---------------- Supabase (PostgREST) ---------------- */
async function db(path, { method = 'GET', body, prefer, head = false } = {}) {
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  const url = `${env('SUPABASE_URL').replace(/\/$/, '')}/rest/v1/${path}`;
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(url, { method: head ? 'HEAD' : method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  if (!r.ok) {
    const txt = head ? '' : await r.text().catch(() => '');
    throw new Error(`Supabase ${method} ${path} → ${r.status} ${txt.slice(0, 300)}`);
  }
  if (head) return { count: parseCount(r.headers.get('content-range')) };
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}
const parseCount = cr => { const m = /\/(\d+)$/.exec(cr || ''); return m ? Number(m[1]) : 0; };
const count = filter => db(`${TABLE}?select=id&is_hidden=eq.false${filter}`, { head: true, prefer: 'count=exact' }).then(r => r.count);

const store = {
  async list(cursor, limit) {
    let q = `${TABLE}?select=${PUBLIC_COLS}&is_hidden=eq.false&order=created_at.desc,id.desc&limit=${limit + 1}`;
    if (cursor) q += `&created_at=lt.${encodeURIComponent(cursor)}`;
    return db(q);
  },
  async totals() {
    const [messages, replies] = await Promise.all([count(''), count('&reply=not.is.null')]);
    return { messages, replies };
  },
  async recentFromIp(hash, seconds) {
    const since = new Date(Date.now() - seconds * 1000).toISOString();
    const rows = await db(`${TABLE}?select=created_at&ip_hash=eq.${hash}&created_at=gte.${encodeURIComponent(since)}&order=created_at.desc&limit=1`);
    return rows[0] || null;
  },
  async insert(row) {
    const rows = await db(`${TABLE}?select=${PUBLIC_COLS}`, { method: 'POST', body: row, prefer: 'return=representation' });
    return rows[0];
  },
  async update(id, patch) {
    const rows = await db(`${TABLE}?id=eq.${id}&select=${PUBLIC_COLS}`, { method: 'PATCH', body: patch, prefer: 'return=representation' });
    return rows[0] || null;
  },
};

/* ---------------- Validação ---------------- */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const clean = s => String(s == null ? '' : s)
  .normalize('NFC')
  .replace(/\r\n?/g, '\n')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, '')
  .replace(/\n{3,}/g, '\n\n')
  .trim();
const len = s => [...s].length; // conta emojis como 1 caractere

const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]{2,}\.(com|net|org|io|br|xyz|ru|info|biz|co|me|app|dev|site|online|top|shop|link|click)\b)/i;
const BAD = ['porra','caralho','buceta','puta','putaria','viado','arrombado','fdp','vagabunda','cuzão','cuzao','piranha','desgraçado',
             'fuck','shit','bitch','cunt','nigger','faggot','whore','puto','pendejo','mierda','coño','gilipollas','cabrón','cabron'];
const BAD_RE = new RegExp(`(^|[^\\p{L}])(${BAD.join('|')})(?=$|[^\\p{L}])`, 'iu');

function validateMessage(body) {
  const name = clean(body.name).replace(/\s+/g, ' ');
  const message = clean(body.message);
  const errors = {};
  if (len(name) < 2 || len(name) > 40) errors.name = 'length';
  if (len(message) < 3 || len(message) > 500) errors.message = 'length';
  if (!errors.name && (LINK.test(name) || BAD_RE.test(name))) errors.name = 'blocked';
  if (!errors.message && LINK.test(message)) errors.message = 'links';
  if (!errors.message && BAD_RE.test(message)) errors.message = 'blocked';
  if (Object.keys(errors).length) throw Object.assign(new HttpError(422, 'validation'), { extra: { fields: errors } });
  return { name, message };
}
function validateReply(body) {
  const reply = clean(body.reply);
  if (len(reply) < 1 || len(reply) > 1000) throw Object.assign(new HttpError(422, 'validation'), { extra: { fields: { reply: 'length' } } });
  return reply;
}
function validId(id) {
  if (!UUID.test(String(id || ''))) throw new HttpError(400, 'invalid_id');
  return String(id).toLowerCase();
}

/* ---------------- Turnstile ---------------- */
async function verifyTurnstile(token, ip) {
  if (!token || typeof token !== 'string' || token.length > 2048) throw new HttpError(400, 'captcha_required');
  const form = new URLSearchParams({ secret: env('TURNSTILE_SECRET_KEY'), response: token, remoteip: ip });
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
  const data = await r.json().catch(() => ({}));
  if (!data.success) throw new HttpError(403, 'captcha_failed');
  // o widget também aceita localhost (testes); em produção só vale o domínio do site
  const allowed = (process.env.TURNSTILE_HOSTNAMES || 'fernando-portfolio-sable.vercel.app')
    .split(',').map(h => h.trim().toLowerCase()).filter(Boolean);
  if (!allowed.includes(String(data.hostname || '').toLowerCase())) throw new HttpError(403, 'captcha_failed');
}

/* ---------------- Admin (cookie assinado com HMAC) ---------------- */
const hmac = v => crypto.createHmac('sha256', env('JWT_SECRET')).update(v).digest('base64url');
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}
function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach(p => {
    const i = p.indexOf('='); if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
function isAdmin(req) {
  const v = parseCookies(req)[COOKIE];
  if (!v) return false;
  const [exp, sig] = v.split('.');
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < Math.floor(Date.now() / 1000)) return false;
  try { return safeEqual(sig, hmac(`admin.${exp}`)); } catch { return false; }
}
function requireAdmin(req) { if (!isAdmin(req)) throw new HttpError(401, 'unauthorized'); }
function adminCookie() {
  const exp = Math.floor(Date.now() / 1000) + COOKIE_MAX_AGE;
  return `${COOKIE}=${exp}.${hmac(`admin.${exp}`)}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; Secure; SameSite=Strict`;
}
const clearAdminCookie = () => `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
/** Escritas de admin só aceitam JSON (bloqueia formulários de outros sites; o cookie já é SameSite=Strict) */
function requireJson(req) {
  if (!String(req.headers['content-type'] || '').includes('application/json')) throw new HttpError(415, 'unsupported_media_type');
}

module.exports = {
  HttpError, send, readJson, handler, clientIp, ipHash, store, validateMessage, validateReply, validId,
  verifyTurnstile, isAdmin, requireAdmin, adminCookie, clearAdminCookie, safeEqual, requireJson, env,
};
