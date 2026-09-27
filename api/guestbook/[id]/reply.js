// POST   /api/guestbook/:id/reply → cria ou edita a resposta (admin)
// DELETE /api/guestbook/:id/reply → remove a resposta (admin)
const gb = require('../../_lib/guestbook');

module.exports = gb.handler({
  async POST(req, res) {
    gb.requireAdmin(req);
    const id = gb.validId(req.query && req.query.id);
    const reply = gb.validateReply(await gb.readJson(req));
    const item = await gb.store.update(id, { reply, replied_at: new Date().toISOString() });
    if (!item) throw new gb.HttpError(404, 'not_found');
    gb.send(res, 200, { item });
  },
  async DELETE(req, res) {
    gb.requireAdmin(req);
    gb.requireJson(req);
    const id = gb.validId(req.query && req.query.id);
    const item = await gb.store.update(id, { reply: null, replied_at: null });
    if (!item) throw new gb.HttpError(404, 'not_found');
    gb.send(res, 200, { item });
  },
});
