# Operations Ticketing & Request Management

Fully isolated module for supervisor → admin operational requests.

## Quick links

- [Database schema](./SCHEMA.md)
- [API design](./API.md)
- [Migration plan](./MIGRATION.md)
- [Security review](./SECURITY.md)
- [Scalability review](./SCALABILITY.md)
- [Disaster recovery](./DISASTER_RECOVERY.md)
- [Production deployment](./DEPLOYMENT.md)

## UI routes

| Route | Audience |
|-------|----------|
| `/ticketing/my` | Supervisor — own requests |
| `/ticketing/new` | Supervisor — create request |
| `/ticketing/admin` | Admin — queue + filters |
| `/ticketing/admin/metrics` | Admin — SLA metrics |
| `/ticketing/[id]` | Detail + comments + attachments |

## Isolation

This module does **not** import or modify:

- `lib/strategicOps/*`
- Talabat metrics / performance sync
- Google Sheets analytics pipelines
- DIL / normalization engines
