## ADDED Requirements

### Requirement: Project has soft-delete column
The `Project` entity SHALL include a `deletedAt: Date | null` column managed by TypeORM `@DeleteDateColumn`. A `null` value means the project is active; a non-null timestamp means the project is soft-deleted.

#### Scenario: New project has null deletedAt
- **WHEN** a project is created via `POST /projects`
- **THEN** `deletedAt` is `null`

#### Scenario: Soft-deleted project has non-null deletedAt
- **WHEN** `DELETE /projects/:id` is called on an active project
- **THEN** `deletedAt` is set to the current UTC timestamp and the project is no longer returned by `GET /projects` or `GET /projects/:id`

---

### Requirement: Soft-delete endpoint (ADMIN only)
`DELETE /projects/:id` SHALL soft-delete the project. This endpoint MUST be restricted to users with the `ADMIN` role. It MUST NOT physically remove the database row and MUST NOT cascade soft-delete the project's tickets.

#### Scenario: ADMIN soft-deletes a project
- **WHEN** an ADMIN calls `DELETE /projects/:id` for an existing active project
- **THEN** the response status is `200`, `deletedAt` is set on the project row, and all associated tickets remain active (their `deletedAt` stays `null`)

#### Scenario: Non-ADMIN soft-delete attempt
- **WHEN** a `DEVELOPER` calls `DELETE /projects/:id`
- **THEN** the response is `403 Forbidden`

#### Scenario: Soft-delete already-deleted project
- **WHEN** `DELETE /projects/:id` is called on a project that already has `deletedAt` set
- **THEN** the response is `404 Not Found`

#### Scenario: Soft-delete non-existent project
- **WHEN** `DELETE /projects/:id` is called with an ID that does not exist
- **THEN** the response is `404 Not Found`

---

### Requirement: Standard queries exclude soft-deleted projects
All standard read endpoints (`GET /projects`, `GET /projects/:id`, `GET /projects/:projectId/workload`) SHALL automatically exclude records where `deletedAt IS NOT NULL`.

#### Scenario: Project list excludes soft-deleted
- **WHEN** `GET /projects` is called
- **THEN** projects with a non-null `deletedAt` are absent from the response array

#### Scenario: Single project fetch of soft-deleted record
- **WHEN** `GET /projects/:id` is called for a soft-deleted project
- **THEN** the response is `404 Not Found`

---

### Requirement: ADMIN-only deleted project list
`GET /projects/deleted` SHALL return all soft-deleted projects. This endpoint MUST be restricted to users with the `ADMIN` role.

#### Scenario: ADMIN retrieves deleted projects
- **WHEN** an ADMIN calls `GET /projects/deleted`
- **THEN** the response is `200` with an array of all projects where `deletedAt IS NOT NULL`

#### Scenario: Non-ADMIN access is rejected
- **WHEN** a `DEVELOPER` calls `GET /projects/deleted`
- **THEN** the response is `403 Forbidden`

#### Scenario: Route is not shadowed by /:id
- **WHEN** `GET /projects/deleted` is registered, the string `"deleted"` MUST NOT be matched as a project ID by the `GET /projects/:id` route
- **THEN** the correct handler responds (verified by controller route declaration order)

---

### Requirement: Restore soft-deleted project (ADMIN only)
`POST /projects/:id/restore` SHALL clear `deletedAt` (set to `null`) on a soft-deleted project. This endpoint MUST be restricted to `ADMIN` role.

#### Scenario: Successful restore
- **WHEN** an ADMIN calls `POST /projects/:id/restore` for a soft-deleted project
- **THEN** `deletedAt` is set to `null`, the project is visible again in standard queries, and the response status is `200`

#### Scenario: Restore an active project
- **WHEN** `POST /projects/:id/restore` is called on a project that is NOT soft-deleted
- **THEN** the response is `400 Bad Request`

#### Scenario: Restore non-existent project
- **WHEN** `POST /projects/:id/restore` is called with an ID that does not exist
- **THEN** the response is `404 Not Found`

#### Scenario: Non-ADMIN restore attempt
- **WHEN** a `DEVELOPER` calls `POST /projects/:id/restore`
- **THEN** the response is `403 Forbidden`

---

### Requirement: Project soft-delete emits audit log entry
Every soft-delete and restore action on a project SHALL create an `AuditLog` record.

#### Scenario: Audit entry on soft-delete
- **WHEN** `DELETE /projects/:id` succeeds
- **THEN** an AuditLog entry is created with `action = SOFT_DELETE`, `entityType = PROJECT`, `entityId = :id`, `actor = USER`, `performedBy = <requesting userId>`

#### Scenario: Audit entry on restore
- **WHEN** `POST /projects/:id/restore` succeeds
- **THEN** an AuditLog entry is created with `action = RESTORE`, `entityType = PROJECT`, `entityId = :id`, `actor = USER`, `performedBy = <requesting userId>`

---

### Requirement: Ticket creation rejected for soft-deleted project
Creating a ticket with a `projectId` that refers to a soft-deleted project SHALL be rejected.

#### Scenario: POST /tickets with soft-deleted project
- **WHEN** `POST /tickets` is called with a `projectId` whose project has `deletedAt` set
- **THEN** the response is `404 Not Found` (project is invisible to standard lookups, so it appears non-existent)

---

### Requirement: Ticket restore blocked when parent project is soft-deleted
`POST /tickets/:id/restore` MUST fail if the ticket's parent project is currently soft-deleted. (Cross-reference: ticket-soft-delete spec.)

#### Scenario: Restore orphaned ticket
- **WHEN** a project is soft-deleted and an ADMIN attempts to restore a ticket that belongs to that project
- **THEN** the response is `409 Conflict` with a message indicating the parent project must be restored first

---

### Requirement: All ticket operations blocked when parent project is soft-deleted
Any request that targets a specific ticket (`GET /tickets/:id`, `PATCH /tickets/:id`, `DELETE /tickets/:id`) SHALL return `404 Not Found` if that ticket's parent project has `deletedAt` set. The ticket's own `deletedAt` remains `null` — the row is not modified — but the ticket is inaccessible while its project is soft-deleted.

The check MUST be performed inside `TicketsService` as a shared guard (e.g., `assertProjectActive(ticket.projectId)`) called at the top of every method that operates on a single ticket by ID.

#### Scenario: GET /tickets/:id when project is soft-deleted
- **WHEN** `GET /tickets/:id` is called and the ticket's parent project has `deletedAt` set
- **THEN** the response is `404 Not Found`

#### Scenario: PATCH /tickets/:id when project is soft-deleted
- **WHEN** `PATCH /tickets/:id` is called and the ticket's parent project has `deletedAt` set
- **THEN** the response is `404 Not Found`

#### Scenario: DELETE /tickets/:id when project is soft-deleted
- **WHEN** `DELETE /tickets/:id` is called and the ticket's parent project has `deletedAt` set
- **THEN** the response is `404 Not Found`

#### Scenario: Operations resume after project is restored
- **WHEN** `POST /projects/:id/restore` succeeds and then `GET /tickets/:id` is called for a ticket in that project
- **THEN** the ticket is returned successfully with `200`
