## Why

IssueFlow's requirement 2.5 mandates a Comments subsystem: users must be able to annotate tickets with threaded comments — without this, there is no collaboration layer on top of tickets.

## What Changes

- Introduce the `Comment` entity (`id`, `ticketId`, `authorId`, `content`, `version`, `createdAt`, `updatedAt`) backed by a PostgreSQL table.
- Expose nested comment CRUD: `GET /tickets/:ticketId/comments`, `POST /tickets/:ticketId/comments`, `PATCH /tickets/:ticketId/comments/:commentId`, `DELETE /tickets/:ticketId/comments/:commentId`.
- Enforce optimistic locking via TypeORM `@VersionColumn` on `Comment`; concurrent edits return 409.
- Record `CREATE`, `UPDATE`, `DELETE` actions in AuditLog with `actor = USER`.
- All endpoints require JWT authentication.

## Capabilities

### New Capabilities

- `comment-crud`: Full CRUD for `Comment` nested under tickets — list, create, update (with optimistic locking), delete. Defines the `Comment` entity with FK relations to `Ticket` and `User`.

### Modified Capabilities

<!-- none — no prior comment specs exist -->

## Impact

- **New module**: `src/comments/` (entity, DTOs, service, controller, module).
- **New entity**: `comments` table; `ticketId` FK → `tickets.id`, `authorId` FK → `users.id`; `version` column for optimistic locking.
- **AppModule**: `CommentsModule` registered; depends on `TicketsModule` and `UsersModule`.
- **AuditLogModule**: comment actions written via injected `AuditLogService`.
- **No breaking changes** to existing endpoints.
