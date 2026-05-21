## ADDED Requirements

### Requirement: Export project tickets as CSV
The system SHALL provide a `GET /tickets/export` endpoint that accepts a `projectId` query parameter and returns all non-deleted tickets for that project as a downloadable CSV file.

The response SHALL set `Content-Type: text/csv` and include a `Content-Disposition: attachment; filename="tickets.csv"` header.

The CSV SHALL include a header row followed by one data row per ticket with columns in this order: `id`, `title`, `description`, `status`, `priority`, `assigneeId`, `dueDate`, `createdAt`.

Every field SHALL be wrapped in double-quotes. Inner double-quote characters SHALL be escaped as `""` (RFC 4180).

The endpoint SHALL be protected by JWT AuthGuard.

#### Scenario: Successful export with tickets
- **WHEN** an authenticated user sends `GET /tickets/export?projectId=<id>` for a project that has non-deleted tickets
- **THEN** the system returns HTTP 200 with `Content-Type: text/csv`, a header row, and one CSV row per non-deleted ticket

#### Scenario: Export empty project
- **WHEN** an authenticated user sends `GET /tickets/export?projectId=<id>` for a project with no tickets
- **THEN** the system returns HTTP 200 with `Content-Type: text/csv` and only the header row (no data rows)

#### Scenario: Project not found
- **WHEN** an authenticated user sends `GET /tickets/export?projectId=<nonexistent>` or the project is soft-deleted
- **THEN** the system returns HTTP 404

#### Scenario: Missing projectId parameter
- **WHEN** an authenticated user sends `GET /tickets/export` without a `projectId` query parameter
- **THEN** the system returns HTTP 400

#### Scenario: Unauthenticated request
- **WHEN** a request is made to `GET /tickets/export` without a valid JWT
- **THEN** the system returns HTTP 401

### Requirement: Soft-deleted tickets excluded from export
The system SHALL exclude tickets whose `deletedAt` is non-null from the CSV export output.

#### Scenario: Soft-deleted tickets not in CSV
- **WHEN** a project has both active and soft-deleted tickets and an authenticated user exports
- **THEN** the CSV contains rows only for active (non-deleted) tickets
