# MIMS-CP Portal

A two-application product suite for the pharmaceutical / medical information domain.

[![CI](https://github.com/RohithKarne/MIMS-CP-Portal/actions/workflows/ci.yml/badge.svg)](https://github.com/RohithKarne/MIMS-CP-Portal/actions/workflows/ci.yml)
[![Release](https://github.com/RohithKarne/MIMS-CP-Portal/actions/workflows/release.yml/badge.svg)](https://github.com/RohithKarne/MIMS-CP-Portal/actions/workflows/release.yml)
[![License: Private](https://img.shields.io/badge/license-private-red.svg)]()
[![Node](https://img.shields.io/badge/node-20.x-brightgreen.svg)](https://nodejs.org)
[![React](https://img.shields.io/badge/react-18.x-61DAFB.svg)](https://react.dev)

---

## Applications

### MIMS — Medical Information Management System
A cloud-based case-processing platform for handling medical inquiries from multiple sources (email, phone, e-fax, HCPs, physicians, patients). Includes admin console, content management, user management, and response modules.

**Location:** `/mims` | **Port:** 3000 (backend) / 5173 (frontend)

### CP Portal — Collaboration Portal
A fully configurable, multi-tenant web portal for pharma companies. Patients and HCPs can view therapeutic area content, submit medical inquiries, report adverse events, access resources, find MSLs, and more. Features a per-client user-type gate, feature access matrix, AI chatbox, and full branding control.

**Location:** `/cp-portal` | **Port:** 4000 (backend) / 5174 (frontend)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite 5, React Router v6 |
| Backend | Node.js 20, Express |
| Database | SQLite (via better-sqlite3) |
| Auth | JWT (dual — admin + portal) |
| CI/CD | GitHub Actions |

---

## Getting Started

### Run CP Portal

```bash
# Backend (Terminal 1)
cd cp-portal/backend
npm install
node server.js

# Frontend (Terminal 2)
cd cp-portal/frontend
npm install
npm run dev
```

- Admin Console: http://localhost:5174/admin/login
- Public Portal: http://localhost:5174/portal/{clientCode}
- API Health: http://localhost:4000/api/health

### Run MIMS

```bash
# Backend (Terminal 1)
cd mims
npm install
node backend/server.js

# Frontend (Terminal 2)
cd mims/frontend
npm run dev
```

- App: http://localhost:5173
- Backend: http://localhost:3000

---

## Project Roadmap

| Phase | Module | Status |
|---|---|---|
| 1 | Project Setup + Auth + Dashboard | ✅ Done |
| 2 | User Management | ✅ Done |
| 3 | Email Inbox (IMAP) | ✅ Done |
| 4 | Admin Console | ✅ Done |
| 5 | Service Log + System Activity | ✅ Done |
| 6 | CP Portal — Admin Console | ✅ Done |
| 7 | CP Portal — Public Portal (10 pages) | ✅ Done |
| 8 | CP Portal — User Type Gate (P-04) | ✅ Done |
| 9 | Case Management Queues | 🔜 Next |
| 10 | Case Query + Fulfillment | 🔜 Planned |
| 11 | MIMS ↔ CP Integration | 🔜 Planned |

---

## Contributing

1. Create a branch from `main`
2. Make your changes
3. Open a Pull Request — the template will guide you
4. CI must pass before merge
5. Requires review from Code Owner before merge
