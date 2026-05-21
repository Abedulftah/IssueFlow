## Why

Every service that mutates state currently calls `auditLogService.record(...)` manually, scattering audit concerns across every module and making it easy to miss a mutation (e.g., a future service method that forgets the call). Moving audit capture to PostgreSQL triggers makes the log truly automatic — **every INSERT/UPDATE/DELETE on tracked tables is captured at the database layer, unconditionally, even for out-of-band changes.**

## What Changes

- Add a PostgreSQL `audit_log_trigger` function and per-table `AFTER INSERT OR UPDATE OR DELETE` triggers via a TypeORM migration.
- The trigger writes directly into the existing `audit_logs` table, populating `action` (`CREATE`/`UPDATE`/`DELETE`), `entityType`, `entityId`, `timestamp`, and the `performedBy`/`actor` values passed via a PostgreSQL session variable (`SET LOCAL issueflow.current_user_id = '...'`).
- Remove all manual `auditLogService.record(...)` calls from: `TicketsService`, `ProjectsService`, `UsersService`, `CommentsService`, `AttachmentsService`, `DependenciesService`.
- **Keep** `auditLogService.record(...)` only for `actor = SYSTEM` events (auto-assign, auto-escalation) that originate from the NestJS scheduler — triggers cannot know these are SYSTEM actions without extra convention.
- Add an `AuditInterceptor` (NestJS `NestInterceptor`) that sets the PostgreSQL session variable before each request's DB operations so triggers can capture the acting user.
- `AuditLogModule`, `AuditLogService`, and `GET /audit-logs` endpoint remain unchanged.

## Capabilities

### New Capabilities

- `pg-audit-trigger`: PostgreSQL trigger function + migration that automatically writes audit rows for every tracked entity table, using a session variable to identify the acting user.
- `audit-interceptor`: NestJS interceptor that injects `SET LOCAL issueflow.current_user_id` into the active TypeORM query runner before each request, bridging the JWT identity to the DB session.

### Modified Capabilities

- None — `GET /audit-logs` contract and `AuditLog` entity are unchanged. The reduction in manual `record()` calls is an implementation detail, not a spec-level behavior change.

## Impact

- **New migration file**: `src/database/migrations/<timestamp>-AuditTriggers.ts` — creates the PL/pgSQL trigger function and attaches triggers to `tickets`, `projects`, `users`, `comments`, `attachments`, `ticket_dependencies`.
- **Removed code**: `auditLogService.record()` calls in six service files.
- **New file**: `src/audit-log/audit.interceptor.ts` + registration in `AppModule` as a global interceptor.
- **No API contract change**: all endpoints, response shapes, and status codes remain identical.
- **Dependencies**: no new npm packages; uses `typeorm`'s `QueryRunner` API already present.
