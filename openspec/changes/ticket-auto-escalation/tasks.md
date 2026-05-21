## 1. Database Entity & Schema

- [x] 1.1 Add `dueDate` column (`timestamptz`, nullable) to `Ticket` entity
- [x] 1.2 Add `isOverdue` column (`boolean`, default `false`, not-null) to `Ticket` entity
- [x] 1.3 Add `ESCALATE` constant to AuditLog action enum/constants

## 2. Data Transfer Objects

- [x] 2.1 Add optional `@IsDateString() dueDate?: string` to `CreateTicketDto`
- [x] 2.2 Add optional `@IsDateString() dueDate?: string` to `UpdateTicketDto`
- [x] 2.3 Ensure `dueDate` and `isOverdue` are included in the ticket serialisation/response shape

## 3. Core Service Logic

- [x] 3.1 In `TicketsService.create`, map `dueDate` from DTO to entity (default `null`)
- [x] 3.2 In `TicketsService.update`, map `dueDate` from DTO if provided; when `priority` is present in the update body, set `isOverdue = false` before saving
- [x] 3.3 Add `TicketsService.findOverdueForEscalation(): Promise<Ticket[]>` — queries tickets where `dueDate IS NOT NULL`, `dueDate < NOW()`, and `status != DONE`

## 4. Scheduler Service

- [x] 4.1 In `SchedulerService` (or create it), implement `async runEscalation(): Promise<void>` — iterates overdue tickets, promotes priority one level, sets `isOverdue = true` for CRITICAL tickets, saves each, emits AuditLog entry per ticket
- [x] 4.2 Decorate `runEscalation` with `@Cron(process.env.ESCALATION_CRON ?? '*/5 * * * *')` so it runs automatically
- [x] 4.3 Guard escalation: skip any ticket already at CRITICAL from promotion (only set `isOverdue` if not already true)
- [x] 4.4 Wrap each ticket save in try/catch — log and continue on optimistic-lock conflict

## 5. Module Wiring

- [x] 5.1 Import `ScheduleModule.forRoot()` in `AppModule` (if not already present)
- [x] 5.2 Ensure `SchedulerModule` imports `TicketsModule` (for repository/service access) and `AuditLogModule`
- [x] 5.3 Export `SchedulerService` from `SchedulerModule` so E2E tests can retrieve it via `app.get(SchedulerService)`

## 6. Integration Tests (E2E)

- [x] 6.1 Create `test/ticket-escalation.e2e-spec.ts` and wire up the test app with DB seeding helpers (create user, project, ticket via service or repository)
- [x] 6.2 **Test: LOW→MEDIUM escalation** — seed a ticket with `priority = LOW` and `dueDate` 1 hour in the past; call `schedulerService.runEscalation()`; assert `GET /tickets/:id` returns `priority = MEDIUM` and `isOverdue = false`
- [x] 6.3 **Test: MEDIUM→HIGH escalation** — same pattern, starting priority `MEDIUM`; assert result is `HIGH`
- [x] 6.4 **Test: HIGH→CRITICAL escalation** — starting priority `HIGH`; assert result is `CRITICAL` and `isOverdue = false` (not yet critical-and-overdue at this step; it becomes true on next run)
- [x] 6.5 **Test: CRITICAL ticket gets isOverdue = true** — seed a `CRITICAL` ticket with past `dueDate`; call `runEscalation()`; assert `priority = CRITICAL` (unchanged) and `isOverdue = true`
- [x] 6.6 **Test: Idempotency** — call `runEscalation()` twice on a `CRITICAL` overdue ticket; assert `priority` and `isOverdue` are stable after both calls
- [x] 6.7 **Test: No dueDate skipped** — seed a `LOW` ticket with `dueDate = null`; call `runEscalation()`; assert `priority = LOW` and `isOverdue = false`
- [x] 6.8 **Test: DONE ticket skipped** — seed a `LOW` ticket with past `dueDate` and `status = DONE`; call `runEscalation()`; assert `priority = LOW` unchanged
- [x] 6.9 **Test: Audit log entry on escalation** — after a successful escalation, call `GET /audit-logs?entityType=Ticket&entityId=:id`; assert an entry with `action = ESCALATE` and `actor = SYSTEM` exists
- [x] 6.10 **Test: No audit entry for skipped ticket** — after running escalation on a skipped ticket (no dueDate or DONE), assert no `ESCALATE` audit entry exists for that ticket
- [x] 6.11 **Test: Manual priority update clears isOverdue** — seed a `CRITICAL` overdue ticket, run escalation to set `isOverdue = true`, then send `PATCH /tickets/:id` with `{ priority: 'CRITICAL' }`; assert response has `isOverdue = false`
- [x] 6.12 **Test: Update without priority does not clear isOverdue** — seed a `CRITICAL` overdue ticket with `isOverdue = true`, then send `PATCH /tickets/:id` with `{ title: 'new title' }`; assert `isOverdue` remains `true`
- [x] 6.13 **Test: Escalation re-evaluates after manual reset** — reset a ticket to `HIGH` manually (clears `isOverdue`), run escalation again while `dueDate` is still past; assert `priority = CRITICAL` and `isOverdue = false`
- [x] 6.14 **Test: Re-run after reset reaches CRITICAL again** — continue from 6.13, run escalation once more; assert `isOverdue = true`
