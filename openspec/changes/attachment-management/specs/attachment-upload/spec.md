## ADDED Requirements

### Requirement: Upload file to ticket
The system SHALL accept a `multipart/form-data` POST request to `/tickets/:ticketId/attachments` containing a single file field named `file`. The system MUST write the binary to `./uploads/attachments/<uuidv4>-<originalName>` on the server filesystem and persist an `Attachment` record containing `originalName`, `mimeType`, `size` (bytes), `storagePath`, and `ticketId` FK. The system MUST return HTTP 200 with the saved `Attachment` metadata object on success.

#### Scenario: Authenticated user uploads a valid file to an existing ticket
- **WHEN** an authenticated user sends `POST /tickets/:ticketId/attachments` with a file whose MIME type is `image/png`, `image/jpeg`, `application/pdf`, or `text/plain` and whose size is ≤ 10 MB
- **THEN** the system writes the file to disk under `./uploads/attachments/`, creates an `Attachment` row with correct metadata, records an AuditLog entry (`action = UPLOAD`, `entityType = ATTACHMENT`, `actor = USER`), and returns HTTP 200 with `{ id, originalName, mimeType, size, storagePath, ticketId }`

#### Scenario: Upload to non-existent ticket
- **WHEN** an authenticated user sends `POST /tickets/:ticketId/attachments` with a valid file but the `ticketId` does not exist
- **THEN** the system returns HTTP 404 and no file is written to disk

#### Scenario: Unauthenticated upload attempt
- **WHEN** a request to `POST /tickets/:ticketId/attachments` is made without a valid JWT token
- **THEN** the system returns HTTP 401 and rejects the request before any file processing

### Requirement: Collision-safe storage path
The system MUST prefix every stored filename with a UUIDv4 to prevent collisions when multiple users upload files with identical names. The `storagePath` persisted in the database MUST reflect this prefixed filename.

#### Scenario: Two users upload files with the same original name
- **WHEN** two different users upload files both named `report.pdf` to the same ticket
- **THEN** each file is stored under a distinct path (e.g., `uploads/attachments/<uuid1>-report.pdf` and `uploads/attachments/<uuid2>-report.pdf`) and both `Attachment` records are created successfully

### Requirement: Cleanup on DB failure after disk write
The system MUST delete the file from disk if the database write fails after the file has been saved, to avoid orphaned files.

#### Scenario: Database error after successful disk write
- **WHEN** the file is written to disk but the subsequent `Attachment` entity save throws a database error
- **THEN** the system removes the just-written file from disk and returns HTTP 500 (or appropriate error), leaving no orphaned file
