## ADDED Requirements

### Requirement: Ticket entity structure
The system SHALL persist tickets with the following fields: `id` (auto-increment PK), `title` (string, required), `description` (string, optional), `status` (enum: `TODO | IN_PROGRESS | IN_REVIEW | DONE`, default `TODO`), `priority` (enum: `LOW | MEDIUM | HIGH | CRITICAL`), `type` (enum: `BUG | FEATURE | TASK`), `projectId` (FK → projects.id, required), `assigneeId` (FK → users.id, nullable), `dueDate` (timestamp, nullable), `isOverdue` (boolean, default `false`), `version` (integer, optimistic lock column), `createdAt` (timestamp).

#### Scenario: Ticket persisted with all fields
- **WHEN** a valid `POST /tickets` request is made with all fields present
- **THEN** the system SHALL return the persisted ticket with all fields including `isOverdue: false` and the assigned `id`

#### Scenario: Ticket created with minimal fields
- **WHEN** `POST /tickets` is called with only `title`, `status`, `priority`, `type`, and `projectId`
- **THEN** the system SHALL create the ticket with `assigneeId: null`, `dueDate: null`, `isOverdue: false`

### Requirement: List tickets by project
The system SHALL expose `GET /tickets?projectId=:projectId` returning all tickets belonging to the specified project.

#### Scenario: Returns only tickets for the given project
- **WHEN** `GET /tickets?projectId=1` is called
- **THEN** the system SHALL return an array of tickets where every item has `projectId: 1`

#### Scenario: Missing projectId returns 400
- **WHEN** `GET /tickets` is called without a `projectId` query parameter
- **THEN** the system SHALL return HTTP 400

### Requirement: Get ticket by ID
The system SHALL expose `GET /tickets/:ticketId` returning the ticket with the given ID.

#### Scenario: Existing ticket returned
- **WHEN** `GET /tickets/1` is called for a ticket that exists
- **THEN** the system SHALL return the ticket object with all fields

#### Scenario: Non-existent ticket returns 404
- **WHEN** `GET /tickets/9999` is called and no ticket with id 9999 exists
- **THEN** the system SHALL return HTTP 404

### Requirement: Create ticket
The system SHALL expose `POST /tickets` accepting `title`, `description`, `status`, `priority`, `type`, `projectId`, `assigneeId`, `dueDate` and persisting the new ticket.

#### Scenario: Valid creation returns ticket
- **WHEN** a valid `POST /tickets` body is submitted
- **THEN** the system SHALL return the created ticket with status 200 and a populated `id`

#### Scenario: Missing required field returns 400
- **WHEN** `POST /tickets` is submitted without the required `title` field
- **THEN** the system SHALL return HTTP 400

#### Scenario: Non-existent projectId returns 4xx
- **WHEN** `POST /tickets` references a `projectId` that does not exist
- **THEN** the system SHALL return a 4xx error

### Requirement: Forward-only status transitions
The system SHALL enforce that `status` on a ticket can only move forward in the sequence `TODO → IN_PROGRESS → IN_REVIEW → DONE`. Backward transitions SHALL be rejected with HTTP 400.

#### Scenario: Valid forward transition accepted
- **WHEN** `PATCH /tickets/:ticketId` sets `status: "IN_PROGRESS"` on a ticket currently in `TODO`
- **THEN** the system SHALL update the ticket and return 200

#### Scenario: Backward transition rejected
- **WHEN** `PATCH /tickets/:ticketId` sets `status: "TODO"` on a ticket currently in `IN_PROGRESS`
- **THEN** the system SHALL return HTTP 400 without modifying the ticket

#### Scenario: Same-status update accepted
- **WHEN** `PATCH /tickets/:ticketId` sets `status` to the current status of the ticket
- **THEN** the system SHALL accept the request and return 200

### Requirement: DONE ticket immutability
The system SHALL reject any `PATCH /tickets/:ticketId` request — regardless of which fields are being updated — when the ticket's current status is `DONE`, returning HTTP 400.

#### Scenario: DONE ticket rejects any PATCH
- **WHEN** `PATCH /tickets/:ticketId` is called on a ticket with `status: DONE`, updating only `description`
- **THEN** the system SHALL return HTTP 400 without modifying any field

#### Scenario: DONE ticket rejects status update
- **WHEN** `PATCH /tickets/:ticketId` attempts to change `status` on a `DONE` ticket
- **THEN** the system SHALL return HTTP 400

### Requirement: Optimistic locking on update
The system SHALL use `@VersionColumn` on the Ticket entity. When a `PATCH /tickets/:ticketId` request includes a `version` field that does not match the current persisted version, the system SHALL return HTTP 409 Conflict.

#### Scenario: Concurrent update conflict detected
- **WHEN** two clients read ticket version 1, and the first PATCH succeeds (bumping to version 2), then the second PATCH is submitted with `version: 1`
- **THEN** the system SHALL return HTTP 409 for the second request

#### Scenario: Correct version proceeds normally
- **WHEN** `PATCH /tickets/:ticketId` includes `version: 2` and the persisted version is `2`
- **THEN** the system SHALL apply the update and return 200 with the updated ticket (version becomes 3)

### Requirement: Delete ticket
The system SHALL expose `DELETE /tickets/:ticketId` which permanently removes the ticket record and returns 200.

#### Scenario: Delete removes ticket
- **WHEN** `DELETE /tickets/1` is called on an existing ticket
- **THEN** the system SHALL remove the record and return 200

#### Scenario: Deleted ticket not found on subsequent GET
- **WHEN** `DELETE /tickets/1` is called, then `GET /tickets/1` is called
- **THEN** the system SHALL return HTTP 404
