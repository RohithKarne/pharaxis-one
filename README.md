# MIMS-CP Portal

A two-application product suite for the pharmaceutical / medical information domain.

## Applications

### MIMS — Medical Information Management System
A cloud-based case-processing platform for handling medical inquiries from multiple sources (email, phone, e-fax, HCPs, physicians, patients). Includes admin console, content management, user management, and response modules.

**Location:** `/mims`

### CP Portal — Collaboration Portal
An embeddable web portal for pharma companies. Patients and customers can view product pipelines, submit medical inquiries, report adverse events, submit product complaints, access document content, and more.

**Location:** `/cp-portal` *(coming soon)*

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML, CSS, JavaScript |
| Backend | Node.js, Express |
| Database | SQLite (via better-sqlite3) |

---

## Getting Started

### Run MIMS locally

```bash
cd mims
npm install
node backend/server.js
```

Open your browser at: `http://localhost:3000`

---

## Project Roadmap

| Phase | Module | Status |
|---|---|---|
| 1 | Project Setup + Auth + Dashboard | ✅ In Progress |
| 2 | User Management | 🔜 Next |
| 3 | Inquiry Intake | 🔜 Planned |
| 4 | Case Queue | 🔜 Planned |
| 5 | Response Module | 🔜 Planned |
| 6 | Content Management | 🔜 Planned |
| 7 | Admin Console | 🔜 Planned |
| 8 | CP Portal | 🔜 Planned |
| 9 | MIMS ↔ CP Integration | 🔜 Planned |
