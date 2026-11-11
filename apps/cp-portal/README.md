# CP Portal

The white-label medical-information portal in Pharaxis One: an admin panel for each pharma client and the portal its doctors and patients use.

- What it does and for whom: [docs/PRD.md › CP Portal](../../docs/PRD.md#cp-portal)
- Stack, how to run it, the virus scanner, settings: [docs/ARCHITECTURE_AND_SYSTEM_DESIGN.md › B4. CP Portal design](../../docs/ARCHITECTURE_AND_SYSTEM_DESIGN.md#b4-cp-portal-design) and [› Run it locally](../../docs/ARCHITECTURE_AND_SYSTEM_DESIGN.md#run-it-locally)
- Rules: [docs/RULES.md](../../docs/RULES.md)

Quick start (the virus scanner, ClamAV, must be installed first — see ARCHITECTURE_AND_SYSTEM_DESIGN.md › B6. Running it):

```bash
cd apps/cp-portal/backend && npm install && npm run dev
cd apps/cp-portal/frontend && npm install && npm run dev
```
