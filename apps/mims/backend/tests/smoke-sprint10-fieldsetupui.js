'use strict';

const fs = require('fs');

const JSX_PATH = 'mims/frontend/src/modules/admin/pages/AdminConsolePage.jsx';

function countOccurrences(source, token) {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = source.match(new RegExp(escaped, 'g'));
  return matches ? matches.length : 0;
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

  const tests = [
    {
      name: 'TEST 1 — Two-pane CSS structure exists',
      pass:
        content.includes('ac-picklists-shell') &&
        content.includes('ac-picklists-left') &&
        content.includes('ac-picklists-right'),
      detail: "contains 'ac-picklists-shell', 'ac-picklists-left', and 'ac-picklists-right'",
    },
    {
      name: 'TEST 2 — AE category grouping present',
      pass:
        content.includes('AE — General') &&
        content.includes('AE — Events & Seriousness') &&
        content.includes('AE — Patient Information'),
      detail: "contains AE grouping labels",
    },
    {
      name: 'TEST 3 — PC category grouping present',
      pass:
        content.includes('PC — General') &&
        content.includes('PC — Return & Retrieval') &&
        content.includes('PC — Refund & Credit'),
      detail: "contains PC grouping labels",
    },
    {
      name: 'TEST 4 — MI category grouping present',
      pass:
        content.includes('MI — Category & Product') &&
        content.includes('MI — Question Details') &&
        content.includes('MI — Response'),
      detail: "contains MI grouping labels",
    },
    {
      name: 'TEST 5 — help_text input exposed',
      pass: countOccurrences(content, 'help_text') >= 2,
      detail: `occurrences=${countOccurrences(content, 'help_text')} (expected >= 2)`,
    },
    {
      name: 'TEST 6 — max_length input exposed',
      pass: countOccurrences(content, 'max_length') >= 2,
      detail: `occurrences=${countOccurrences(content, 'max_length')} (expected >= 2)`,
    },
    {
      name: 'TEST 7 — default_value input exposed',
      pass: countOccurrences(content, 'default_value') >= 2,
      detail: `occurrences=${countOccurrences(content, 'default_value')} (expected >= 2)`,
    },
    {
      name: 'TEST 8 — addFlexField calls backend API',
      pass: content.includes('field-setup/flex'),
      detail: "contains 'field-setup/flex'",
    },
    {
      name: 'TEST 9 — Delete flex field calls backend',
      pass: content.includes('field-setup/flex/') && content.includes('DELETE'),
      detail: "contains 'field-setup/flex/' and 'DELETE'",
    },
    {
      name: 'TEST 10 — Actions column header present',
      pass: content.includes('Actions'),
      detail: "contains 'Actions'",
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
