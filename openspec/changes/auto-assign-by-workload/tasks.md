## 1. Core Service Logic — Auto-Assignment

- [x] 1.1 Inject `UserRepository` and `TicketRepository` into `TicketsService` (add to constructor if not already present)
- [x] 1.2 Implement `private async autoAssignTicket(projectId: string): Promise<string | null>` in `TicketsService` that queries DEVELOPER users with ticket counts in the project, ordered by count ASC then `createdAt` ASC, and returns the user id or null
- [x] 1.3 Call `autoAssignTicket()` inside `TicketsService.create()` when `createTicketDto.assigneeId` is absent, and set the returned value as `assigneeId` before persisting
- [x] 1.4 Ensure `autoAssignTicket()` is NOT called from `TicketsService.update()`

## 2. Audit Log Integration

- [x] 2.1 After a successful auto-assignment in `create()`, call `AuditLogService.record()` with `action = AUTO_ASSIGN`, `actor = SYSTEM`, `performedBy = SYSTEM`, `entityType = ticket`, `entityId = <ticketId>`

## 3. Workload Endpoint — Service Method

- [x] 3.1 Add `getProjectWorkload(projectId: string): Promise<{ userId: string; username: string; openTicketCount: number }[]>` to `TicketsService` (or a dedicated helper) that returns DEVELOPER users in the project sorted ascending by non-DONE ticket count
- [x] 3.2 Verify that soft-deleted tickets are excluded from the open ticket count

## 4. Workload Endpoint — Controller & Routing

- [x] 4.1 Add `GET /projects/:projectId/workload` route to `ProjectsController`, guarded by `AuthGuard`
- [x] 4.2 Inject `TicketsService` into `ProjectsModule` (use `forwardRef` if circular dependency exists) and call `getProjectWorkload()` from the new route handler
- [x] 4.3 Return 404 when the project does not exist

## 5. Module Wiring

- [x] 5.1 Export `TicketsService` from `TicketsModule` if not already exported
- [x] 5.2 Import `TicketsModule` (with `forwardRef` if needed) into `ProjectsModule` so `ProjectsController` can access `TicketsService`
- [x] 5.3 Ensure `AuditLogModule` is imported in `TicketsModule`

## 6. Integration Tests

- [x] 6.1 Set up test database seeding helpers: create project, create DEVELOPER users with varying ticket loads, create tickets
- [x] 6.2 Test: auto-assign selects DEVELOPER with fewest non-DONE tickets when multiple candidates exist
- [x] 6.3 Test: tie-breaking — when two DEVELOPERs have equal counts, the one with earlier `createdAt` is assigned
- [x] 6.4 Test: no candidates — ticket created with `assigneeId = null` when no DEVELOPER-role users exist in the system
- [x] 6.4b Test: DEVELOPER with zero tickets in the project is a valid candidate and gets assigned
- [x] 6.5 Test: explicit `assigneeId` on creation skips auto-assignment
- [x] 6.6 Test: `PATCH /tickets/:id` with `assigneeId` overrides without triggering auto-assignment
- [x] 6.7 Test: `AUTO_ASSIGN` audit log entry is created with `actor = SYSTEM` after auto-assignment
- [x] 6.8 Test: no `AUTO_ASSIGN` audit log entry when explicit `assigneeId` is provided
- [x] 6.9 Test: `GET /projects/:projectId/workload` returns correct `[{ userId, username, openTicketCount }]` sorted ascending
- [x] 6.10 Test: DONE tickets are excluded from `openTicketCount` in workload response
- [x] 6.11 Test: `GET /projects/:projectId/workload` returns all DEVELOPERs including those with `openTicketCount = 0`
- [x] 6.11b Test: `GET /projects/:projectId/workload` returns `[]` when no DEVELOPER-role users exist in the system
- [x] 6.12 Test: `GET /projects/:projectId/workload` returns 404 for non-existent project
- [x] 6.13 Test: unauthenticated request to `GET /projects/:projectId/workload` returns 401
