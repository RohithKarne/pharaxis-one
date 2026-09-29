/**
 * Auto-translation utility — MyMemory API (free, no key required)
 * Translates content fields and stores results in translations_json columns.
 */

const https      = require('https');
const { pool }   = require('../database/db');

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

// CP-65 protective gate (Option A, compliance-approved by Vasu 2026-07-31).
// The free MyMemory endpoint has no DPA and can retain submitted text in a PUBLIC
// translation-memory corpus, so regulated medical/safety content must not be sent
// to it. Only content types confirmed non-regulated may auto-translate through the
// free API; regulated types are blocked here until a vetted, contracted vendor
// path exists. Tighten this set only with compliance (Vasu) + product (Saad) sign-off.
//   Allowed  : cp_news_posts, cp_faq_items      (non-regulated, pending Saad's confirmation they carry no drug/safety claims)
//   Blocked  : cp_safety_alerts, cp_documents   (regulated) — and any type not on the allowlist, fail-closed by default
const FREE_TRANSLATION_ALLOWLIST = new Set(['cp_news_posts', 'cp_faq_items']);

/** Whether a content type may use the free translation API (CP-65). Unknown types are blocked. */
function isTranslatableEntity(table) { return FREE_TRANSLATION_ALLOWLIST.has(table); }

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

// CPPM-9 outside-translation switch (2026-09-23, Rohith's decision — Option A).
// CP-65 above stops REGULATED content reaching the free MyMemory endpoint. CPPM-9
// closes the rest: that endpoint still has no data agreement, so by default NO portal
// content of any type is sent to it. The portal serves only translations held in our
// own database and otherwise falls back to the content as written.
// A client may opt in by setting "machine_translation": true in
// cp_clients.language_config_json. That flag is deliberately NOT settable through the
// admin API — turning outside translation on is a considered act with a compliance
// owner, not a checkbox. The CP-65 gate still applies on top of it: an opted-in client
// still never sends safety alerts or documents out.
function isMachineTranslationEnabled(cfg) { return cfg?.machine_translation === true; }

// Read a client's language config ({ default, enabled, machine_translation }).
async function getLanguageConfig(clientId) {
  try {
    const [[row]] = await pool.execute('SELECT language_config_json FROM cp_clients WHERE id = ?', [clientId]);
    if (!row?.language_config_json) return { default: 'en', enabled: ['en'] };
    return JSON.parse(row.language_config_json);
  } catch { return { default: 'en', enabled: ['en'] }; }
}

// Languages to translate into (all enabled minus the source/default)
function targetLangsFrom(cfg) {
  const source = cfg.default || 'en';
  return (cfg.enabled || ['en']).filter(l => l !== source);
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
  // CP-65 protective gate: block regulated content from the free API before any
  // outbound call. Logged (not silent) so a skipped translation is visible.
  if (!isTranslatableEntity(table)) {
    console.info(`[translator] skipped free-API translation for regulated content type "${table}" (CP-65 gate).`);
    return;
  }
  // CPPM-9: nothing leaves the building unless this client has explicitly opted in.
  // Logged (not silent) so a skipped translation is visible in the same way as CP-65.
  const cfg = await getLanguageConfig(clientId);
  if (!isMachineTranslationEnabled(cfg)) {
    console.info(`[translator] skipped outside translation of "${table}"#${rowId} — outside machine translation is off for client ${clientId} (CPPM-9). Stored translations are served as-is.`);
    return;
  }
  const targetLangs = targetLangsFrom(cfg);
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
    const [[existing]] = await pool.execute(`SELECT translations_json FROM \`${table}\` WHERE id = ?`, [rowId]);
    let prev = {};
    try { prev = JSON.parse(existing?.translations_json || '{}'); } catch {}
    await pool.execute(`UPDATE \`${table}\` SET translations_json = ? WHERE id = ?`,
      [JSON.stringify({ ...prev, ...translations }), rowId]);
  } catch (err) {
    console.error(`[translator] ${table}#${rowId}:`, err.message);
  }
}

// Fields of this row that actually carry content, and so need a translation before
// the row counts as translated. An empty field needs nothing translated.
function contentFields(row, fields) {
  return fields.filter(f => row[f] !== null && row[f] !== undefined && String(row[f]).trim() !== '');
}

/**
 * Apply stored translations to a row object.
 *
 * CPPM-9: all-or-nothing. A row is only shown in the requested language when EVERY
 * field that carries content has a stored translation. Otherwise the row is returned
 * exactly as written, so a reader sees one coherent language instead of a half
 * translated item or English text presented as French.
 *
 * @param {object} row
 * @param {string} lang   - target language code
 * @param {string[]} fields - field names to replace if a complete translation exists
 */
function applyTranslation(row, lang, fields) {
  if (!row || !lang || !row.translations_json) return row;
  let t = {};
  try { t = JSON.parse(row.translations_json)[lang] || {}; } catch {}
  const needed = contentFields(row, fields);
  if (!needed.length || !needed.every(f => t[f])) return row;
  const result = { ...row };
  for (const f of needed) { result[f] = t[f]; }
  return result;
}

/**
 * CPPM-9: which of `langs` this row has no complete stored translation for — the
 * languages in which it will fall back to the language it was written in. Uses the
 * same all-or-nothing rule as applyTranslation, so the admin view matches the portal.
 */
function missingTranslations(row, fields, langs) {
  let all = {};
  try { all = JSON.parse(row.translations_json || '{}'); } catch {}
  const needed = contentFields(row, fields);
  if (!needed.length) return [];
  return langs.filter(l => !needed.every(f => all[l]?.[f]));
}

module.exports = {
  autoTranslate, translateText, applyTranslation, isTranslatableEntity,
  getLanguageConfig, isMachineTranslationEnabled, missingTranslations,
};
