## ADDED Requirements

### Requirement: Delete attachment by ID
The system SHALL accept `DELETE /attachments/:id` and remove both the database record and the file from disk. If the file is already absent from disk (`ENOENT`), the system MUST still proceed with the database deletion. The system MUST return HTTP 200 on success.

#### Scenario: Authenticated user deletes an existing attachment
- **WHEN** an authenticated user sends `DELETE /attachments/:id` for an attachment that exists in the database
- **THEN** the system deletes the physical file from `./uploads/attachments/`, deletes the `Attachment` row, records an AuditLog entry (`action = DELETE`, `entityType = ATTACHMENT`, `actor = USER`), and returns HTTP 200

#### Scenario: Delete attachment whose file is already missing from disk
- **WHEN** an authenticated user sends `DELETE /attachments/:id` for a record that exists in the database but the file has already been removed from disk
- **THEN** the system swallows the `ENOENT` error, deletes the `Attachment` row, and returns HTTP 200

#### Scenario: Delete non-existent attachment
- **WHEN** an authenticated user sends `DELETE /attachments/:id` where no `Attachment` record matches `id`
- **THEN** the system returns HTTP 404 and takes no other action

#### Scenario: Unauthenticated delete attempt
- **WHEN** a request to `DELETE /attachments/:id` is made without a valid JWT token
- **THEN** the system returns HTTP 401
