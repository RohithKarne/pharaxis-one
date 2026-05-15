# Operational Qualification Protocol

1. Create an AE case and create an ICSR from it.
2. Edit ICSR sections, generate XML, validate, lock, submit to mock gateway, and verify audit entries.
3. Configure AI provider in admin, run classify/extract/summarize/similar/quality check, accept and reject suggestions.
4. Build workflow definition with start, condition, action, and end nodes; simulate; publish.
5. Create API client, request token, call `/api/v1/cases`, create webhook subscription, and inspect API call log.
6. Run inspector export and verify hash manifest is included.
