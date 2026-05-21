## ADDED Requirements

### Requirement: MIME-type allowlist enforcement
The system MUST reject any upload whose `Content-Type` (as reported by Multer's `mimetype` field) is not one of: `image/png`, `image/jpeg`, `application/pdf`, `text/plain`. Rejection MUST occur at the Multer `fileFilter` layer — before any bytes are written to disk — and MUST return HTTP 400 with a descriptive error message.

#### Scenario: Upload with disallowed MIME type
- **WHEN** an authenticated user uploads a file with MIME type `image/gif` (or any type not in the allowlist) to `POST /tickets/:ticketId/attachments`
- **THEN** the system returns HTTP 400 with an error indicating the file type is not permitted, and no file is written to disk and no `Attachment` row is created

#### Scenario: Upload with allowed MIME type — PNG
- **WHEN** an authenticated user uploads a file with MIME type `image/png`
- **THEN** Multer's `fileFilter` passes the file through and processing continues normally

#### Scenario: Upload with allowed MIME type — PDF
- **WHEN** an authenticated user uploads a file with MIME type `application/pdf`
- **THEN** Multer's `fileFilter` passes the file through and processing continues normally

### Requirement: File size limit enforcement
The system MUST reject any upload that exceeds **10 485 760 bytes** (10 MiB). Rejection MUST be triggered by Multer's `limits.fileSize` option, which aborts the stream before the full file is written. The system MUST return HTTP 400 with a message indicating the file is too large.

#### Scenario: Upload exceeds 10 MB
- **WHEN** an authenticated user uploads a file larger than 10 485 760 bytes
- **THEN** Multer aborts the stream, the controller catches `MulterError('LIMIT_FILE_SIZE')`, returns HTTP 400 with an error message, and no partial file remains on disk

#### Scenario: Upload exactly at the 10 MB limit
- **WHEN** an authenticated user uploads a file of exactly 10 485 760 bytes with an allowed MIME type
- **THEN** the system accepts the file and processes it normally

#### Scenario: Upload below the 10 MB limit
- **WHEN** an authenticated user uploads a file smaller than 10 485 760 bytes with an allowed MIME type
- **THEN** the system accepts the file and processes it normally

### Requirement: Uploads directory auto-creation
The system MUST ensure the `./uploads/attachments/` directory exists on startup, creating it recursively if absent, so that the first upload does not fail due to a missing directory.

#### Scenario: Directory does not exist on service initialisation
- **WHEN** the `AttachmentsService` is instantiated and `./uploads/attachments/` does not exist on the filesystem
- **THEN** the service creates the directory (including any missing parent segments) before any upload is processed
