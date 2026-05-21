## Why

Tickets in a project often have blocking relationships — one ticket cannot be completed until another is resolved. Without a formal dependency model, engineers work around this manually, leading to incorrect status transitions and missed blockers. This feature enforces those constraints at the API layer.

## What Changes

- Introduce a `TicketDependency` join entity that records `(blockerId, blockedId)` relationships between tickets.
- Add endpoints to create and remove blocker relationships between tickets.
- Enforce the constraint: a ticket cannot transition to `DONE` if it has any unresolved (non-`DONE`) blockers.
- Enforce the constraint: both tickets in a dependency must exist and belong to the **same project**.
- Prevent circular dependencies (a ticket cannot block itself directly or transitively).
- Record all dependency create/remove actions in the AuditLog.

## Capabilities

### New Capabilities

- `ticket-dependency-management`: Create and delete blocker relationships between tickets within the same project, with circular-dependency detection.
- `ticket-done-blocker-guard`: Block `DONE` status transitions when unresolved blocker tickets exist.

### Modified Capabilities

- `tickets`: Status lifecycle enforcement is extended — transition to `DONE` must additionally check for unresolved blockers.

## Impact

- **New entity**: `TicketDependency` (join table with FK constraints to `tickets`).
- **API**: Two new endpoints — `POST /tickets/:id/dependencies` and `DELETE /tickets/:id/dependencies/:blockerId`.
- **TicketsService**: `updateTicket` must query blockers before allowing `DONE` transition.
- **AuditLogModule**: dependency creation and removal events logged with `actor = USER`.
- **Dependencies**: No new npm packages required; TypeORM self-referential many-to-many via explicit join entity.
