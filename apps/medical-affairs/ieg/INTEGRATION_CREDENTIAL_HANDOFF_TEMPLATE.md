# IEG Production Integration Credential Handoff

Date: ____________________
Prepared by: ____________________
Environment: DEV / UAT / PROD (circle one)

## 1) Veeva Vault

- `VEEVA_INTEGRATION_ENABLED`: `true`
- `VEEVA_BASE_URL`: ____________________
- `VEEVA_SYNC_PATH` (default `/api/v1/ieg/sync`): ____________________

Auth option A (preferred):
- `VEEVA_TOKEN_URL`: ____________________
- `VEEVA_CLIENT_ID`: ____________________
- `VEEVA_CLIENT_SECRET`: ____________________
- `VEEVA_SCOPE` (optional): ____________________

Auth option B (static token):
- `VEEVA_ACCESS_TOKEN`: ____________________

## 2) SharePoint / Microsoft Graph

- `SHAREPOINT_INTEGRATION_ENABLED`: `true`
- `MS_TENANT_ID`: ____________________
- `MS_CLIENT_ID`: ____________________
- `MS_CLIENT_SECRET`: ____________________
- `MS_SCOPE` (default `https://graph.microsoft.com/.default`): ____________________
- `MS_GRAPH_BASE_URL` (default `https://graph.microsoft.com/v1.0`): ____________________
- `SHAREPOINT_SITE_ID`: ____________________
- `SHAREPOINT_DRIVE_ID`: ____________________
- `SHAREPOINT_FOLDER_PATH` (default `IEG-Sync`): ____________________

## 3) ClinicalTrials.gov

- `CTG_LIVE_FETCH_ENABLED`: `true`
- `CTG_API_BASE_URL` (default `https://clinicaltrials.gov/api/v2/studies`): ____________________

## 4) OpenAI (LLM)

- `LLM_LIVE_ENABLED`: `true`
- `LLM_REQUIRE_LIVE`: `true` (recommended for production)
- `OPENAI_API_KEY`: ____________________
- `OPENAI_MODEL` (default `gpt-4.1-mini`): ____________________
- `OPENAI_BASE_URL` (default `https://api.openai.com/v1`): ____________________

## 5) ERP Export Delivery

- `ERP_EXPORT_DELIVERY_ENABLED`: `true`
- `ERP_EXPORT_ENDPOINT_URL`: ____________________
- `ERP_EXPORT_AUTH_TOKEN` (if required): ____________________
- `ERP_EXPORT_ALLOW_HTTP`: `false` (recommended)

## 6) Networking / Security Confirmation

- Outbound access from IEG backend to all above endpoints: Yes / No
- TLS certificates valid and trusted: Yes / No
- IP allowlist configured (if needed): Yes / No
- Secrets loaded via secure manager (not plain text): Yes / No

## 7) Verification Contacts

- Integration technical owner: ____________________
- Security approver: ____________________
- Business signoff owner: ____________________
