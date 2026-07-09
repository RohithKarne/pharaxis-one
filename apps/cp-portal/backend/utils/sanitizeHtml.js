/**
 * sanitizeHtml.js  (CP-28)
 *
 * Allow-list HTML sanitizer for admin-authored rich text (news, safety alerts),
 * replacing the previous blocklist regex which was bypassable. This runs on
 * write; the frontend also sanitizes with DOMPurify on render — defense in depth.
 *
 * Strategy (allow-list, not block-list):
 *   - Strip script/style/iframe/object/embed/form/svg/math and their contents.
 *   - Drop every tag not on the allow-list (keeping inner text).
 *   - Strip every attribute except href on <a>; href must be http(s)/mailto.
 *   - Remove all on*= handlers and javascript:/data: URLs.
 */

const ALLOWED_TAGS = new Set([
  'p', 'br', 'b', 'strong', 'i', 'em', 'u', 'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4', 'blockquote', 'a', 'span', 'hr', 'table', 'thead',
  'tbody', 'tr', 'td', 'th',
]);

function safeHref(value) {
  const v = String(value || '').trim();
  if (/^(https?:|mailto:)/i.test(v)) return v.replace(/"/g, '%22');
  return null;
}

function sanitizeHtml(dirty) {
  if (!dirty) return '';
  let html = String(dirty);

  // 1) Remove dangerous elements and their entire contents.
  html = html.replace(/<(script|style|iframe|object|embed|form|svg|math|template|noscript)[\s\S]*?<\/\1\s*>/gi, '');
  // 2) Remove comments and any leftover opening tags of the above.
  html = html.replace(/<!--[\s\S]*?-->/g, '');
  html = html.replace(/<\/?(script|style|iframe|object|embed|form|svg|math|template|noscript)[^>]*>/gi, '');

  // 3) Walk every remaining tag; keep allow-listed ones with sanitized attrs.
  html = html.replace(/<(\/?)([a-zA-Z0-9]+)((?:[^>"']|"[^"]*"|'[^']*')*)>/g, (match, slash, tagRaw, attrs) => {
    const tag = tagRaw.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return ''; // drop the tag, keep surrounding text
    if (slash) return `</${tag}>`;

    // Only <a href> survives; everything else is dropped.
    if (tag === 'a') {
      const m = attrs.match(/\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
      const href = m ? safeHref(m[2] ?? m[3] ?? m[4]) : null;
      return href ? `<a href="${href}" rel="noopener noreferrer nofollow">` : '<a>';
    }
    return `<${tag}>`;
  });

  return html;
}

module.exports = { sanitizeHtml };
