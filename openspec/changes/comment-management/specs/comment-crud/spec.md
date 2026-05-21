## ADDED Requirements

### Requirement: Comment entity and relations
The system SHALL define a `Comment` entity with columns `id` (PK), `content` (text), `version` (optimistic lock), `createdAt`, `updatedAt`, a `ManyToOne` relation to `Ticket` via `ticketId`, and a `ManyToOne` relation to `User` via `authorId`.

#### Scenario: Entity creation via synchronize
- **WHEN** the application starts with TypeORM `synchronize: true`
- **THEN** PostgreSQL SHALL contain a `comments` table with columns `id`, `content`, `version`, `authorId`, `ticketId`, `createdAt`, `updatedAt`

#### Scenario: Foreign key integrity on ticket
- **WHEN** a `Comment` row is inserted with a `ticketId` that does not exist
- **THEN** the database SHALL reject the insert with a foreign-key violation

#### Scenario: Foreign key integrity on author
- **WHEN** a `Comment` row is inserted with an `authorId` that does not exist
- **THEN** the database SHALL reject the insert with a foreign-key violation

---

### Requirement: List comments for a ticket
The system SHALL expose `GET /tickets/:ticketId/comments`, protected by JWT AuthGuard, returning all comments for the given ticket.

#### Scenario: Ticket exists with comments
- **WHEN** a valid JWT is provided and `:ticketId` references an existing ticket with two comments
- **THEN** the response SHALL be `200 OK` with a JSON array of two comment objects each containing `id`, `ticketId`, `authorId`, `content`

#### Scenario: Ticket exists with no comments
- **WHEN** a valid JWT is provided and `:ticketId` references an existing ticket with no comments
- **THEN** the response SHALL be `200 OK` with an empty array

#### Scenario: Ticket does not exist
- **WHEN** `:ticketId` does not reference any ticket
- **THEN** the response SHALL be `404 Not Found`

#### Scenario: Unauthenticated request
- **WHEN** no JWT is provided
- **THEN** the response SHALL be `401 Unauthorized`

---

### Requirement: Create a comment
The system SHALL expose `POST /tickets/:ticketId/comments`, protected by JWT AuthGuard, accepting `{ authorId, content }` and returning the created comment. The service SHALL validate the ticket exists and write an AuditLog entry (`action: CREATE`, `entityType: COMMENT`, `actor: USER`).

#### Scenario: Successful comment creation
- **WHEN** a valid JWT is provided, `:ticketId` is valid, and `authorId` references an existing user
- **THEN** the response SHALL be `200 OK` with the new comment object (`id`, `ticketId`, `authorId`, `content`) and an AuditLog entry SHALL be persisted

#### Scenario: Missing required fields
- **WHEN** `content` is omitted from the request body
- **THEN** the response SHALL be `400 Bad Request`

#### Scenario: Ticket does not exist
- **WHEN** `:ticketId` does not reference any ticket
- **THEN** the response SHALL be `404 Not Found`

---

### Requirement: Update a comment
The system SHALL expose `PATCH /tickets/:ticketId/comments/:commentId`, protected by JWT AuthGuard, accepting `{ content }`. The service SHALL validate ticket and comment exist, update `content` with optimistic locking, and write an AuditLog entry (`action: UPDATE`, `entityType: COMMENT`).

#### Scenario: Successful content update
- **WHEN** a valid JWT is provided and the comment exists
- **THEN** the response SHALL be `200 OK` with the updated comment

#### Scenario: Concurrent update conflict
- **WHEN** two requests attempt to update the same comment simultaneously and the second conflicts with the optimistic lock
- **THEN** the second request SHALL receive `409 Conflict`

#### Scenario: Comment not found
- **WHEN** `:commentId` does not exist under `:ticketId`
- **THEN** the response SHALL be `404 Not Found`

---

### Requirement: Delete a comment
The system SHALL expose `DELETE /tickets/:ticketId/comments/:commentId`, protected by JWT AuthGuard. The service SHALL validate the comment exists, hard-delete the `Comment` row, and write an AuditLog entry (`action: DELETE`, `entityType: COMMENT`).

#### Scenario: Successful deletion
- **WHEN** a valid JWT is provided and the comment exists
- **THEN** the response SHALL be `200 OK` and the `comments` row SHALL be removed

#### Scenario: Comment not found
- **WHEN** `:commentId` does not reference an existing comment
- **THEN** the response SHALL be `404 Not Found`
