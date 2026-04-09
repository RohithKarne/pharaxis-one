'use strict';

const fs = require('fs');

const JSX_PATH = 'mims/frontend/src/modules/cases/pages/CaseFormPage.jsx';

function getArrayBody(source, arrayName) {
  const re = new RegExp(`\\b(?:const|let|var)\\s+${arrayName}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*;?`);
  const match = source.match(re);
  return match ? match[1] : null;
}

function countKeyEntries(arrayBody) {
  if (!arrayBody) return 0;
  const matches = arrayBody.match(/\{\s*key\s*:/g);
  return matches ? matches.length : 0;
}

function getRegionByLines(source, anchor, lineCount) {
  const lines = source.split(/\r?\n/);
  const start = lines.findIndex((line) => line.includes(anchor));
  if (start === -1) return '';
  return lines.slice(start, start + lineCount).join('\n');
}

function run() {
  let content;
  try {
    content = fs.readFileSync(JSX_PATH, 'utf8');
  } catch (err) {
    console.log(`FAIL - Could not read file: ${JSX_PATH}`);
    console.log(`Reason: ${err.message}`);
    console.log('0 PASS | 1 FAIL');
    process.exit(1);
  }

  const results = [];

  const aeTabsBody = getArrayBody(content, 'AE_TABS');
  const pcTabsBody = getArrayBody(content, 'PC_TABS');
  const aeTabsFirst50Lines = getRegionByLines(content, 'AE_TABS', 50);

  const tests = [
    {
      name: 'TEST 1 — AE_TABS has 9 entries',
      pass: countKeyEntries(aeTabsBody) === 9,
      detail: `count=${countKeyEntries(aeTabsBody)}`,
    },
    {
      name: 'TEST 2 — AE Flex Fields tab exists in AE_TABS',
      pass: aeTabsFirst50Lines.includes('ae-flex-fields'),
      detail: "contains 'ae-flex-fields' in first 50 lines from AE_TABS",
    },
    {
      name: 'TEST 3 — PC_TABS has 7 entries',
      pass: countKeyEntries(pcTabsBody) === 7,
      detail: `count=${countKeyEntries(pcTabsBody)}`,
    },
    {
      name: 'TEST 4 — PC Flex Fields tab exists in PC_TABS',
      pass: content.includes('pc-flex-fields'),
      detail: "contains 'pc-flex-fields'",
    },
    {
      name: 'TEST 5 — getSectionVisible is called in render',
      pass: (content.match(/getSectionVisible/g) || []).length >= 5,
      detail: `occurrences=${(content.match(/getSectionVisible/g) || []).length}`,
    },
    {
      name: 'TEST 6 — getPicklistOptions is called in render',
      pass: (content.match(/getPicklistOptions/g) || []).length >= 5,
      detail: `occurrences=${(content.match(/getPicklistOptions/g) || []).length}`,
    },
    {
      name: 'TEST 7 — AE flex fields panel content exists',
      pass: content.includes('ae-flex-fields') && content.includes('ae_flex_1'),
      detail: "contains 'ae-flex-fields' and 'ae_flex_1'",
    },
    {
      name: 'TEST 8 — PC flex fields panel content exists',
      pass: content.includes('pc-flex-fields') && content.includes('pc_flex_1'),
      detail: "contains 'pc-flex-fields' and 'pc_flex_1'",
    },
    {
      name: 'TEST 9 — custom_label support in fieldRow',
      pass: content.includes('custom_label') && content.includes('displayLabel'),
      detail: "contains 'custom_label' and 'displayLabel'",
    },
    {
      name: 'TEST 10 — formConfig state declared',
      pass: content.includes('formConfig'),
      detail: "contains 'formConfig'",
    },
  ];

  for (const test of tests) {
    results.push(test.pass);
    console.log(`${test.pass ? 'PASS' : 'FAIL'} - ${test.name} (${test.detail})`);
  }

  const passCount = results.filter(Boolean).length;
  const failCount = results.length - passCount;
  console.log(`${passCount} PASS | ${failCount} FAIL`);

  if (failCount > 0) {
    process.exitCode = 1;
  }
}

run();
