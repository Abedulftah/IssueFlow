## ADDED Requirements

### Requirement: Import tickets from CSV upload
The system SHALL provide a `POST /tickets/import` endpoint that accepts `multipart/form-data` with two fields: `file` (a CSV file) and `projectId` (a string). It SHALL parse the CSV, create tickets row by row, and return `{ created: number, failed: number, errors: Array<{ row: number, error: string }> }`.

The endpoint SHALL be protected by JWT AuthGuard.

Accepted MIME types for the uploaded file SHALL be `text/csv` and `text/plain`. Files exceeding 10 MB SHALL be rejected with HTTP 400.

#### Scenario: Successful full import
- **WHEN** an authenticated user uploads a valid CSV with all required fields for each row and a valid `projectId`
- **THEN** the system returns HTTP 200 with `{ created: N, failed: 0, errors: [] }` and N tickets exist in the database

#### Scenario: Partial import with row errors
- **WHEN** an authenticated user uploads a CSV where some rows have validation errors (e.g., invalid `status` value)
- **THEN** the system returns HTTP 200 with `created` equal to the number of successful rows, `failed` equal to the number of failed rows, and `errors` listing each failure with its row index and error message

#### Scenario: Project not found
- **WHEN** an authenticated user uploads a valid CSV but `projectId` refers to a non-existent or soft-deleted project
- **THEN** the system returns HTTP 404 before processing any rows

#### Scenario: Missing projectId field
- **WHEN** an authenticated user uploads a CSV without a `projectId` form field
- **THEN** the system returns HTTP 400

#### Scenario: File exceeds size limit
- **WHEN** an authenticated user uploads a file larger than 10 MB
- **THEN** the system returns HTTP 400

#### Scenario: Unsupported MIME type
- **WHEN** an authenticated user uploads a file with a MIME type other than `text/csv` or `text/plain`
- **THEN** the system returns HTTP 400

#### Scenario: Unauthenticated request
- **WHEN** a request is made to `POST /tickets/import` without a valid JWT
- **THEN** the system returns HTTP 401

### Requirement: Auto-assignment applied during import
The system SHALL apply the same auto-assignment logic as ticket creation when a CSV row's `assigneeId` field is blank or absent: assign the DEVELOPER in the project with the fewest non-DONE tickets (ties broken by earliest `createdAt`). If no DEVELOPERs exist, `assigneeId` SHALL remain null.

#### Scenario: Auto-assignment for row without assigneeId
- **WHEN** a CSV row has no `assigneeId` and the project has at least one DEVELOPER
- **THEN** the created ticket is assigned to the DEVELOPER with the fewest open tickets

#### Scenario: No developers available during import
- **WHEN** a CSV row has no `assigneeId` and the project has no DEVELOPERs
- **THEN** the ticket is created with `assigneeId = null`

### Requirement: Audit log written per imported ticket
The system SHALL write an AuditLog entry for each successfully created ticket during import with `action = IMPORT`, `actor = SYSTEM`, `entityType = TICKET`, `entityId` set to the new ticket's id, and `performedBy = SYSTEM`.

#### Scenario: Audit record on successful row
- **WHEN** a CSV row is successfully imported and a ticket is created
- **THEN** an AuditLog entry exists with `action = IMPORT`, `actor = SYSTEM`, and `entityId` matching the new ticket's id

#### Scenario: No audit record on failed row
- **WHEN** a CSV row fails validation or insertion
- **THEN** no AuditLog entry is created for that row

### Requirement: CSV column schema for import
Import CSV SHALL include a header row. Required column: `title`. Optional columns: `description`, `status` (defaults to `TODO`), `priority` (defaults to `LOW`), `assigneeId` (triggers auto-assignment if blank), `dueDate` (ISO 8601 date string or blank). Columns `id` and `createdAt` SHALL be ignored if present (system-generated).

#### Scenario: Minimal CSV with only title
- **WHEN** a CSV contains only a `title` column and valid rows
- **THEN** each ticket is created with `status = TODO`, `priority = LOW`, `assigneeId` via auto-assignment, and `dueDate = null`

#### Scenario: Row missing required title field
- **WHEN** a CSV row has a blank or missing `title`
- **THEN** that row fails with an error message indicating the title is required, and it is counted in `failed`
