## Why

IssueFlow's core value is ticket tracking — without the `Ticket` entity and its CRUD API, status lifecycle enforcement, and auto-assignment rule, section 2.4 of the requirements is unmet.

## What Changes

- Introduce the `Ticket` entity with all required fields (`id`, `title`, `description`, `status`, `priority`, `type`, `projectId`, `assigneeId`, `dueDate`, `isOverdue`, `version`, `createdAt`) backed by a PostgreSQL table via TypeORM.
- Expose core CRUD: `GET /tickets?projectId=`, `GET /tickets/:ticketId`, `POST /tickets`, `PATCH /tickets/:ticketId`, `DELETE /tickets/:ticketId`.
- Enforce forward-only status transitions (`TODO → IN_PROGRESS → IN_REVIEW → DONE`); reject backward moves with 400. A `DONE` ticket rejects any `PATCH` with 400.
- Enforce optimistic locking via TypeORM `@VersionColumn`; concurrent update conflicts return 409.
- Implement auto-assignment on `POST /tickets`: if `assigneeId` is absent, assign the DEVELOPER in the project with the fewest non-DONE tickets (tie-break: earliest `createdAt`).
- All endpoints require JWT authentication.

## Capabilities

### New Capabilities

- `ticket-crud`: Core CRUD for the Ticket entity — create, read, list by project, update with status-transition guard and DONE-immutability check, delete. Includes the `Ticket` entity definition with all FK relations and `@VersionColumn`.
- `ticket-auto-assignment`: On `POST /tickets`, when `assigneeId` is absent, finds the least-loaded DEVELOPER in the project (non-DONE ticket count, earliest `createdAt` tiebreak) and sets `assigneeId`.

### Modified Capabilities

<!-- none — no existing ticket specs -->

## Impact

- **New module**: `src/tickets/` (entity, DTOs, service, controller, module).
- **Database**: new `tickets` table; `projectId` FK → `projects.id`, `assigneeId` FK → `users.id`; `version` column for optimistic locking.
- **AppModule**: `TicketsModule` registered; depends on `ProjectsModule` and `UsersModule`.
