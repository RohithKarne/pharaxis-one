/**
 * training.js — the rules for training modules, attempts and certificates (CPPM-15).
 *
 * A module can be taken only when it is marked Available, has at least one
 * question, and points at a document the reader is allowed to see. Attempts are
 * marked here on the server, never in the browser. A pass gets a reference; the
 * certificate is built from the stored attempt, so it can only ever say what was
 * recorded — it names the client as issuer, never Pharaxis, and makes no claim of
 * accreditation or credits (CPPM-15 decision B).
 */
const crypto = require('crypto');
const { documentUnavailableReason } = require('../utils/documentVisibility');

const AVAILABLE = 'Available';
// Attempt times are stored in UTC; every query hands them out as ISO text with a Z.
const TAKEN_AT_SQL = "DATE_FORMAT(taken_at, '%Y-%m-%dT%H:%i:%sZ') AS taken_at";
const NOT_READY_MESSAGE = 'A module can be made available only once it has at least one question and a document to read.';

// Questions, the document and the pass mark are what a completion means, so
// changing any of them starts a new version. Earlier attempts keep theirs.
async function bumpVersion(conn, moduleId, clientId) {
  await conn.execute(
    'UPDATE cp_training_modules SET version = version + 1, updated_at = NOW() WHERE id = ? AND client_id = ?',
    [moduleId, clientId]);
}

async function questionCount(conn, moduleId) {
  const [[r]] = await conn.execute('SELECT COUNT(*) AS n FROM cp_training_questions WHERE module_id = ?', [moduleId]);
  return Number(r.n);
}

// The module's document, if it is one of this client's and a reader could see it
// today. userType is checked against the document's audience when given.
async function readableDocument(conn, module, userType) {
  if (!module.document_id) return null;
  const [[doc]] = await conn.execute(
    'SELECT id, title, mime_type, status, publish_at, expires_at, visible_to_json FROM cp_documents WHERE id = ? AND client_id = ? AND is_active = 1',
    [module.document_id, module.client_id]);
  if (!doc || documentUnavailableReason(doc)) return null;
  if (userType !== undefined) {
    const visibleTo = JSON.parse(doc.visible_to_json || '[]');
    if (visibleTo.length > 0 && !visibleTo.includes(userType)) return null;
  }
  return { id: doc.id, title: doc.title, mime_type: doc.mime_type };
}

// Marks answers ({ questionId: optionIndex }) against the module's current questions.
// Returns null when any question is unanswered or out of range.
function mark(questions, answers) {
  const given = answers && typeof answers === 'object' ? answers : {};
  const record = [];
  let correct = 0;
  for (const q of questions) {
    const options = JSON.parse(q.options_json);
    const chosen = Number(given[q.id]);
    if (!Number.isInteger(chosen) || chosen < 0 || chosen >= options.length) return null;
    if (chosen === q.correct_index) correct += 1;
    record.push({ question: q.question, options, chosen, correct_index: q.correct_index });
  }
  // Rounded down, so nobody passes below the mark (2 of 3 is 66%, not 67%).
  return { score: Math.floor((correct / questions.length) * 100), correct, record };
}

// "TR-" and ten characters with no look-alikes (no 0/O, 1/I/L), e.g. TR-7KX3M9QH2W.
function newReference() {
  const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  const bytes = crypto.randomBytes(10);
  return 'TR-' + Array.from(bytes, b => ALPHABET[b % ALPHABET.length]).join('');
}

// Validates a question from the admin screen. Returns an error message or null.
function questionError(body) {
  const question = String(body?.question || '').trim();
  const options = Array.isArray(body?.options) ? body.options.map(o => String(o || '').trim()) : [];
  const correct = Number(body?.correct_index);
  if (!question) return 'The question cannot be empty.';
  if (options.length < 2 || options.length > 6) return 'Give between 2 and 6 answers.';
  if (options.some(o => !o)) return 'An answer cannot be empty.';
  if (!Number.isInteger(correct) || correct < 0 || correct >= options.length) return 'Mark which answer is right.';
  return null;
}

// Streams the certificate for one stored, passed attempt.
function writeCertificate(res, attempt, issuerName) {
  const PDFDocument = require('pdfkit');
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 60 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="certificate-${attempt.reference}.pdf"`);
  doc.pipe(res);

  // taken_at arrives as ISO UTC text (TAKEN_AT_SQL).
  const date = new Date(attempt.taken_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const centre = { align: 'center' };
  doc.rect(30, 30, doc.page.width - 60, doc.page.height - 60).lineWidth(2).stroke('#6B3FA0');
  doc.moveDown(1.5);
  doc.font('Helvetica-Bold').fontSize(28).fillColor('#1A1A2E').text('Certificate of Completion', centre);
  doc.moveDown(1.2);
  doc.font('Helvetica').fontSize(13).fillColor('#374151').text('This records that', centre);
  doc.moveDown(0.4);
  doc.font('Helvetica-Bold').fontSize(22).fillColor('#1A1A2E').text(attempt.person_name, centre);
  doc.moveDown(0.6);
  doc.font('Helvetica').fontSize(13).fillColor('#374151').text('completed the training module', centre);
  doc.moveDown(0.4);
  doc.font('Helvetica-Bold').fontSize(16).fillColor('#1A1A2E').text(`${attempt.module_title} (version ${attempt.module_version})`, centre);
  doc.moveDown(0.6);
  doc.font('Helvetica').fontSize(13).fillColor('#374151')
    .text(`and passed its assessment with a score of ${attempt.score}% (pass mark ${attempt.pass_score}%) on ${date}.`, centre);
  doc.moveDown(1.6);
  doc.fontSize(12).fillColor('#1A1A2E').text(`Issued by ${issuerName}`, centre);
  doc.fontSize(11).fillColor('#374151').text(`Reference ${attempt.reference}`, centre);
  doc.moveDown(1.6);
  doc.fontSize(9).fillColor('#6B7280')
    .text('This records completion of the module above on this portal only. It is not evidence of accreditation or of credits earned.', centre);
  doc.end();
}

module.exports = { AVAILABLE, TAKEN_AT_SQL, NOT_READY_MESSAGE, bumpVersion, questionCount, readableDocument, mark, newReference, questionError, writeCertificate };
