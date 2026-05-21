## Context

IssueFlow tickets currently have no due-date concept. Operations teams have no automated signal when work drifts past its deadline. This design adds `dueDate` and `isOverdue` to the `Ticket` entity and a scheduled background job (via `@nestjs/schedule`) that promotes `priority` for overdue, non-DONE tickets.

Current state: `SchedulerModule` already exists (stubbed) to host a background job; the `Ticket` entity has `priority` (enum) but no temporal fields.

## Goals / Non-Goals

**Goals:**
- Add optional `dueDate` (ISO-8601) field to ticket creation and update APIs.
- Add `isOverdue` (boolean, default `false`) field returned in all ticket GET responses.
- Implement a `@Cron`-driven job that escalates overdue ticket priority one level per run.
- Record each escalation in the AuditLog (`actor = SYSTEM`, `action = ESCALATE`).
- Allow integration tests to trigger the job synchronously via a public service method.
- Reset `isOverdue` when a user manually sets `priority` via `PATCH /tickets/:id`.

**Non-Goals:**
- Real-time notifications or webhooks on escalation.
- Configuring different escalation intervals per project.
- Escalating ticket `status` (only `priority` and `isOverdue` change).
- Changing the escalation interval at runtime (env var only).

## Decisions

### 1. Scheduler invocation: `@Cron` with env-configurable expression

**Decision:** Use `@nestjs/schedule` `@Cron(process.env.ESCALATION_CRON ?? '*/5 * * * *')` on the service method. The cron expression is read at module load time.

**Rationale:** Matches the `testing-trigger` constraint: "manual trigger testing hooks must be implemented cleanly within the E2E test suite rather than introducing auxiliary testing routes." We expose `SchedulerService.runEscalation()` as a regular public `async` method. E2E tests import `SchedulerService` from the app module and call it directly — no HTTP endpoint needed.

**Alternative considered:** A hidden `POST /admin/run-escalation` endpoint. Rejected: violates the `strict-contract` constraint (not in README API table) and creates a security surface.

### 2. Escalation query: bulk TypeORM update vs. entity-by-entity

**Decision:** Fetch all overdue, non-DONE tickets with `dueDate IS NOT NULL AND dueDate < NOW()` that are not yet CRITICAL, iterate, promote priority, save each individually, and emit an AuditLog entry per ticket.

**Rationale:** Individual saves are necessary to emit one AuditLog record per ticket and to handle `@VersionColumn` optimistic locking correctly. A single bulk `UPDATE` cannot write per-row audit entries atomically.

**Alternative considered:** Raw SQL bulk update. Rejected: bypasses TypeORM lifecycle hooks and version column increment.

### 3. `isOverdue` flag lifecycle

- Set to `true` when a ticket is already `CRITICAL` at escalation time and `dueDate < NOW()`.
- Cleared to `false` when a user sends a `PATCH /tickets/:id` body containing a `priority` field (regardless of value).
- Never set by the escalation logic for sub-CRITICAL tickets (they still get promoted, but `isOverdue` stays `false` until they reach CRITICAL and remain overdue on the next run).

**Rationale:** Mirrors the spec exactly; keeps escalation logic simple and deterministic.

### 4. Integration test strategy

Each E2E spec:
1. Seeds DB via `TypeORM` `DataSource` directly (creates users, project, tickets with specific `dueDate` values in the past).
2. Calls `schedulerService.runEscalation()` synchronously.
3. Asserts HTTP GET response fields (`priority`, `isOverdue`) and AuditLog entries via `GET /audit-logs`.

Tests are grouped per scenario: normal escalation, already-CRITICAL idempotency, no-dueDate skip, DONE-ticket skip, manual-reset clears flag.

### 5. `dueDate` validation

`dueDate` is an optional ISO-8601 string in DTOs validated with `@IsDateString()` from `class-validator`. Stored as `timestamp with time zone` in PostgreSQL via TypeORM `@Column({ type: 'timestamptz', nullable: true })`.

## Risks / Trade-offs

[Clock drift between Node.js and Postgres] → Mitigation: Compare `dueDate` against `new Date()` inside the service; use the application server clock consistently.

[Concurrent escalation runs] → Mitigation: Cron interval is typically 1 hour; job is single-instance. If multi-instance deployment is needed later, a Postgres advisory lock can be added.

[Large ticket volume] → Mitigation: Query is indexed on `dueDate` and `status`; batch size can be added later if needed.

[Version column conflict during escalation] → Mitigation: Wrap each ticket save in a try/catch; log and skip conflicted rows; they will be retried on the next cron cycle.

## Migration Plan

1. Deploy with `synchronize: true` — TypeORM adds `dueDate` (nullable) and `isOverdue` (default `false`) columns automatically.
2. Existing tickets get `dueDate = NULL` and `isOverdue = false`; escalation skips them (dueDate IS NULL guard).
3. No data backfill required.
4. Rollback: remove columns via migration or revert deployment (columns are nullable, safe to drop).

## Open Questions

- Resolved: default cron is `*/5 * * * *` (every 5 min). Tests override by calling the method directly.
