// POST   /api/guestbook/admin/unlock  { password } → grava cookie de admin (httpOnly, 7 dias)
// DELETE /api/guestbook/admin/unlock               → sai do modo admin
const gb = require('../../_lib/guestbook');
const sleep = ms => new Promise(r => setTimeout(r, ms));

module.exports = gb.handler({
  async POST(req, res) {
    const { password } = await gb.readJson(req);
    const ok = typeof password === 'string' && password.length <= 200 && gb.safeEqual(password, gb.env('ADMIN_SECRET'));
    if (!ok) { await sleep(800); throw new gb.HttpError(401, 'wrong_password'); }  // atrasa tentativas de força bruta
    gb.send(res, 200, { admin: true }, { 'Set-Cookie': gb.adminCookie() });
  },
  async DELETE(req, res) {
    gb.send(res, 200, { admin: false }, { 'Set-Cookie': gb.clearAdminCookie() });
  },
});
