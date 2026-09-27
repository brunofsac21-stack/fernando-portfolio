// GET  /api/guestbook?cursor=ISO  → lista paginada (20) + totais + chave pública do Turnstile + status de admin
// POST /api/guestbook             → cria mensagem (validação, Turnstile, rate limit 1/60s por IP)
const gb = require('../_lib/guestbook');
const PAGE = 20;
const RATE_SECONDS = 60;

module.exports = gb.handler({
  async GET(req, res) {
    const url = new URL(req.url, 'http://x');
    const cursor = url.searchParams.get('cursor');
    if (cursor && Number.isNaN(Date.parse(cursor))) throw new gb.HttpError(400, 'invalid_cursor');
    const [rows, totals] = await Promise.all([gb.store.list(cursor, PAGE), cursor ? null : gb.store.totals()]);
    const items = rows.slice(0, PAGE);
    gb.send(res, 200, {
      items,
      nextCursor: rows.length > PAGE ? items[items.length - 1].created_at : null,
      ...(totals ? { totals } : {}),
      siteKey: (process.env.TURNSTILE_SITE_KEY || '').trim() || null,
      admin: gb.isAdmin(req),
    });
  },

  async POST(req, res) {
    const body = await gb.readJson(req);
    if (body.website) throw new gb.HttpError(400, 'rejected');          // honeypot: campo invisível para humanos
    const { name, message } = gb.validateMessage(body);
    const ip = gb.clientIp(req);
    const hash = gb.ipHash(ip);
    const recent = await gb.store.recentFromIp(hash, RATE_SECONDS);
    if (recent) {
      const wait = Math.max(1, RATE_SECONDS - Math.floor((Date.now() - Date.parse(recent.created_at)) / 1000));
      throw Object.assign(new gb.HttpError(429, 'rate_limited'), { extra: { retryAfter: wait } });
    }
    await gb.verifyTurnstile(body.token, ip);
    const item = await gb.store.insert({ name, message, ip_hash: hash });
    gb.send(res, 201, { item });
  },
});
