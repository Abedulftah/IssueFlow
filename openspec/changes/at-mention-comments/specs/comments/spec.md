## MODIFIED Requirements

### Requirement: Comment create validates and records mentions
The system SHALL, during comment creation, extract `@username` tokens from `content`, validate all referenced usernames exist, and persist mention associations before returning the response. Validation failure MUST result in HTTP 400 without creating the comment.

#### Scenario: Comment created with valid mentions
- **WHEN** `POST /tickets/:ticketId/comments` is called with content containing one or more valid `@username` tokens
- **THEN** the comment is created, mention associations are persisted, and the response includes `mentionedUsers: [{ id, username, fullName }]`

#### Scenario: Comment creation fails with unknown mention
- **WHEN** `POST /tickets/:ticketId/comments` is called with content containing an `@username` that does not match any user
- **THEN** the system returns HTTP 400 and the comment is not persisted

#### Scenario: Comment created with no mentions
- **WHEN** `POST /tickets/:ticketId/comments` is called with content that contains no `@` tokens
- **THEN** the comment is created and the response includes `mentionedUsers: []`

### Requirement: Comment response includes mentionedUsers field
Every comment response (from create, update, and read operations) SHALL include a `mentionedUsers` array. Each element MUST have the shape `{ id, username, fullName }`. When no users are mentioned, the array SHALL be empty.

#### Scenario: Comment read returns mentionedUsers
- **WHEN** `GET /tickets/:ticketId/comments` is called
- **THEN** each comment in the response includes a `mentionedUsers` array populated with the users mentioned in that comment

#### Scenario: mentionedUsers is empty when no mentions exist
- **WHEN** a comment has no associated `CommentMention` rows
- **THEN** its `mentionedUsers` field is `[]`

### Requirement: Comment update reconciles mention list
The system SHALL, during comment update, extract mentions from the updated `content`, validate all usernames, and atomically reconcile the persisted mention set (add new, remove dropped). Validation failure MUST result in HTTP 400 without updating the comment.

#### Scenario: Comment updated with a new valid mention
- **WHEN** `PATCH /tickets/:ticketId/comments/:id` is called with content adding a new valid `@username`
- **THEN** the new `CommentMention` row is inserted and the response reflects the updated `mentionedUsers`

#### Scenario: Comment update fails with unknown mention
- **WHEN** `PATCH /tickets/:ticketId/comments/:id` is called with content containing an `@username` that does not exist
- **THEN** the system returns HTTP 400 and neither the comment nor its mention associations are modified
