'use strict';

/**
 * run-scheduler-at.js — run the real scheduler as if the clock read a chosen time (MIPM-75).
 *
 * Timed jobs (the 07:00 content expiry alert, the 15-minute scheduled reports, the
 * SLA timers) can be checked without waiting for the wall clock. The script starts
 * services/scheduler.js unchanged — same job list, cron wrapper and service-log
 * entries — with the process clock shifted so it reads the chosen time now, runs for
 * a few seconds, then stops. Only this process's clock moves; the database clock does
 * not, so put test data dates (an expiry date, a schedule time) relative to today.
 *
 * Usage, from apps/mims:
 *   node --env-file=.env backend/scripts/run-scheduler-at.js 2026-10-02T06:59:50Z [seconds=20]
 *
 * Refuses any database whose name does not end in "_test".
 */

const RealDate = Date;
const target = RealDate.parse(process.argv[2] || '');
const seconds = Number(process.argv[3] || 20);
if (Number.isNaN(target) || !(seconds > 0)) {
  console.error('usage: run-scheduler-at.js <ISO time, e.g. 2026-10-02T06:59:50Z> [seconds=20]');
  process.exit(1);
}
const dbName = process.env.MYSQL_DATABASE || '';
if (!dbName.endsWith('_test')) {
  console.error(`Refusing to run against "${dbName}": only a database ending in _test.`);
  process.exit(1);
}

// Shift "now" for everything in this process, the cron library included: it reads
// new Date() to work out how long to wait for the next matching minute.
const offset = target - RealDate.now();
global.Date = class ShiftedDate extends RealDate {
  constructor(...args) { if (args.length) super(...args); else super(RealDate.now() + offset); }
  static now() { return RealDate.now() + offset; }
};

const { startScheduler, stopScheduler, getJobStatus } = require('../services/scheduler');

console.log(`Clock reads ${new Date().toISOString()}; running the scheduler for ${seconds}s.`);
startScheduler();
console.log(`${getJobStatus().length} jobs scheduled.`);
setTimeout(() => {
  stopScheduler();
  console.log(`Stopped at ${new Date().toISOString()}. Each run is in the Service Log under "Job Scheduler".`);
  process.exit(0);
}, seconds * 1000);
