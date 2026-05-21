## Context

IssueFlow's audit log was originally implemented as a shared `AuditLogService` injected into every feature service. Each mutation method calls `auditLogService.record(...)` explicitly. This approach works but is fragile: any new service method or future module can silently skip audit logging. The solution is to push audit capture to the database layer via PostgreSQL triggers, so that **any** `INSERT`, `UPDATE`, or `DELETE` on a tracked table automatically appends a row to `audit_logs` — regardless of which code path caused it.

The existing `audit_logs` table, `AuditLog` TypeORM entity, `AuditLogService`, and `GET /audit-logs` endpoint remain in place. Only the *write path* changes.

## Goals / Non-Goals

**Goals:**
- PostgreSQL trigger function that fires `AFTER INSERT OR UPDATE OR DELETE` on all six entity tables and inserts into `audit_logs`.
- Bridge the JWT-authenticated user identity from the NestJS request context to the trigger via a PostgreSQL session variable (`issueflow.current_user_id`).
- `AuditInterceptor` global NestJS interceptor that sets the session variable on every request.
- Remove the ~30 scattered `auditLogService.record()` calls from feature services.
- Retain `auditLogService.record()` only for `actor = SYSTEM` events (auto-assign, auto-escalation) since the scheduler has no HTTP request context.

**Non-Goals:**
- Column-level diff capture (old vs new values per column).
- Audit log for `audit_logs` itself (would be circular).
- Changing `GET /audit-logs` response shape or filter params.
- Audit log for table DDL operations.

## Decisions

### 1. PostgreSQL session variable for actor identity

**Decision**: Use `SET LOCAL issueflow.current_user_id = '<userId>'` within each request's connection. The trigger function reads `current_setting('issueflow.current_user_id', true)` to populate `performedBy`.

**Why over alternatives**:
- *Application-layer parameter passing*: Would require passing a userId through every TypeORM `save()`/`delete()` call — not possible with TypeORM's standard API without wrapping every operation.
- *Postgres `session_user`*: Reflects the DB connection user, not the application user.
- *`SET LOCAL` vs `SET`*: `SET LOCAL` scopes the variable to the current transaction, which is safe for connection-pooled environments. `SET` (session-level) would bleed across pooled connections.

**Constraint**: The `AuditInterceptor` must acquire a raw TypeORM `QueryRunner`, run `SET LOCAL` on it, and release it before the handler executes. Because TypeORM's default entity manager uses a connection pool, the trigger runs on the same connection only if we operate within the same query runner. For HTTP handlers that use the default EntityManager (not an explicit QueryRunner), we use `DataSource.query('SET LOCAL ...')` at the start of the request — this sets the variable on the specific pooled connection for that call. Since `SET LOCAL` is transaction-scoped and NestJS handlers are typically not wrapped in a single transaction, we use `SET` (session-level) scoped to the connection check-out, then reset it in the interceptor's finally block.

**Revised approach**: Use `SET issueflow.current_user_id = '<userId>'` (session-level on the checked-out connection) and reset to `''` in the interceptor's `finally` block. This is safe because the connection returns to the pool only after the response is sent.

### 2. Trigger function reads `actor` from a second session variable

**Decision**: A second session variable `issueflow.current_actor` defaults to `'USER'`. The trigger inserts `current_setting('issueflow.current_actor', true)` into `actor`. For SYSTEM events the NestJS scheduler still calls `auditLogService.record()` directly — it does not use the trigger path for SYSTEM entries.

**Why**: Triggers cannot distinguish a scheduler-driven DB write from a user-driven one without explicit signaling. Keeping SYSTEM-actor entries in `AuditLogService.record()` preserves the existing SYSTEM audit path without complication.

### 3. Action mapping inside the trigger

**Decision**: The trigger maps `TG_OP` to action strings with special handling for soft-delete and restore:

```sql
IF TG_OP = 'INSERT' THEN
  v_action := 'CREATE';
ELSIF TG_OP = 'DELETE' THEN
  v_action := 'DELETE';
ELSIF TG_OP = 'UPDATE'
      AND NEW.deleted_at IS NOT NULL
      AND OLD.deleted_at IS NULL THEN
  v_action := 'DELETE';   -- soft-delete
ELSIF TG_OP = 'UPDATE'
      AND OLD.deleted_at IS NOT NULL
      AND NEW.deleted_at IS NULL THEN
  v_action := 'RESTORE';  -- restore
ELSE
  v_action := 'UPDATE';
END IF;
```

Only `tickets` and `projects` have a `deleted_at` column, so the `deleted_at` checks only apply to those two tables. All other tracked tables (`users`, `comments`, `attachments`, `ticket_dependencies`) always take the plain `UPDATE` branch.

`entityType` is a constant string literal per trigger (e.g., `'ticket'`, `'project'`), passed as a trigger argument so one function serves all tables.

**Why semantic mapping over raw `TG_OP`**: A consumer querying `action = 'DELETE'` expects to find soft-deleted records. Recording a soft-delete as `'UPDATE'` makes deletions invisible to audit queries. Mapping by intent keeps the audit log meaningful without any schema change.

**Why not a separate trigger function for soft-delete tables**: A single function with an `IF/ELSIF` block is simpler and keeps all action-mapping logic in one place. The `deleted_at` column check is safe on tables that don't have it — they simply never enter those branches.

### 4. TypeORM migration (not `synchronize: true`)

**Decision**: The trigger function and `CREATE TRIGGER` statements are delivered as a TypeORM migration class (`MigrationInterface`) with an `up()` that runs raw SQL and a `down()` that drops the triggers and function.

**Why**: `synchronize: true` cannot manage PL/pgSQL objects. A migration gives a versioned, reversible record of the triggers.

**Setup required**: Add `"migrations": ["dist/database/migrations/*.js"]` and `"migrationsRun": true` to the TypeORM `DataSource` config so migrations run automatically on app start.

### 5. AuditInterceptor as a global NestJS interceptor

**Decision**: Register `AuditInterceptor` as a global interceptor in `AppModule` providers with `APP_INTERCEPTOR`. It extracts `req.user.sub` (set by `JwtAuthGuard`) and calls `dataSource.query("SET issueflow.current_user_id = $1", [userId])`.

**Why global**: Every authenticated route benefits. Unauthenticated routes (only `POST /auth/login`) will have an empty `current_user_id` — the trigger then stores `''` or `null`, which is acceptable since login doesn't mutate tracked entities.

### 6. Failed mutations never produce audit entries (transactional guarantee)

**Decision**: Use `AFTER` triggers (not `BEFORE`), which run within the **same database transaction** as the mutation that fired them.

**Why this matters for soft-delete**: TypeORM soft-delete issues an `UPDATE` to set `deleted_at`. If that `UPDATE` fails (row not found, constraint violation, application error), the transaction is rolled back — and because the trigger's `INSERT INTO audit_logs` runs inside the same transaction, it is rolled back too. No spurious audit row is ever written.

**Contrast with old manual approach**: The previous `auditLogService.record()` calls were made *after* the mutation returned. If a later step in the same request threw an error (and TypeORM rolled back the entity save), the audit entry was already committed separately — a phantom log entry for an operation that never completed. The trigger approach eliminates this class of bug entirely: audit entries exist if and only if the mutation was committed.

**Implication**: All six triggers MUST be `AFTER ... FOR EACH ROW` triggers. `BEFORE` triggers fire before the row is written and cannot guarantee the write will succeed.

### 7. Removing manual `record()` calls

**Decision**: Delete `auditLogService.record()` calls for all `actor = USER` events from: `TicketsService`, `ProjectsService`, `UsersService`, `CommentsService`, `AttachmentsService`, `DependenciesService`. The `AuditLogModule` import is removed from those feature modules' `imports` arrays only if no SYSTEM calls remain.

**Why safe**: The trigger covers 100% of DB mutations. Duplicate entries (trigger + manual call) would inflate the audit log.

## Risks / Trade-offs

- **`SET` vs `SET LOCAL` in pooled connections** → Using session-level `SET` with an explicit reset in `finally` is safe as long as no uncaught exception skips the `finally` block. NestJS interceptors' `finally` always runs, so this is acceptable. If the app crashes without cleanup, the next request on that connection will inherit the stale value — mitigated by resetting to `''` which the trigger treats as `performedBy = null`.
- **TypeORM `save()` batching** → TypeORM sometimes batches multiple entities in one `save()` call. Each row change fires its own trigger independently, so no entries are missed.
- **SYSTEM actor entries could also fire triggers** → When `AuditLogService.record()` inserts a row into `audit_logs`, the trigger on `audit_logs` would also fire — except we deliberately do NOT attach a trigger to `audit_logs` itself (to avoid recursion and doubled entries).
- **Migration order dependency** → The trigger migration must run after all entity tables exist. Since `synchronize: true` runs before migrations in some configurations, verify table creation order in integration tests.
- **Unit test isolation** → Unit tests that mock the TypeORM `DataSource` will not exercise the trigger. E2E tests against the real DB are the authoritative test for trigger behavior. Existing E2E tests for audit entries remain valid.

## Migration Plan

1. Add `DataSource` migration config in `src/database/data-source.ts`.
2. Create `src/database/migrations/<timestamp>-AuditTriggers.ts` with `up()` SQL for trigger function + per-table `CREATE TRIGGER` statements, and `down()` SQL to drop them.
3. Create `src/audit-log/audit.interceptor.ts`.
4. Register interceptor globally in `AppModule`.
5. Remove manual `auditLogService.record()` USER-actor calls from all six service files.
6. Run `npm run migration:run` (or rely on `migrationsRun: true`) — triggers are created.
7. Rollback: run `npm run migration:revert` — `down()` drops all triggers and the function; manual record calls can be restored from git.

## Open Questions

- None. TypeORM's `DataSource` API and `SET` session variables are well-understood; no unknowns remain.
