/* Small shared helpers: token formatting and text binding. */
window.DR = window.DR || {};

(() => {
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  /** Read a dotted path ("primary.ip") from an object. */
  DR.get = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

  DR.clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  /** Replace {tokens} with CONFIG values. Unknown tokens are left as-is. */
  DR.fmt = (s) => String(s ?? '').replace(/\{([\w.]+)\}/g, (m, p) => {
    const v = DR.get(DR.CONFIG, p);
    return v == null || typeof v === 'object' ? m : String(v);
  });

  /** Plain text version (backticks stripped) — for titles / aria labels. */
  DR.fmtText = (s) => DR.fmt(s).replace(/`/g, '');

  /** Safe HTML version: escaped, with `code` spans. */
  DR.fmtHtml = (s) => DR.fmt(s)
    .replace(/[&<>"']/g, (c) => ESC[c])
    .replace(/`([^`]+)`/g, '<code>$1</code>');

  /** Fill every [data-text="config.path"] element under root. */
  DR.bindText = (root = document) => {
    root.querySelectorAll('[data-text]').forEach((el) => {
      const v = DR.get(DR.CONFIG, el.dataset.text);
      if (v == null) console.warn('[DR] missing CONFIG text:', el.dataset.text);
      el.innerHTML = DR.fmtHtml(v ?? '');
    });
  };
})();
