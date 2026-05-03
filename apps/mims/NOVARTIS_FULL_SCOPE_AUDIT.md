# Novartis Full-Scope Audit

Updated: 2026-05-01
Org: `Novartis` (`org_id=1`)

## What Was Fixed

- Ran the built-in org repair path for Novartis.
- Ran the built-in org bootstrap path for Novartis.
- Restored baseline case integrity:
  - missing case numbering repaired
  - missing case status links repaired
  - core case numbering configs expanded to MI, AE, and PC
- Expanded bootstrap content pack:
  - folders increased from 2 to 4
  - modules increased from 6 to 8
  - documents increased from 8 to 10

## Current Stable Baseline

- Active sites: `1`
- Active workflow states available: `5`
- Help coverage: `28/28`
- Case numbering configs: `4`
- Cases missing case number: `0`
- Cases missing status link: `0`
- Process Explorer enabled: `true`
- 2FA enabled: `true`

## Executed Full-Scope Batch

The Novartis execution script has now been run and re-run successfully.

What was executed:

- backed up targeted junk rows under `apps/mims/backend/scripts/novartis-full-scope-backups/`
- archived null-type junk cases `45`, `46`, `47`, `48`
- archived additional junk-only active cases `6`, `7`, `49`
- deleted remaining wasteful unlinked test/noise inquiries and linked junk-message threads
- deactivated unused legacy master data:
  - `test product`
  - `tet` security group
- created realistic admin-console master data:
  - `5` contacts
  - `3` company reps
  - `4` product families
  - `5` active products
  - `5` transmission product groups
  - `6` active enterprise security groups
- created realistic Novartis internal users:
  - `Aisha Verma` (`admin`)
  - `Kunal Mehta` (`agent`)
  - `Neha Rao` (`agent`)
  - `Priya Iyer` (`reviewer`)
  - `Rohan Kulkarni` (`reviewer`)
- seeded linked operational flows:
  - `MI-00027` Entresto titration case
  - `MI-00028` Kisqali monitoring case
  - `AE-00003` Cosentyx hospitalization case
  - `PC-00001` Leqvio quality complaint case

## Seeded Ownership Model

- `Aisha Verma` is the seeded Novartis admin creator
- `Kunal Mehta` owns the two seeded MI cases and their inbox assignment/notes/response authoring
- `Neha Rao` owns the seeded AE and PC cases and their inbox assignment/notes
- `Priya Iyer` is the AE transmission assignee and MI approval user
- `Rohan Kulkarni` is the PC transmission assignee

## Current Post-Run State

- Active inquiries: `100020`
- Inquiry read receipts: `100020`
- Active cases: `100000`
- Archived generated cases: `45`
- Active org-access users: `6`
- Contacts: `5`
- Product families: `4`
- Products: `5`
- Security groups: `6`
- Product groups: `5`
- Content folders: `24`
- Content modules: `240`
- Content documents: `360`
- Content FAQs: `180`
- Help articles: `60`
- Scheduled simulation jobs: `1`

## Audit Outcome

- Cases missing case type: `0`
- Cases missing case number: `0`
- Cases missing status link: `0`
- Unlinked inquiries: `0`
- Unassigned inquiries: `0`
- Mailer-daemon noise rows: `0`
- Google/security-noise rows: `0`
- Delivery-failure noise rows: `0`
- Contacts missing: `0`
- Product families missing: `0`
- Security groups too thin: `0`
- Simulation schedule missing: `0`

## High-Volume Simulation Layer

The Novartis org now has the requested large-scale synthetic workload layer on top of the cleaned baseline.

What was added:

- high-volume inbox and case generation to maintain at least `100000` active cases and `100000` inbox emails
- proper cross-linking across:
  - inquiries
  - inquiry read receipts
  - case contacts
  - case comments
  - inquiry notes
  - case audit trail
  - MI response records
  - AE transmissions
  - PC transmissions
  - workload notifications
- content fill across:
  - `24` folders
  - `240` modules
  - `360` documents
  - `180` FAQs
  - `60` org-scoped help articles
- daily automation with scheduled job:
  - `novartis-daily-simulation-org-1`
  - cron: `15 1 * * *` UTC
  - last run status: `success`

## Workload Shape

Current active case mix:

- `MI`: `60007`
- `AE`: `19997`
- `PC`: `19996`

Current active case workflow spread:

- `Closed`: `44411`
- `Pending Follow-up`: `22221`
- `In Review`: `20003`
- `Triage`: `8894`
- `New`: `4471`

Current inbox triage spread:

- `closed`: `44456`
- `converted`: `22220`
- `linked`: `20005`
- `in_review`: `8893`
- `new`: `4446`

Current top inbox queues:

- `Medical Information`: `34988`
- `Safety Intake`: `14998`
- `Medical Escalations`: `14996`
- `Quality Complaints`: `11113`
- `Scientific Response Draft`: `10000`
- `Quality Archive`: `8883`
- `Safety Escalations`: `4997`
- `Archive`: `45`

## Remaining Gaps

These are not active blockers, but they are still worth knowing:

- the high-volume simulation is synthetic and bounded to the current Novartis contact, product, user, and scenario library
- daily archival currently soft-deletes generated old cases and archives linked inbox rows; it does not remove historical notification or audit rows
- if needed later, more feature-specific layers can still be added for chat, report-access, or additional admin-side activity

## Legacy User Stability Cleanup

The legacy Novartis test-user cleanup was executed after the seeded ownership pass.

What was done:

- revoked `342` tracked sessions from legacy Novartis test users
- disabled Novartis org access for `22` legacy users
- removed `7` legacy org security-group memberships
- reassigned active case `MI-00005` from `G10 User B` to `Kunal Mehta`
- globally deactivated legacy accounts that had no remaining active org access

Current active Novartis org users are now only:

- `Rohith Karne`
- `Aisha Verma`
- `Kunal Mehta`
- `Neha Rao`
- `Priya Iyer`
- `Rohan Kulkarni`

## What This Means

Novartis is now on a materially cleaner and more believable baseline. The org has realistic cross-linked flows, admin/master data, cleaner inbox state, and repeatable seeding mechanics. It is suitable for a stable demo/dev environment foundation.

The next optional build batch should focus on:

1. extend the scenario library with more brands, specialties, and reporter personas if you want even less repetition
2. add synthetic chat/report-access/admin-change traffic if those surfaces also need to feel continuously active
3. tune the daily retention window if you want faster or slower archive turnover
4. optionally review older non-seeded active cases and decide whether to preserve, enrich, or archive them

## Audit Script

Use this to re-check the org at any point:

```bash
cd /Users/rohithkarne/Pharaxis-One/apps/mims
node backend/scripts/audit-org-full-scope.js 1
```

## Execution Script

Use this to apply the current full-scope Novartis cleanup and baseline seed batch:

```bash
cd /Users/rohithkarne/Pharaxis-One/apps/mims
node backend/scripts/seed-novartis-full-scope.js 1
```

What it does right now:

- backs up targeted junk rows before deletion
- removes safe inbox noise and archives junk-only cases
- deactivates the unused `test product` and legacy `tet` security group when they have no live dependencies
- creates realistic contact master, company reps, product families, products, and transmission product groups
- seeds enterprise security-group templates, realistic Novartis users, and their group/site/module access
- creates linked MI, AE, and PC flows across inbox, cases, contacts, transmissions, comments, notifications, and audit trail
- rebinds seeded flow ownership to the realistic Novartis users on every rerun
- retires legacy Novartis test-user org access safely and revokes their tracked sessions
- assigns missing case numbers automatically for active cases created by the script

## Daily Simulation Script

Use this to run or rerun the high-volume workload generator manually:

```bash
cd /Users/rohithkarne/Pharaxis-One/apps/mims/backend
node scripts/run-novartis-simulation.js --target-cases=100000 --target-inquiries=100000 --content-folders=24 --content-modules=240 --content-documents=360 --content-faqs=180 --help-articles=60 --batch-size=300
```

What it does right now:

- ensures the Novartis baseline seed exists before bulk generation
- archives generated old cases and their linked inbox rows based on retention
- tops up active workload back to at least `100000` cases and `100000` inbox emails
- maintains linked workload data across MI, AE, and PC flows
- keeps the scheduled job row up to date for daily reruns
