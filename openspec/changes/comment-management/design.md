## Context

`CommentsModule` is a new NestJS feature module for requirement 2.5. Every comment belongs to exactly one ticket (`ticketId` FK) and one author user (`authorId` FK). No prior comment code exists; this is a greenfield addition that depends on `TicketsModule`, `UsersModule`, and `AuditLogModule`.

## Goals / Non-Goals

**Goals:**
- Expose the four nested comment CRUD endpoints exactly as specified in `README.md`.
- Enforce optimistic locking on `Comment` to prevent concurrent-edit data loss.
- Emit an `AuditLog` entry on every state-changing comment action.

**Non-Goals:**
- `@mention` parsing or mention persistence.
- Comment threading / parent-child nesting.
- Soft-delete for comments (not in README).

## Decisions

### 1. `@VersionColumn` on `Comment` for optimistic locking

TypeORM's `@VersionColumn` increments an integer on every `save()`. When two requests race, the loser's `save()` throws `OptimisticLockVersionMismatch`, which the service catches and re-throws as HTTP 409. This matches the same pattern used by `Ticket`.

### 2. Nested routing under `/tickets/:ticketId`

`CommentsController` is decorated with `@Controller('tickets/:ticketId/comments')`. The `ticketId` route param is validated (404 if ticket not found) at the start of every handler. `CommentsModule` is self-contained and re-exports nothing.

## Risks / Trade-offs

- **Concurrent update collision** → `@VersionColumn` is incremented server-side on every `save()`; concurrent writes from different users will collide and the loser receives 409 — the expected behavior per spec.
- **Circular module dependency** → `CommentsModule` imports `TicketsModule` and `UsersModule`. Both are stable; no `forwardRef` needed.
