## Context

IssueFlow currently has no audit trail. The CLAUDE.md spec requires every state-changing action across all domain entities (tickets, projects, users, comments, attachments, dependencies) to be recorded with: `action`, `entityType`, `entityId`, `performedBy` (userId or "SYSTEM"), `actor` (`USER | SYSTEM`), and `timestamp`. The scheduler (auto-escalation) and ticket-creation auto-assignment also require SYSTEM-actor entries.

The audit log must be append-only — no update or delete operations — and queryable via a REST endpoint filtering by `entityType`, `entityId`, `action`, and `actor`.

## Goals / Non-Goals

**Goals:**
- Single `AuditLog` TypeORM entity stored in PostgreSQL.
- Shared `AuditLogService` injected into every module that mutates state.
- `GET /audit-logs` endpoint with filter query params, protected by JWT AuthGuard.
- SYSTEM-actor entries for auto-assign and auto-escalation.
- No data loss — every state change emits exactly one log entry.

**Non-Goals:**
- Real-time streaming or webhooks for audit events.
- Retention policies or archiving of old log entries.
- Role-based access control on which audit entries a user can see (all authenticated users can query).
- Audit log pagination with cursor-based pagination (offset/limit is sufficient).

## Decisions

### 1. Shared service, direct injection (not event emitter)

**Decision**: Each service (TicketsService, UsersService, etc.) directly calls `auditLogService.record(...)` after a successful mutation.

**Why over EventEmitter**: An event-based approach decouples the caller but makes it hard to guarantee log entries are written in the same transaction as the mutation. Direct injection is explicit, testable with standard NestJS mocks, and avoids async event-loss bugs.

**Alternative considered**: `@nestjs/event-emitter` — rejected because fire-and-forget semantics risk dropping entries if the listener fails.

### 2. Separate `AuditLog` table (not a JSON column on each entity)

**Decision**: Dedicated `audit_logs` table with columns: `id`, `action`, `entityType`, `entityId`, `performedBy`, `actor`, `timestamp`.

**Why**: Uniform queryability across all entity types. A JSON column on each entity would require per-table queries and cannot be filtered cross-entity.

**Alternative considered**: EAV or JSONB on a `metadata` column per entity — rejected for query complexity.

### 3. `AuditLogModule` is global

**Decision**: `AuditLogModule` is declared with `@Global()` so it doesn't need to be imported into every feature module explicitly — only `AuditLogService` needs to be injected.

**Why**: Avoids repetitive `imports: [AuditLogModule]` in every module. The audit log is a cross-cutting concern similar to logging infrastructure.

### 4. `actor` enum: `USER | SYSTEM`

**Decision**: Two-value enum. `performedBy` carries the userId string or the literal `"SYSTEM"`.

**Why**: Keeps the schema simple. A foreign key to `users` would prevent SYSTEM entries without a sentinel user row.

### 5. No soft-delete on AuditLog

**Decision**: `AuditLog` has no `deletedAt` column and no delete endpoint.

**Why**: Audit logs are compliance artifacts. Soft-delete would give false assurance of immutability.

## Risks / Trade-offs

- **High write volume** → audit table grows fast under heavy use. Mitigation: add a PostgreSQL index on `(entityType, entityId)` and `(actor, action)` at entity level.
- **Transactional coupling** → if a service calls `record()` outside a DB transaction and the main mutation fails mid-way, the audit entry could be orphaned. Mitigation: always call `record()` after the mutation completes successfully (not inside the mutation transaction), which is acceptable given the spec's "append-only" requirement means approximate consistency is fine.
- **Circular dependency risk** → if `AuditLogModule` ever imports another feature module, circular DI appears. Mitigation: `AuditLogModule` must never import domain modules.

## Migration Plan

1. `AuditLogModule` is created first as a standalone module with `synchronize: true` — TypeORM auto-creates the `audit_logs` table on next start.
2. Each feature module is updated incrementally to inject `AuditLogService` and add `record()` calls.
3. No data migration needed (audit log starts empty).
4. Rollback: remove module and injections; TypeORM does not drop the table automatically (safe).

## Open Questions

- None outstanding — `GET /audit-logs` is available to all authenticated users; no field-level diff column is needed.
