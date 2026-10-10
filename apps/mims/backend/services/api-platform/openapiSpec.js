'use strict';

function buildOpenApiYaml() {
  return `openapi: 3.1.0
info:
  title: MIMS Public API
  version: 1.0.0
  description: Versioned integration APIs for cases, content, transmissions, picklists, webhooks, and GraphQL.
servers:
  - url: /api/v1
security:
  - bearerAuth: []
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
paths:
  /oauth/token:
    post:
      summary: Issue OAuth2 client credentials token
  /cases:
    get:
      summary: List cases
    post:
      summary: Create a case (?dry_run=1 checks the report and keeps nothing; source_link and reporter_can_reply say where it came from and whether the reporter can answer questions there)
  /cases/bridge:
    get:
      summary: The bridge version and features this MIMS supports
  /cases/{id}/redact-reporter:
    post:
      summary: Remove the reporter's identity from a case, keeping the case (GDPR erasure)
  /cases/changes:
    get:
      summary: Cases this connection sent that changed since a checkpoint (status, closed, owner, when first taken on, sent answer, reporter erased, serious and report due date, questions for the reporter)
  /cases/claim:
    post:
      summary: Record this connection as the sender of cases it created before senders were recorded
  /cases/reconcile:
    post:
      summary: Compare the sender's list of report keys and fingerprints with the cases this connection created; returns the missing and the different
  /cases/{id}/follow-ups:
    post:
      summary: Add information the reporter sent after the case was created, as a case comment (idempotent on followup_id; question_id marks it as the answer to that question)
  /picklists:
    get:
      summary: List picklist values
  /products:
    get:
      summary: List product dictionary records
  /contacts:
    get:
      summary: List contacts
  /users:
    get:
      summary: List users with admin scope
  /organisations:
    get:
      summary: List organisations with admin scope
  /transmissions:
    get:
      summary: List transmission audit entries
  /content/documents:
    get:
      summary: List approved content documents
  /webhook-subscriptions:
    get:
      summary: List webhook subscriptions
    post:
      summary: Create webhook subscription
  /graphql:
    post:
      summary: Execute GraphQL query
  /sdk/{language}:
    get:
      summary: Download SDK starter snippet
`;
}

module.exports = { buildOpenApiYaml };
