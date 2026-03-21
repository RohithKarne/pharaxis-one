/**
 * Auto-translation utility — MyMemory API (free, no key required)
 * Translates content fields and stores results in translations_json columns.
 */

const https = require('https');
const db    = require('../database/db');

// Split long text into ≤450-char chunks at word/tag boundaries
function chunkText(text, max = 450) {
  if (!text || text.length <= max) return [text];
  const chunks = [];
  let remaining = String(text);
  while (remaining.length > 0) {
    if (remaining.length <= max) { chunks.push(remaining); break; }
    let breakAt = max;
    for (let i = max; i > max - 80 && i > 0; i--) {
      if (remaining[i] === ' ' || remaining[i] === '>') { breakAt = i + 1; break; }
    }
    chunks.push(remaining.slice(0, breakAt));
    remaining = remaining.slice(breakAt);
  }
  return chunks;
}

// MyMemory uses zh-CN for Simplified Chinese
const LANG_REMAP = { zh: 'zh-CN' };
function apiLang(code) { return LANG_REMAP[code] || code; }

function callMyMemory(text, targetLang, sourceLang) {
  return new Promise(resolve => {
    if (!text?.trim()) return resolve(text || '');
    const encoded = encodeURIComponent(text.slice(0, 450));
    const url = `https://api.mymemory.translated.net/get?q=${encoded}&langpair=${apiLang(sourceLang)}|${apiLang(targetLang)}`;
    const timer = setTimeout(() => resolve(text), 10000);
    https.get(url, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        clearTimeout(timer);
        try {
          const json = JSON.parse(data);
          if (json.responseStatus === 200 && json.responseData?.translatedText) {
            resolve(json.responseData.translatedText);
          } else { resolve(text); }
        } catch { resolve(text); }
      });
    }).on('error', () => { clearTimeout(timer); resolve(text); });
  });
}

async function translateText(text, targetLang, sourceLang = 'en') {
  if (!text || targetLang === sourceLang) return text || '';
  const chunks  = chunkText(String(text));
  const results = [];
  for (let i = 0; i < chunks.length; i++) {
    results.push(await callMyMemory(chunks[i], targetLang, sourceLang));
    if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 250)); // rate limit
  }
  return results.join('');
}

// Get languages to translate into (all enabled minus the source/default)
function getTargetLangs(clientId) {
  try {
    const row = db.prepare('SELECT language_config_json FROM cp_clients WHERE id = ?').get(clientId);
    if (!row?.language_config_json) return [];
    const cfg    = JSON.parse(row.language_config_json);
    const source = cfg.default || 'en';
    return (cfg.enabled || ['en']).filter(l => l !== source);
  } catch { return []; }
}

/**
 * Fire-and-forget: translate the given fields and save to translations_json.
 * Call without await so the admin save response is not blocked.
 *
 * @param {number} clientId
 * @param {string} table      - DB table name (cp_news_posts, cp_safety_alerts, etc.)
 * @param {number} rowId
 * @param {object} fields     - { fieldName: 'text to translate', ... }
 * @param {string} sourceLang - language the content was written in (default 'en')
 */
async function autoTranslate(clientId, table, rowId, fields, sourceLang = 'en') {
  const targetLangs = getTargetLangs(clientId);
  if (!targetLangs.length) return;
  try {
    const translations = {};
    for (const lang of targetLangs) {
      translations[lang] = {};
      for (const [key, value] of Object.entries(fields)) {
        if (value && typeof value === 'string' && value.trim()) {
          translations[lang][key] = await translateText(value, lang, sourceLang);
        }
      }
    }
    // Merge with any existing translations (e.g. partial update)
    const existing = db.prepare(`SELECT translations_json FROM ${table} WHERE id = ?`).get(rowId);
    let prev = {};
    try { prev = JSON.parse(existing?.translations_json || '{}'); } catch {}
    db.prepare(`UPDATE ${table} SET translations_json = ? WHERE id = ?`)
      .run(JSON.stringify({ ...prev, ...translations }), rowId);
  } catch (err) {
    console.error(`[translator] ${table}#${rowId}:`, err.message);
  }
}

/**
 * Apply stored translations to a row object.
 * Returns a new object with translated field values (falls back to original if not available).
 *
 * @param {object} row
 * @param {string} lang   - target language code
 * @param {string[]} fields - field names to replace if a translation exists
 */
function applyTranslation(row, lang, fields) {
  if (!row || !lang || lang === 'en' || !row.translations_json) return row;
  let t = {};
  try { t = JSON.parse(row.translations_json)[lang] || {}; } catch {}
  const result = { ...row };
  for (const f of fields) { if (t[f]) result[f] = t[f]; }
  return result;
}

module.exports = { autoTranslate, translateText, applyTranslation };
