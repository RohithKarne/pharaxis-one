# Production Execution Log - 2026-04-30

Owner: Varun
Purpose: record live execution evidence for deploy reachability, server routing, and restore proof.

## Scope

This run covered three production-hardening actions:

1. external reachability probe for currently known public host
2. concrete nginx plus TLS delivery artifacts
3. first restore drill with application proof

## External Reachability Probe

Public host tested: `13.205.213.128`

Result: failed from this environment on both HTTP and HTTPS health endpoints.

Observed symptom:

- `curl` to raw-IP health endpoints timed out before headers returned
- no successful HTTP status observed on any app path

Impact:

- current public ingress is not provably serving app traffic
- production announcement should stay blocked until DNS/TLS/ingress is fixed and smoke passes

## Domain and TLS Delivery Artifacts

Artifacts created:

- `ops/nginx/pharaxis-one.conf.template`
- `ops/scripts/bootstrap-nginx-tls.sh`

Contract enforced by template:

- one production host serves app shells by path
- backend APIs reverse proxy to PM2 localhost ports
- HTTP redirects to HTTPS
- Certbot-managed TLS is expected

## Restore Drill Evidence

Database: `qms_dev`
Backup artifact: `/tmp/qms_restore_drill_20260430.dump`
Restore target: `qms_restore_drill_20260430`
Date: 2026-04-30

Commands executed:

```bash
pg_dump -h 127.0.0.1 -p 5432 -U qms_app -d qms_dev -Fc -f /tmp/qms_restore_drill_20260430.dump
createdb -h 127.0.0.1 -p 5432 -U rohithkarne -O qms_app qms_restore_drill_20260430
pg_restore -h 127.0.0.1 -p 5432 -U rohithkarne -d qms_restore_drill_20260430 /tmp/qms_restore_drill_20260430.dump
```

Verification:

- restored public table count: `93`
- temporary QMS backend booted against restored DB on port `4155`
- `GET /api/health` returned `ok=true`
- `GET /api/auth/orgs` returned organization payload

Runtime proof sample:

```json
{"ok":true,"app":"qms"}
{"orgs":[{"orgCode":"Nov","orgName":"Novartis"},{"orgCode":"PHA_DEV","orgName":"Pharaxis Development"}]}
```

## Gate Status

- deploy smoke path exists in workflow: `READY`
- public ingress proof: `BLOCKED`
- domain/TLS execution artifacts: `READY`
- first restore drill with app proof: `PASS`
