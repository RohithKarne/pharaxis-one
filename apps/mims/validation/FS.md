# MIMS Functional Specification

## FS-01 Pharmacovigilance ICSR Lifecycle
Implements `icsr_reports` and child tables, admin ICSR routes, lifecycle transition rules, XML preview, validation, mock/live gateway adapter selection, and audit entries.

## FS-02 E2B(R3) XML Generation
Implements `services/pv/e2bGenerator.js` and `services/pv/e2bValidator.js`; official XSD paths remain environment-configured.

## FS-03 AI Case Assistant
Implements provider abstraction, PHI-safe fallback, deterministic local provider, suggestion persistence, usage reporting, and case AI endpoints.

## FS-04 Configurable Workflow Engine
Implements graph definition storage, graph validation, condition evaluator, simulation trace, immutable published definitions, workflow instances, execution timelines, and SLA timer evidence.

## FS-05 Public Integration Platform
Implements API clients, OAuth token issuing, bearer validation, scope guard, per-client rate limiter, public REST routes, GraphQL stub, webhook subscriptions, webhook delivery history, and OpenAPI YAML.

## FS-06 Compliance Evidence Package
Implements audit verification, auto-capture middleware, traceability builder, validation docs, compliance docs, release pipeline, data region column, region router, e-sign manifest service, and inspector export payload.
