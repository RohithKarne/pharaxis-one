/**
 * contrast.js  (CP-29)
 *
 * WCAG contrast-ratio helpers so the admin Branding API can reject text colors
 * that would be unreadable against the portal background — the root cause of the
 * "blue body text" issue where a client set text_secondary to a saturated color.
 */

function parseHex(hex) {
  if (typeof hex !== 'string') return null;
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
}

function relLuminance([r, g, b]) {
  const chan = c => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}

/** Contrast ratio (1–21) between two hex colors, or null if either is invalid. */
function ratio(hexA, hexB) {
  const a = parseHex(hexA), b = parseHex(hexB);
  if (!a || !b) return null;
  const la = relLuminance(a), lb = relLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

// WCAG AA: 4.5:1 for normal text.
const AA_NORMAL = 4.5;

module.exports = { ratio, AA_NORMAL };
