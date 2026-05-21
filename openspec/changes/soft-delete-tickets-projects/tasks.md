## 1. Database Entity & Schema

- [x] 1.1 Add `@DeleteDateColumn() deletedAt: Date | null` to the `Ticket` entity (TypeORM will add the column via `synchronize: true`)
- [x] 1.2 Add `@DeleteDateColumn() deletedAt: Date | null` to the `Project` entity
- [x] 1.3 Add `SOFT_DELETE` and `RESTORE` action constants to the `AuditLog` action enum (or string union)
- [x] 1.4 Verify TypeORM automatically excludes `deletedAt IS NOT NULL` rows from all existing `find*` calls (confirm no explicit `where: { deletedAt: null }` is needed)

## 2. Service Logic — Tickets

- [x] 2.1 Add private `assertProjectActive(projectId)` helper to `TicketsService`: queries `ProjectRepository` with `{ withDeleted: true }`, throws `NotFoundException` if project is missing or has `deletedAt` set
- [x] 2.2 Call `assertProjectActive()` at the top of `findOne()`, `update()`, and `softDelete()` in `TicketsService` (before any ticket-level logic)
- [x] 2.3 Implement `TicketsService.softDelete(id, userId)`: call `assertProjectActive()`, reject `400` if ticket status is `DONE`, reject `404` if already soft-deleted, then call `repository.softRemove()`
- [x] 2.4 Implement `TicketsService.findDeleted()`: use `repository.find({ withDeleted: true, where: { deletedAt: Not(IsNull()) } })`
- [x] 2.5 Implement `TicketsService.restore(id, userId)`: validate ticket exists (`withDeleted: true`), reject `400` if not soft-deleted, reject `409` if parent project is soft-deleted, then call `repository.restore(id)`
- [x] 2.6 Update `TicketsService` dependency-blocker check: filter blockers with `deletedAt: IsNull()` so soft-deleted blockers are ignored during `DONE` transition validation

## 3. Service Logic — Projects

- [x] 3.1 Implement `ProjectsService.softDelete(id, userId)`: call `repository.softRemove()`, reject with `404` if already soft-deleted or non-existent; MUST NOT cascade to tickets
- [x] 3.2 Implement `ProjectsService.findDeleted()`: use `repository.find({ withDeleted: true, where: { deletedAt: Not(IsNull()) } })`
- [x] 3.3 Implement `ProjectsService.restore(id, userId)`: validate exists (with `withDeleted: true`), reject `400` if not soft-deleted, then call `repository.restore(id)`
- [x] 3.4 Update `TicketsService.create()`: resolve the project before creating a ticket; reject with `404` if project is soft-deleted (standard `findOne` already excludes it — no extra code needed if using default finder)

## 4. AuditLog Integration

- [x] 4.1 Emit AuditLog entry in `TicketsService.softDelete()`: `action = SOFT_DELETE`, `entityType = TICKET`, `entityId = id`, `actor = USER`, `performedBy = userId`
- [x] 4.2 Emit AuditLog entry in `TicketsService.restore()`: `action = RESTORE`, `entityType = TICKET`, `entityId = id`, `actor = USER`, `performedBy = userId`
- [x] 4.3 Emit AuditLog entry in `ProjectsService.softDelete()`: `action = SOFT_DELETE`, `entityType = PROJECT`, `entityId = id`, `actor = USER`, `performedBy = userId`
- [x] 4.4 Emit AuditLog entry in `ProjectsService.restore()`: `action = RESTORE`, `entityType = PROJECT`, `entityId = id`, `actor = USER`, `performedBy = userId`

## 5. REST Controller Routing

- [x] 5.1 In `TicketsController`: declare `GET /tickets/deleted` handler **before** `GET /tickets/:id` in the class body to prevent route shadowing
- [x] 5.2 Add `DELETE /tickets/:id` endpoint → calls `TicketsService.softDelete()`; protected by `AuthGuard`
- [x] 5.3 Add `GET /tickets/deleted` endpoint → calls `TicketsService.findDeleted()`; protected by `AuthGuard` + `@Roles(ADMIN)`
- [x] 5.4 Add `POST /tickets/:id/restore` endpoint → calls `TicketsService.restore()`; protected by `AuthGuard` + `@Roles(ADMIN)`
- [x] 5.5 In `ProjectsController`: declare `GET /projects/deleted` handler **before** `GET /projects/:id` in the class body
- [x] 5.6 Add `DELETE /projects/:id` endpoint → calls `ProjectsService.softDelete()`; protected by `AuthGuard` + `@Roles(ADMIN)`
- [x] 5.7 Add `GET /projects/deleted` endpoint → calls `ProjectsService.findDeleted()`; protected by `AuthGuard` + `@Roles(ADMIN)`
- [x] 5.8 Add `POST /projects/:id/restore` endpoint → calls `ProjectsService.restore()`; protected by `AuthGuard` + `@Roles(ADMIN)`

## 6. Module Wiring & Auth Guarantees

- [x] 6.1 Confirm `RolesGuard` is applied globally or explicitly on both controllers (soft-delete/restore endpoints require ADMIN)
- [x] 6.2 Confirm `AuditLogModule` is imported in both `TicketsModule` and `ProjectsModule` (needed for audit log injection)
- [x] 6.3 Run `npm run lint` and fix any TypeScript errors introduced by new columns/methods

## 7. Tests

- [x] 7.1 Unit test `TicketsService.assertProjectActive()`: project active → passes; project soft-deleted → throws 404; project missing → throws 404
- [x] 7.2 Unit test `TicketsService.findOne()`: returns ticket when project active; returns 404 when project is soft-deleted
- [x] 7.3 Unit test `TicketsService.softDelete()`: covers success, DONE ticket rejection, already-deleted rejection, soft-deleted project → 404
- [x] 7.4 Unit test `TicketsService.restore()`: covers success, active-ticket rejection, soft-deleted-parent → 409
- [x] 7.5 Unit test `ProjectsService.softDelete()`: covers success, non-ADMIN (guard level), no cascade to tickets
- [x] 7.6 Unit test `ProjectsService.restore()`: covers success, active-project rejection
- [x] 7.7 Unit test blocker check: soft-deleted blocker does not block `DONE` transition
- [x] 7.8 E2E test: soft-delete project → GET/PATCH/DELETE ticket in that project all return 404
- [x] 7.9 E2E test: restore project → ticket operations resume returning 200
- [x] 7.10 E2E test: full soft-delete → restore round-trip for both Ticket and Project (verifies route ordering, 403s, 404s, 409)
