## Why

Tickets created without an explicit assignee currently remain unassigned indefinitely, causing uneven workload distribution and delayed triage. Auto-assignment on creation ensures work is always routed to the least-loaded DEVELOPER in the project without requiring manual intervention.

## What Changes

- On `POST /tickets` without `assigneeId`, the system queries **all DEVELOPER-role users system-wide** and selects the one with the fewest non-DONE tickets in that project; ties broken by earliest `createdAt`. DEVELOPERs with no tickets in the project have a workload of `0` and are valid candidates.
- If no DEVELOPER-role users exist at all in the system, the ticket is created with `assigneeId = null` (no error).
- Every auto-assignment is recorded in the Audit Log (`actor = SYSTEM`, `action = AUTO_ASSIGN`).
- Auto-assignment is **never** triggered on ticket updates (`PATCH /tickets/:id`); an explicit `assigneeId` in a PATCH always overrides.
- New endpoint `GET /projects/:projectId/workload` returns `[{ userId, username, openTicketCount }]` sorted ascending by `openTicketCount`.

## Capabilities

### New Capabilities

- `auto-assignment`: Logic to select the least-loaded DEVELOPER in a project and assign a new ticket to them on creation; includes workload query and audit-log recording.
- `project-workload`: `GET /projects/:projectId/workload` endpoint returning per-developer open ticket counts, sorted ascending.

### Modified Capabilities

<!-- No existing spec-level behavior changes -->

## Impact

- **TicketsService / TicketsModule**: New `autoAssign()` helper called from `create()`; reads `User` and `Ticket` repositories.
- **ProjectsController / ProjectsModule**: New `GET /projects/:projectId/workload` route added to `ProjectsController`.
- **AuditLogModule**: Used to record `AUTO_ASSIGN` events with `actor = SYSTEM`.
- **UsersModule**: `User` entity queried for DEVELOPER role membership.
- **Database**: No schema changes; relies on existing `tickets.assigneeId`, `tickets.status`, `tickets.projectId`, and `users.role` columns.
- **Integration tests**: New test suite covering auto-assignment on creation, workload endpoint, audit-log entry, and override via PATCH.
