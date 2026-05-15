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
      summary: Create a case
  /cases/{id}:
    put:
      summary: Update a case
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
