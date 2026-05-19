# Monitoring And Backup Baseline

Effective date: 2026-05-19  
Owner: Engineering + Operations

## Purpose

Define the minimum production monitoring, alerting, backup, and restore posture for each product in Pharaxis-One.

## Shared Minimum Monitoring

Every product must have:

- health endpoint verification
- PM2 process restart visibility
- deploy success or failure visibility
- structured error log collection
- smoke check evidence after deploy
- DB backup success or failure visibility

## Product Baseline

| Product | Health endpoint | Minimum smoke after deploy | Backup type | High-priority alerts |
| --- | --- | --- | --- | --- |
| `mims` | `/mims/api/health` | frontend shell, health, protected barrier, admin/login critical path | MySQL dump + restore proof | PM2 crash, DB unreachable, repeated 5xx, worker failures |
| `qms` | `/qms/api/health` | health, auth orgs, protected route, frontend login | PostgreSQL dump + restore proof | PM2 crash, DB unreachable, auth failure spike, RBAC smoke failure |
| `vault` | `/vault/api/health` | frontend shell, health, protected barrier | MySQL dump + restore proof | PM2 crash, DB unreachable, storage or SMTP failures |
| `cp-portal` | `/cp-portal/api/health` | frontend shell, health, protected barrier, admin/public route check | MySQL dump + restore proof | PM2 crash, DB unreachable, portal auth/admin failures |
| `ai-agent` | `/ai-agent/api/v1/agent/health` | frontend shell, health, protected barrier, provider/admin path check | MySQL dump + restore proof | PM2 crash, DB unreachable, provider key/config failures, 429/5xx spikes |

## Backup Standard

| Requirement | Standard |
| --- | --- |
| Frequency | Daily minimum full DB backup per product |
| Retention | 7 daily, 4 weekly, 3 monthly minimum |
| Storage | Off-host, not only on app server |
| Predeploy | Backup before any destructive migration |
| Restore proof | Required before calling the product production-ready |

## Evidence To Record

For each product:

- latest successful backup timestamp
- backup artifact or job id
- latest restore drill timestamp
- restore duration
- smoke result against restored target
- owner

## Alert Ownership Table

| Product | Primary alert owner |
| --- | --- |
| `mims` | MIMS owner |
| `qms` | QMS owner |
| `vault` | Vault owner |
| `cp-portal` | CP Portal owner |
| `ai-agent` | AI-Agent owner |

## Current Gap

This repo now contains the workflow split and release split, but live monitoring and scheduled backup jobs still depend on infrastructure setup outside git.
