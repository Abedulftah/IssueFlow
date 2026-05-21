## Context

Tickets and Projects require reversible deletion. TypeORM provides first-class soft-delete support via `@DeleteDateColumn` + `SoftRemove`/`restore()`. The feature touches two modules (`TicketsModule`, `ProjectsModule`) and a cross-cutting concern (`AuditLogModule`). The assignment requires exact API contract compliance (routes, methods, response shapes defined in README.md).

Current state: neither entity has a `deletedAt` column; DELETE endpoints are not yet implemented.

## Goals / Non-Goals

**Goals:**
- Add `deletedAt: Date | null` to `Ticket` and `Project` entities
- Implement soft-delete and restore endpoints as specified in README.md
- Exclude soft-deleted records from all standard queries automatically
- Expose ADMIN-only `GET /{tickets|projects}/deleted` endpoints
- Emit AuditLog entries for every soft-delete and restore action

**Non-Goals:**
- Hard (physical) delete — never supported in this platform
- Cascade soft-delete from Project to its Tickets
- Bulk soft-delete operations
- Soft-delete for other entity types (Users, Comments, Attachments) in this change

## Decisions

### 1. TypeORM `@DeleteDateColumn` + `withDeleted()`
**Decision**: Use TypeORM's native `@DeleteDateColumn` on both entities and rely on `softRemove()` / `restore()` for state transitions. Repository queries use `withDeleted()` only for the ADMIN deleted-list endpoints; all other finders omit it so soft-deleted rows are automatically excluded.

**Alternatives considered**:
- Manual `isDeleted: boolean` flag — adds nullable handling in every query, no native ORM support.
- Physical delete + archive table — too complex, loses FK relationships.

### 2. Route ordering: `/deleted` before `/:id`
**Decision**: Register `GET /tickets/deleted` and `GET /projects/deleted` as static routes **before** the parameterised `/:id` routes in their controllers. NestJS matches routes in declaration order; if `/:id` is first, the literal string `"deleted"` is interpreted as an ID and a 404 or wrong entity is returned.

**Why this matters**: This is a silent bug — no compile error, failing only at runtime with a misleading 404 or 400.

### 3. No cascade soft-delete from Project → Tickets; service-layer access guard instead
**Decision**: Soft-deleting a Project does NOT set `deletedAt` on its Tickets. However, any `TicketsService` method that operates on a single ticket by ID (`findOne`, `update`, `softDelete`) MUST call an `assertProjectActive(projectId)` guard that checks the parent project's `deletedAt` using `withDeleted: true` on the `ProjectRepository`. If the project is soft-deleted, the guard throws `NotFoundException` (404). This makes the ticket invisible to callers without touching the ticket row.

**Why not true cascade**: Cascade would require a bulk UPDATE on potentially many ticket rows at delete time, and a matching bulk restore — complex and harder to reason about. The guard approach keeps ticket rows clean and makes the inaccessibility purely a service-layer concern.

**Restore order enforced**: Because the guard is also applied in `TicketsService.restore()` (returning 409 instead of 404 to be explicit), the only valid recovery path is: restore project first → then restore individual tickets.

### 4. Ticket dependency constraint interaction
**Decision**: A ticket with `status !== DONE` that is also a blocker for another ticket must still be restorable. However, when performing a status transition on a ticket, the blocker-check query must use `withDeleted: false` — i.e., a soft-deleted blocker is treated as non-existent and does NOT block the transition.

**Rationale**: If the blocker was soft-deleted, it is logically removed. Keeping it as a hard block would be surprising and unrecoverable without ADMIN intervention.

### 5. AuditLog actions
**Decision**: Introduce two new action constants: `SOFT_DELETE` and `RESTORE`. Both are emitted with `actor: USER` and `performedBy: <requestingUserId>`. Entity type is `TICKET` or `PROJECT`.

### 6. ADMIN guard placement
**Decision**: Use a role guard (`@Roles(Role.ADMIN)`) on `DELETE /projects/:id`, `GET /projects/deleted`, `POST /projects/:id/restore`, `GET /tickets/deleted`, `POST /tickets/:id/restore`. Regular users (DEVELOPER) may soft-delete their own tickets through `DELETE /tickets/:id` — subject to ownership/status rules defined in the specs.

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| Route shadowing: `GET /tickets/deleted` matched as `/:id = "deleted"` | Declare static routes before parameterised routes in controller class |
| TypeORM `synchronize: true` runs `ALTER TABLE` adding `deletedAt` — safe on empty tables, but on production data could cause issues | Acceptable in dev; document that production requires a migration |
| `withDeleted()` accidentally leaks into generic service methods | Keep `withDeleted()` calls isolated to the explicit `findDeleted()` service methods; never in shared `findAll()` or `findOne()` |
| Restoring a ticket whose project is soft-deleted creates an orphan | Add validation: restore is rejected if the parent project is soft-deleted (`409 Conflict`) |
| `assertProjectActive()` adds an extra DB read on every single-ticket operation | Acceptable — it is a single indexed PK lookup on the projects table; no joins needed |
| A DONE ticket that was soft-deleted and then restored retains DONE status | DONE tickets cannot be updated per the lifecycle rules — restore only revives the row, it does not change status. This is correct behaviour. |
