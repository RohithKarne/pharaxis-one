# CP Portal

CP Portal is the medical-affairs external interaction layer in Pharaxis-One.
It includes both internal admin controls and public-facing portal APIs/UI.

## Scope

- Admin Console configuration workflows
- Public portal content and submission flows
- Notification and scheduled content publication support

## Tech Stack

- Backend: Node.js + Express
- Frontend: React + Vite
- Database: MySQL (`pharaxis_cp_portal_dev` by default)

## Paths

- Backend: `backend/`
- Frontend: `frontend/`
- DB init/schema: `backend/database/db.js`

## Run Locally

### Backend

```bash
cd apps/cp-portal/backend
npm install
npm run dev
```

### Frontend

```bash
cd apps/cp-portal/frontend
npm install
npm run dev
```

### Virus scanner (ClamAV) — required

Every uploaded file is checked by ClamAV before it can be downloaded or sent to MIMS
(CPPM-39). Without the scanner running, portal attachments are **held** (the report is
still saved) and admin uploads are **refused** with "could not be checked for viruses".

```bash
brew install clamav
freshclam       # downloads the virus list; run it again to update
clamd --foreground --config-file=/opt/homebrew/etc/clamav/clamd.conf
```

`clamd.conf` needs `TCPSocket 3310`, `TCPAddr 127.0.0.1` and the same `DatabaseDirectory`
as `freshclam.conf`. If `freshclam` fails with "NULL X509 store", add
`CVDCertsDirectory /opt/homebrew/etc/clamav/certs` to both files. The portal reads `CLAMAV_HOST` (default `127.0.0.1`), `CLAMAV_PORT`
(default `3310`) and `CLAMAV_TIMEOUT_MS` (default `30000`). Held files are rescanned every
minute once the scanner is back.

## Default Runtime

- Backend port: `4000` (`CP_PORT`)
- Frontend port: `5174`
- Health endpoint: `GET /api/health`

## API Areas

- `/api/admin/*` for authenticated admin operations
- `/api/portal/*` for public/portal-side flows

## Environment

Copy and configure:

- `backend/.env.example` -> `backend/.env`

## Cross-App Context

CP Portal is designed to operate alongside MIMS and can exchange submission/content context as part of wider product workflows.

See cross-repo docs:
- `docs/ARCHITECTURE.md`
- `docs/DB_DETAILS.md`
