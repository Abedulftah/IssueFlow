## Why

IssueFlow needs a tamper-evident, append-only audit trail so operators and admins can track who did what and when across all domain entities. Without it, there is no accountability for state changes (ticket updates, user actions, system escalations) and no way to satisfy compliance or debugging requirements.

## What Changes

- Introduce a new `AuditLog` entity and `AuditLogModule` that records every state-changing action.
- Every create, update, delete, restore, and system-triggered action (auto-assign, escalation) across all modules emits an audit log entry.
- Expose a queryable `GET /audit-logs` endpoint filtered by `entityType`, `entityId`, `action`, and `actor`.
- The audit log is append-only — no update or delete endpoints are exposed.

## Capabilities

### New Capabilities
- `audit-log-core`: Append-only AuditLog entity, TypeORM repository, and `AuditLogService.record()` method used by all modules.
- `audit-log-query`: `GET /audit-logs` endpoint with query filters (`entityType`, `entityId`, `action`, `actor`) returning paginated results.

### Modified Capabilities
<!-- No existing spec-level behavior changes — audit recording is additive and does not alter existing endpoints' contracts. -->

## Impact

- **New module**: `src/audit-log/` (entity, service, controller, module).
- **All existing modules** (Users, Projects, Tickets, Comments, Attachments, Dependencies) must inject `AuditLogService` and call `record()` on every state-changing operation.
- **SchedulerModule** must emit audit entries for auto-escalation events (actor = SYSTEM).
- **TicketsModule** must emit AUTO_ASSIGN audit entry on ticket creation when auto-assignment fires (actor = SYSTEM).
- No breaking changes to existing API contracts.
- New dependency: none (pure TypeORM + NestJS).
