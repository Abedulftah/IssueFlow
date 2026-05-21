## Why

Tickets and Projects must be logically removable without permanent data loss — DELETE endpoints must mark records as deleted (via `deletedAt` timestamp) so they can be audited, restored, and excluded from standard queries. This is a core platform requirement defined in the assignment spec.

## What Changes

- `DELETE /tickets/:id` — soft-deletes by setting `deletedAt`; does **not** physically remove the row
- `DELETE /projects/:id` — soft-deletes by setting `deletedAt`; ADMIN only
- `GET /tickets/deleted` — ADMIN-only endpoint listing all soft-deleted tickets
- `GET /projects/deleted` — ADMIN-only endpoint listing all soft-deleted projects
- `POST /tickets/:id/restore` — restores a soft-deleted ticket; ADMIN only
- `POST /projects/:id/restore` — restores a soft-deleted project; ADMIN only
- Standard `GET` responses (list + single) must automatically exclude soft-deleted records
- All state-changing operations (soft-delete, restore) must be recorded in the AuditLog

## Capabilities

### New Capabilities

- `ticket-soft-delete`: Soft-delete and restore lifecycle for Ticket entities, including ADMIN-only visibility of deleted records and audit logging
- `project-soft-delete`: Soft-delete and restore lifecycle for Project entities, including ADMIN-only visibility of deleted records and audit logging

### Modified Capabilities

<!-- No existing specs to modify — this is a greenfield addition -->

## Impact

- **Entities**: `Ticket` and `Project` entities gain a `deletedAt: Date | null` column; TypeORM `@DeleteDateColumn` + `withDeleted()` / `SoftRemove` APIs must be used
- **APIs**: Six new/modified endpoints (see What Changes)
- **Authorization**: All restore and deleted-list endpoints require ADMIN role guard
- **AuditLog**: Soft-delete and restore actions must emit audit records (`action: SOFT_DELETE | RESTORE`, `entityType: TICKET | PROJECT`, `actor: USER`)
- **Cascades**: Soft-deleting a Project must not automatically cascade-delete its Tickets — each entity's deleted state is managed independently
- **Ticket dependency constraint**: A soft-deleted ticket cannot be referenced as a blocker in a new dependency; existing dependency references to a soft-deleted ticket must surface a validation error on status transition
