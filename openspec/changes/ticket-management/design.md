## Context

`UsersModule` (§2.1), `AuthModule` (§2.2), and `ProjectsModule` (§2.3) are already designed. `TicketsModule` is the central domain object of IssueFlow — it has the most FK relations and the most complex business rules (status lifecycle, optimistic locking, auto-assignment).

This change covers the §2.4 core scope:
- Ticket CRUD with status-transition enforcement and DONE-immutability.
- Auto-assignment on creation.

Key constraints:
- All endpoints require JWT authentication.
- Status transitions are strictly forward: `TODO → IN_PROGRESS → IN_REVIEW → DONE`.
- A `DONE` ticket is fully immutable — any `PATCH` is rejected with 400.
- Concurrent updates must be safe: optimistic locking via `@VersionColumn`.

## Goals / Non-Goals

**Goals:**
- Implement the five core ticket endpoints exactly as specified in the README for §2.4.
- Enforce status lifecycle and DONE-immutability at the service layer.
- Implement optimistic locking via TypeORM `@VersionColumn`.
- Implement auto-assignment: assign the least-loaded DEVELOPER in the project when `assigneeId` is absent.

**Non-Goals:**
- CSV export/import (separate change).
- Soft-delete, restore, or listing deleted tickets (separate change).
- Ticket dependencies (separate change).
- Attachments (separate change).
- Comments and `@mention` parsing (separate change).
- Auto-escalation scheduler (separate change).
- Hard (permanent) delete of tickets.

## Decisions

### D1 — Forward-only status transitions enforced in the service layer

**Decision:** On every `PATCH /tickets/:ticketId`, the service computes the allowed next statuses for the current ticket status using a static transition map:
```
TODO        → [IN_PROGRESS]
IN_PROGRESS → [IN_REVIEW]
IN_REVIEW   → [DONE]
DONE        → []  (immutable — reject entire PATCH)
```
If the requested `status` is not in the allowed set, throw `BadRequestException`. If the ticket is `DONE`, throw `BadRequestException` before touching any field.

**Why:** Business rule lives in one place (service), not scattered across controllers or DB triggers. The static map is the single source of truth.

**Alternatives considered:** DB `CHECK` constraint — rejected because it only catches the status field, not the DONE-immutability rule on all other fields.

### D2 — Optimistic locking via `@VersionColumn`

**Decision:** Add a `@VersionColumn() version: number` on the `Ticket` entity. The PATCH DTO may optionally include `version`. TypeORM's `save()` with the version column automatically throws `OptimisticLockVersionMismatchError` if the persisted version differs. Catch this error in the service and return 409.

**Why:** No advisory locks or distributed state needed; TypeORM handles the SQL `WHERE version = :v` check atomically. Correct for the concurrent-update scenario in the requirements.

**Alternatives considered:** DB advisory locks — more complex, requires raw SQL, unsuitable for a NestJS service layer.

### D3 — DELETE is a hard delete for §2.4

**Decision:** `DELETE /tickets/:ticketId` permanently removes the record. Soft-delete will be introduced in a separate change.

**Why:** §2.4 only specifies the five core CRUD endpoints. Soft-delete infrastructure is a separate concern. Keeping DELETE hard avoids introducing `deletedAt` before it is needed.

### D4 — Auto-assignment: least-loaded DEVELOPER query

**Decision:** On `POST /tickets` when `assigneeId` is absent, the service runs a query joining `users` (role = `DEVELOPER`) to the `tickets` table counting non-DONE tickets for the target `projectId`. It selects the user with the minimum count, breaking ties by `users.createdAt ASC`. If no DEVELOPER exists in the project, `assigneeId` remains `null`.

**Why:** Assigns work fairly to the developer with the lowest active load, as required by §2.4 business rules.

### D5 — `projectId` from query param for list endpoint

**Decision:** `GET /tickets?projectId=` requires a `projectId` query param. If absent, return 400. All tickets in the response belong to that project.

**Why:** The README specifies `projectId` as a required query parameter. Scoping by project prevents full-table scans.

## Risks / Trade-offs

- **Optimistic locking UX**: PATCH callers that omit `version` will not benefit from optimistic locking protection. Concurrent edits without version will last-write-win. Clients should echo the `version` field from GET responses.
- **Auto-assignment query performance**: The least-loaded DEVELOPER query does a subquery/join per ticket creation. With many tickets/users this is fine at assignment scale; no index optimization needed for the assignment.
- **Hard delete replaced in soft-delete change**: When soft-delete is implemented, the DELETE handler will be changed. Any tests written against hard-delete behavior must be updated at that time.

## Migration Plan

1. Create `src/tickets/` module (entity, DTOs, service, controller, module).
2. Register `TicketsModule` in `AppModule`; import `ProjectsModule` and `UsersModule`.
3. Restart app — TypeORM `synchronize` creates the `tickets` table with all columns and FKs.
4. No data migration required (greenfield table).

## Open Questions

<!-- none -->
