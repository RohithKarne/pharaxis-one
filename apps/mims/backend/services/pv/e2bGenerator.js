'use strict';

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function tag(name, value, attrs = '') {
  if (value === undefined || value === null || value === '') return '';
  return `<${name}${attrs}>${esc(value)}</${name}>`;
}

function block(name, body, attrs = '') {
  const content = String(body || '').trim();
  return content ? `<${name}${attrs}>${content}</${name}>` : '';
}

function boolCode(value) {
  if (value === true || value === 'true' || value === 'y' || value === 'Y') return 'true';
  return 'false';
}

function generateE2BXml(icsr = {}, dependencies = {}) {
  const report = icsr.report || icsr;
  const drugs = icsr.drugs || [];
  const reactions = icsr.reactions || [];
  const tests = icsr.tests || icsr.test_results || [];
  const history = icsr.history || icsr.medical_history || [];
  const seriousness = typeof report.seriousness_classification === 'string'
    ? safeJson(report.seriousness_classification, {})
    : (report.seriousness_classification || {});
  const sender = dependencies.sender || {};

  const reactionXml = reactions.map((reaction, index) => block('reaction', [
    tag('reactionprimarysourcereaction', reaction.meddra_pt_name || reaction.term || `Reaction ${index + 1}`),
    tag('reactionmeddraversionpt', reaction.meddra_version || dependencies.meddraVersion || ''),
    tag('reactionmeddrapt', reaction.meddra_pt || reaction.meddra_code || ''),
    tag('reactionmeddrallt', reaction.meddra_llt || ''),
    tag('reactionstartdate', reaction.onset_date || ''),
    tag('reactionenddate', reaction.end_date || ''),
    tag('reactionoutcome', reaction.outcome || ''),
    tag('termhighlighted', reaction.term_highlighted || 'n'),
  ].join(''))).join('');

  const drugXml = drugs.map((drug) => block('drug', [
    tag('drugcharacterization', drug.drug_role || 'suspect'),
    tag('medicinalproduct', drug.medicinal_product_name || drug.product_name || ''),
    tag('activesubstancename', drug.active_substance || ''),
    tag('drugbatchnumb', drug.batch_no || ''),
    tag('drugstructuredosagenumb', drug.dose_amount || ''),
    tag('drugstructuredosageunit', drug.dose_unit || ''),
    tag('drugdosageform', drug.dose_form || ''),
    tag('drugadministrationroute', drug.route_of_admin || ''),
    tag('drugindication', drug.indication || ''),
    tag('drugindicationmeddraversion', drug.indication_meddra_version || dependencies.meddraVersion || ''),
    tag('drugindicationmeddrallt', drug.indication_meddra || ''),
    tag('drugstartdate', drug.start_date || ''),
    tag('drugenddate', drug.end_date || ''),
    tag('actiondrug', drug.action_taken || ''),
    tag('drugrecurreadministration', drug.rechallenge || ''),
  ].join(''))).join('');

  const testXml = tests.map((test) => block('test', [
    tag('testname', test.test_name || ''),
    tag('testdate', test.test_date || ''),
    tag('testresult', test.result_text || test.result_unstructured || ''),
    tag('lowtestrange', test.test_normal_low || ''),
    tag('hightestrange', test.test_normal_high || ''),
  ].join(''))).join('');

  const historyXml = history.map((entry) => block('medicalhistoryepisode', [
    tag('patientepisodename', entry.comments || entry.term || entry.structure || ''),
    tag('patientmedicalstartdate', entry.start_date || ''),
    tag('patientmedicalenddate', entry.end_date || ''),
    tag('patientmeddrallt', entry.meddra_code || ''),
  ].join(''))).join('');

  const patient = icsr.patient || {};
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ichicsr xmlns="urn:ich:e2b:r3">
  <ichicsrmessageheader>
    ${tag('messagetype', 'ichicsr')}
    ${tag('messageformatversion', '3.0')}
    ${tag('messageformatrelease', 'R3')}
    ${tag('messagenumb', report.sender_safety_report_id || `DRAFT-${report.case_id || 'CASE'}`)}
    ${tag('messagesenderidentifier', sender.identifier || `ORG-${report.org_id || 'UNKNOWN'}`)}
    ${tag('messagereceiveridentifier', report.receiver_id || 'FDA')}
    ${tag('messagedateformat', '204')}
    ${tag('messagedate', new Date().toISOString().slice(0, 10).replace(/-/g, ''))}
  </ichicsrmessageheader>
  <safetyreport>
    ${tag('safetyreportid', report.sender_safety_report_id || `DRAFT-${report.case_id || 'CASE'}`)}
    ${tag('primarysourcecountry', report.primary_source_country || '')}
    ${tag('occurcountry', report.primary_source_country || '')}
    ${tag('receiptdate', report.receive_date || '')}
    ${tag('reporttype', report.report_type || 'spontaneous')}
    ${tag('serious', Object.values(seriousness).some(Boolean) ? '1' : '2')}
    ${tag('seriousnessdeath', boolCode(seriousness.death))}
    ${tag('seriousnesslifethreatening', boolCode(seriousness.lifeThreatening))}
    ${tag('seriousnesshospitalization', boolCode(seriousness.hospitalization))}
    ${tag('seriousnessdisabling', boolCode(seriousness.disability))}
    ${tag('seriousnesscongenitalanomali', boolCode(seriousness.congenitalAnomaly))}
    ${tag('seriousnessother', boolCode(seriousness.otherMI))}
    ${block('primarysource', tag('reportercountry', report.primary_source_country || ''))}
    ${block('patient', [
      tag('patientinitial', patient.initials || patient.name || ''),
      tag('patientbirthdate', patient.date_of_birth || patient.dob || ''),
      tag('patientsex', patient.sex || patient.gender || ''),
      historyXml,
      reactionXml,
      testXml,
      drugXml,
    ].join(''))}
    ${block('summary', tag('narrativeincludeclinical', report.narrative || ''))}
  </safetyreport>
</ichicsr>`;
  return xml.replace(/\n\s*\n/g, '\n');
}

function safeJson(value, fallback) {
  try { return JSON.parse(value); } catch (_) { return fallback; }
}

module.exports = { generateE2BXml, esc, tag };
