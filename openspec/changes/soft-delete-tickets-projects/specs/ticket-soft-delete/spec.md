## ADDED Requirements

### Requirement: Ticket has soft-delete column
The `Ticket` entity SHALL include a `deletedAt: Date | null` column managed by TypeORM `@DeleteDateColumn`. A `null` value means the ticket is active; a non-null timestamp means the ticket is soft-deleted.

#### Scenario: New ticket has null deletedAt
- **WHEN** a ticket is created via `POST /tickets`
- **THEN** `deletedAt` is `null`

#### Scenario: Soft-deleted ticket has non-null deletedAt
- **WHEN** `DELETE /tickets/:id` is called on an active ticket
- **THEN** `deletedAt` is set to the current UTC timestamp and the ticket is no longer returned by `GET /tickets` or `GET /tickets/:id`

---

### Requirement: Soft-delete endpoint
`DELETE /tickets/:id` SHALL soft-delete the ticket by setting `deletedAt`. It MUST NOT physically remove the database row.

#### Scenario: Successful soft-delete
- **WHEN** an authenticated user calls `DELETE /tickets/:id` for an existing active ticket
- **THEN** the response status is `200` and `deletedAt` is set on the ticket row

#### Scenario: Soft-delete a DONE ticket
- **WHEN** `DELETE /tickets/:id` is called on a ticket with `status = DONE`
- **THEN** the request MUST be rejected with `400 Bad Request` — DONE tickets cannot be modified at all

#### Scenario: Soft-delete already-deleted ticket
- **WHEN** `DELETE /tickets/:id` is called on a ticket that already has `deletedAt` set
- **THEN** the response is `404 Not Found` (soft-deleted records are invisible to standard lookups)

#### Scenario: Soft-delete non-existent ticket
- **WHEN** `DELETE /tickets/:id` is called with an ID that does not exist
- **THEN** the response is `404 Not Found`

---

### Requirement: Standard queries exclude soft-deleted tickets
All standard read endpoints (`GET /tickets`, `GET /tickets/:id`, `GET /tickets/export`) SHALL automatically exclude records where `deletedAt IS NOT NULL`.

#### Scenario: Listing tickets does not include soft-deleted
- **WHEN** `GET /tickets` is called
- **THEN** tickets with a non-null `deletedAt` are absent from the response array

#### Scenario: Single ticket fetch of soft-deleted record
- **WHEN** `GET /tickets/:id` is called for a soft-deleted ticket
- **THEN** the response is `404 Not Found`

---

### Requirement: ADMIN-only deleted ticket list
`GET /tickets/deleted` SHALL return all soft-deleted tickets. This endpoint MUST be restricted to users with the `ADMIN` role.

#### Scenario: ADMIN retrieves deleted tickets
- **WHEN** an ADMIN calls `GET /tickets/deleted`
- **THEN** the response is `200` with an array of all tickets where `deletedAt IS NOT NULL`

#### Scenario: Non-ADMIN access is rejected
- **WHEN** a `DEVELOPER` calls `GET /tickets/deleted`
- **THEN** the response is `403 Forbidden`

#### Scenario: Route is not shadowed by /:id
- **WHEN** `GET /tickets/deleted` is registered, the string `"deleted"` MUST NOT be matched as a ticket ID by the `GET /tickets/:id` route
- **THEN** the correct handler responds (verified by controller route declaration order)

---

### Requirement: Restore soft-deleted ticket (ADMIN only)
`POST /tickets/:id/restore` SHALL clear `deletedAt` (set to `null`) on a soft-deleted ticket. This endpoint MUST be restricted to `ADMIN` role.

#### Scenario: Successful restore
- **WHEN** an ADMIN calls `POST /tickets/:id/restore` for a soft-deleted ticket
- **THEN** `deletedAt` is set to `null`, the ticket is visible again in standard queries, and the response status is `200`

#### Scenario: Restore fails when parent project is soft-deleted
- **WHEN** `POST /tickets/:id/restore` is called but the ticket's parent project has `deletedAt` set
- **THEN** the response is `409 Conflict`

#### Scenario: Restore an active ticket
- **WHEN** `POST /tickets/:id/restore` is called on a ticket that is NOT soft-deleted
- **THEN** the response is `400 Bad Request`

#### Scenario: Restore non-existent ticket
- **WHEN** `POST /tickets/:id/restore` is called with an ID that does not exist
- **THEN** the response is `404 Not Found`

#### Scenario: Non-ADMIN restore attempt
- **WHEN** a `DEVELOPER` calls `POST /tickets/:id/restore`
- **THEN** the response is `403 Forbidden`

---

### Requirement: Ticket soft-delete emits audit log entry
Every soft-delete and restore action on a ticket SHALL create an `AuditLog` record.

#### Scenario: Audit entry on soft-delete
- **WHEN** `DELETE /tickets/:id` succeeds
- **THEN** an AuditLog entry is created with `action = SOFT_DELETE`, `entityType = TICKET`, `entityId = :id`, `actor = USER`, `performedBy = <requesting userId>`

#### Scenario: Audit entry on restore
- **WHEN** `POST /tickets/:id/restore` succeeds
- **THEN** an AuditLog entry is created with `action = RESTORE`, `entityType = TICKET`, `entityId = :id`, `actor = USER`, `performedBy = <requesting userId>`

---

### Requirement: Soft-deleted ticket does not block status transitions
A soft-deleted ticket that was previously registered as a blocker SHALL NOT prevent the dependent ticket from transitioning status.

#### Scenario: Blocker is soft-deleted — transition is allowed
- **WHEN** ticket B blocks ticket A, ticket B is then soft-deleted, and then ticket A attempts to transition to `DONE`
- **THEN** the transition MUST succeed (soft-deleted blocker is ignored)
