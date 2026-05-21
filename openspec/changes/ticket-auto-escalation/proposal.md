## Why

Unresolved tickets can silently age past their deadlines with no signal to stakeholders. Automatic priority escalation ensures overdue work is always visible and acted on without manual triage.

## What Changes

- `Ticket` entity gains an optional `dueDate` field (ISO-8601 datetime) accepted on `POST /tickets` and `PATCH /tickets/:id`.
- A scheduled background job (NestJS `@nestjs/schedule`) runs periodically and promotes the `priority` of every overdue ticket one level: `LOW → MEDIUM → HIGH → CRITICAL`.
- When a ticket reaches `CRITICAL` and remains overdue, its `isOverdue` flag is set to `true`; the flag appears in all GET ticket responses.
- Escalation is idempotent: `CRITICAL` tickets are never promoted further.
- Escalation only runs for tickets that have `dueDate` set and are not `DONE`.
- A manual `PATCH /tickets/:id` that includes a `priority` field resets `isOverdue` to `false` and clears escalation state so the next cycle re-evaluates from the new priority.
- Every escalation action is recorded in the AuditLog with `actor = SYSTEM`, `action = ESCALATE`.

## Capabilities

### New Capabilities

- `ticket-due-date`: Optional `dueDate` (ISO-8601) field on ticket creation and update; stored on the `Ticket` entity and returned in all GET responses.
- `ticket-auto-escalation`: Scheduled job that promotes ticket priority one level when `dueDate` has passed and the ticket is not DONE; sets `isOverdue = true` when the ticket is CRITICAL and still overdue; idempotent.
- `ticket-overdue-reset`: Manual priority update via `PATCH /tickets/:id` clears `isOverdue` and restores normal escalation evaluation on the next cycle.

### Modified Capabilities

## Impact

- `src/tickets/ticket.entity.ts` — add `dueDate`, `isOverdue` columns.
- `src/tickets/dto/create-ticket.dto.ts` / `update-ticket.dto.ts` — add optional `dueDate` field; `update` DTO also clears `isOverdue` when `priority` is supplied.
- `src/tickets/tickets.service.ts` — reset logic on manual priority update.
- `src/scheduler/scheduler.module.ts` + `scheduler.service.ts` — new or extended scheduled task for escalation.
- `src/audit-log/` — new ESCALATE action constant.
- Integration test suite — focused E2E tests covering escalation trigger, idempotency, reset, and audit entries.
