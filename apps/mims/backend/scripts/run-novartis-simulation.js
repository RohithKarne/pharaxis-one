'use strict';

try { process.loadEnvFile(); } catch (_) {}

const pool = require('../database/db');
const { runNovartisSimulation, DEFAULT_NOVARTIS_SIMULATION_CONFIG } = require('../services/novartisSimulationService');

function toInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseArgs(argv) {
  const config = { ...DEFAULT_NOVARTIS_SIMULATION_CONFIG, useScheduledConfig: false };
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const [key, rawValue] = arg.slice(2).split('=');
    const value = rawValue == null ? 'true' : rawValue;
    switch (key) {
      case 'org':
      case 'org-id':
        config.orgId = toInt(value, config.orgId);
        break;
      case 'target-cases':
        config.targetCases = toInt(value, config.targetCases);
        break;
      case 'target-inquiries':
        config.targetInquiries = toInt(value, config.targetInquiries);
        break;
      case 'content-folders':
        config.contentFolders = toInt(value, config.contentFolders);
        break;
      case 'content-modules':
        config.contentModules = toInt(value, config.contentModules);
        break;
      case 'content-documents':
        config.contentDocuments = toInt(value, config.contentDocuments);
        break;
      case 'content-faqs':
        config.contentFaqs = toInt(value, config.contentFaqs);
        break;
      case 'help-articles':
        config.helpArticles = toInt(value, config.helpArticles);
        break;
      case 'archive-after-days':
        config.archiveAfterDays = toInt(value, config.archiveAfterDays);
        break;
      case 'history-span-days':
        config.historySpanDays = toInt(value, config.historySpanDays);
        break;
      case 'batch-size':
        config.batchSize = toInt(value, config.batchSize);
        break;
      case 'use-scheduled-config':
        config.useScheduledConfig = value !== 'false';
        break;
      default:
        break;
    }
  }
  return config;
}

async function main() {
  await pool.initPromise;
  const config = parseArgs(process.argv.slice(2));
  const result = await runNovartisSimulation(config);
  console.log(JSON.stringify(result, null, 2));
  await pool.end();
}

main().catch(async (err) => {
  console.error(err.stack || err.message || String(err));
  try {
    await pool.end();
  } catch (_) {}
  process.exit(1);
});
