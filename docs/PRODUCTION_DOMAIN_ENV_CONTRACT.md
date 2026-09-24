# Production Domain and Environment Contract

Effective date: 2026-04-30
Owner: Engineering
Purpose: remove raw-IP production coupling and standardize deploy-time environment values.

## Current Hosting Status

Pharaxis apps are local-only as of 2026-05-27. The previous AWS/EC2 host has been deleted. This contract is retained for the next approved hosting target and must not be treated as an active deployment instruction today.

## Rule

Production frontend builds must use same-origin path contracts or domain-based env injection.

Do not commit raw EC2 IP API targets as long-term production config.

## Current Contract

Frontend production envs should resolve like this:

| App | Frontend base | API base |
| --- | --- | --- |
| CP Portal | `/cp-portal/` | `/cp-portal/api` |
| MIMS | `/mims/` | `/mims/api` |

## Future Nginx Contract

When remote hosting is restored, Nginx or the selected edge proxy must serve:

- static app shell from `/var/www/pharaxis/<app>/`
- backend reverse proxy for `/<app>/api/*`

Examples:

- `/cp-portal/api/health` -> `http://127.0.0.1:4000/api/health`
- `/mims/api/health` -> `http://127.0.0.1:3000/api/health`

Repo delivery artifacts:

- The nginx template and the TLS bootstrap script **were removed on 2026-09-24**
  along with the rest of the server plumbing (`TEAM_OPERATING_SOP.md` §38.12).
  They are recoverable from git history if a similar host is ever used again.

## Domain Target

Preferred next-state:

- `cp-portal.<prod-domain>`
- `mims.<prod-domain>`

Fallback acceptable for one-host rollout:

- `https://<prod-domain>/cp-portal/`
- `https://<prod-domain>/mims/`

## Secrets and Env Injection

Required:

- backend secrets stay in server env files or secret manager
- frontend production env values stay path-based when same-origin routing exists
- TLS termination handled before user traffic

Not allowed:

- hardcoded raw IPs in committed frontend production envs
- `CORS_ALLOW_ALL=true` in production
- placeholder secrets in deployed env files

## Release Check

Before production deploy after hosting is restored:

- [ ] DNS points to active load balancer or server
- [ ] TLS certificate valid
- [ ] Nginx path routing matches table above
- [ ] frontend production envs use same-origin paths
- [ ] backend CORS allowlists match production domains
- [ ] TLS/bootstrap script executed on the approved host
