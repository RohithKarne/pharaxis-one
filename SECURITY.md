# Security Policy

## Supported Scope

Security reports are accepted for all actively maintained services in this repository:

- `apps/medical-affairs/mims`
- `apps/medical-affairs/cp-portal`
- `apps/ai-agent`
- `apps/vault`

## How To Report a Vulnerability

Please do not open public GitHub issues for security findings.

Send responsible disclosure details to the project owner with:

- affected component/path
- issue summary and severity
- reproduction steps or proof-of-concept
- suggested remediation (if available)

## Handling Expectations

- Acknowledgement target: within 3 business days
- Initial triage target: within 7 business days
- Remediation timeline: based on severity and impact

## Security Best Practices for Contributors

- Never commit `.env` files, credentials, private keys, or DB dumps.
- Use `.env.example` for configuration templates.
- Keep dependencies up to date and review Dependabot PRs promptly.
- Apply least-privilege access for database and service credentials.
