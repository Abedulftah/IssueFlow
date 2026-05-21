## ADDED Requirements

### Requirement: Mention tokens are extracted from comment content
The system SHALL parse all `@username` tokens from a comment's `content` field using the pattern `@[a-zA-Z0-9_]+`. Matching SHALL be case-insensitive; the extracted token is normalised to lowercase before user lookup.

#### Scenario: Single valid mention is extracted
- **WHEN** a comment is created with `content` containing `@alice`
- **THEN** the system extracts `alice`, looks up the user, and creates a `CommentMention` association

#### Scenario: Multiple mentions in one comment
- **WHEN** a comment is created with `content` `"@Alice please review, cc @Bob"`
- **THEN** the system creates two `CommentMention` rows — one for alice, one for bob

#### Scenario: No mentions in content
- **WHEN** a comment is created with content that contains no `@` tokens
- **THEN** no `CommentMention` rows are created and the request succeeds normally

#### Scenario: Case-insensitive username matching
- **WHEN** a comment contains `@ALICE` and a user with username `alice` exists
- **THEN** the mention resolves to that user regardless of the token's casing

### Requirement: Unknown usernames in mentions are rejected
The system SHALL validate that every extracted username corresponds to an existing user. If any mentioned username does not exist, the system MUST reject the request with HTTP 400.

#### Scenario: One unknown username causes rejection
- **WHEN** a comment create request contains `@nonexistent` and no user with that username exists
- **THEN** the system returns HTTP 400 with an error identifying the unknown username

#### Scenario: Mix of valid and invalid mentions
- **WHEN** a comment create request contains `@alice` (exists) and `@ghost` (does not exist)
- **THEN** the system returns HTTP 400 and does not create the comment or any mention rows

### Requirement: Mention associations are persisted in a join table
The system SHALL store each validated mention as a row in the `comment_mention` table with foreign keys to `comment.id` and `user.id`.

#### Scenario: Mention row is created on comment create
- **WHEN** a comment with `@alice` is successfully created
- **THEN** a `comment_mention` row exists with `commentId = <new comment id>` and `userId = alice's id`

### Requirement: Mentions are reconciled on comment update
When a comment is updated, the system SHALL diff the new mention set against the existing one. New mentions MUST be inserted and removed mentions MUST be deleted within the same transaction as the comment update.

#### Scenario: Adding a new mention on update
- **WHEN** a comment previously mentioning `@alice` is updated with content mentioning `@alice` and `@bob`
- **THEN** a new `comment_mention` row for bob is inserted; alice's row is unchanged

#### Scenario: Removing a mention on update
- **WHEN** a comment previously mentioning `@alice` and `@bob` is updated with content mentioning only `@alice`
- **THEN** bob's `comment_mention` row is deleted; alice's row is unchanged

#### Scenario: Replacing all mentions on update
- **WHEN** a comment previously mentioning `@alice` is updated with content mentioning only `@charlie`
- **THEN** alice's `comment_mention` row is deleted and a new row for charlie is inserted atomically

### Requirement: Mentioned users are notified by email
After a comment is successfully persisted, the system SHALL send an email notification to each newly mentioned user. The email MUST be dispatched after the database transaction commits and MUST NOT block the HTTP response. Email delivery failure MUST be logged but MUST NOT affect the HTTP response status.

On comment **create**, all mentioned users receive an email.
On comment **update**, only users in the newly **added** mention set receive an email; retained or removed mentions do not trigger email.

Users with no stored email address are silently skipped.

#### Scenario: Email sent to mentioned user on comment create
- **WHEN** a comment mentioning `@alice` is successfully created and alice has an email address
- **THEN** an email notification is dispatched to alice's email address after the transaction commits

#### Scenario: No email sent when content has no mentions
- **WHEN** a comment with no `@` tokens is created
- **THEN** no email is dispatched

#### Scenario: Email sent only to newly added mentions on update
- **WHEN** a comment previously mentioning `@alice` is updated to mention `@alice` and `@bob`
- **THEN** an email is dispatched to bob only; alice receives no email

#### Scenario: Email failure does not affect HTTP response
- **WHEN** a comment with `@alice` is created but the SMTP server is unreachable
- **THEN** the HTTP response still returns the created comment with HTTP 200 and the error is logged

#### Scenario: User with no email is silently skipped
- **WHEN** a comment mentions `@alice` and alice has no email address stored
- **THEN** no email is dispatched for alice and the comment is created successfully

### Requirement: User mentions endpoint returns paginated results
The system SHALL expose `GET /users/:userId/mentions` (JWT-protected) returning a paginated list of comments in which the specified user was mentioned, ordered by `comment.createdAt` descending.

#### Scenario: Basic mention retrieval
- **WHEN** `GET /users/42/mentions` is called and user 42 has been mentioned in 3 comments
- **THEN** the response is `{ data: [<comment>, ...], total: 3, page: 1 }` with comments newest first

#### Scenario: Pagination with page and pageSize
- **WHEN** `GET /users/42/mentions?page=2&pageSize=5` is called
- **THEN** the response returns the correct slice of results with `page: 2`

#### Scenario: User with no mentions returns empty list
- **WHEN** `GET /users/42/mentions` is called and user 42 has never been mentioned
- **THEN** the response is `{ data: [], total: 0, page: 1 }`

#### Scenario: Request for non-existent user returns 404
- **WHEN** `GET /users/9999/mentions` is called and no user with id 9999 exists
- **THEN** the system returns HTTP 404
