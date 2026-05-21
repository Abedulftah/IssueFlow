## Why

IssueFlow's tickets, comments, and audit records all group under a project container — without a `Project` entity and its API, section 2.3 of the requirements is unmet and every downstream feature (tickets, workload, audit log) lacks the foreign-key anchor it depends on.

## What Changes

- Introduce the `Project` entity (`id`, `name`, `description`, `ownerId`) backed by a PostgreSQL table via TypeORM; `ownerId` is a FK to `users`.
- Expose basic CRUD: `POST /projects`, `GET /projects`, `GET /projects/:projectId`, `PATCH /projects/:projectId`, `DELETE /projects/:projectId`.
- All endpoints require JWT authentication.

## Capabilities

### New Capabilities

- `project-crud`: Full CRUD for the Project entity — create (with owner validation), read by id, list all, update name/description, delete. Enforces `ownerId` references an existing user.

### Modified Capabilities

<!-- none -->

## Impact

- **New module**: `src/projects/` (entity, DTOs, service, controller, module).
- **Database**: new `projects` table; `ownerId` FK → `users.id`.
- **AppModule**: `ProjectsModule` registered.
- **Downstream**: `TicketsModule` (2.4+) will carry a `projectId` FK → `projects.id`. Soft-delete (3.5) and workload (3.8) will extend this module in later changes.
