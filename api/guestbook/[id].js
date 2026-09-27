// DELETE /api/guestbook/:id → oculta a mensagem (admin). Fica no banco com is_hidden = true.
const gb = require('../_lib/guestbook');

module.exports = gb.handler({
  async DELETE(req, res) {
    gb.requireAdmin(req);
    gb.requireJson(req);
    const id = gb.validId(req.query && req.query.id);
    const item = await gb.store.update(id, { is_hidden: true });
    if (!item) throw new gb.HttpError(404, 'not_found');
    gb.send(res, 200, { ok: true, id });
  },
});
