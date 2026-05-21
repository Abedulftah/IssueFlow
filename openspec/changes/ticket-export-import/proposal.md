## Why

Ticket data needs to move in and out of the system in bulk — users must be able to export a project's tickets to CSV for offline analysis or reporting, and import tickets from CSV to bootstrap new projects or migrate data. These capabilities are specified in the project API contract and are currently missing from the implementation.

## What Changes

- Add `GET /tickets/export?projectId=<id>` endpoint that streams all non-deleted tickets for a project as a CSV file (`Content-Type: text/csv`).
- Add `POST /tickets/import` endpoint accepting `multipart/form-data` with a CSV `file` field and a `projectId` field, returning `{ created, failed, errors }`.
- CSV column schema: `id`, `title`, `description`, `status`, `priority`, `assigneeId`, `dueDate`, `createdAt`.
- Import applies auto-assignment logic (same as ticket creation) when `assigneeId` is absent.
- Import records each created ticket in AuditLog with `actor = SYSTEM`, `action = IMPORT`.
- Multer is reused (already used for `AttachmentsModule`) but scoped to `text/plain` or `text/csv` MIME types for this endpoint; file size limit 10 MB.

## Capabilities

### New Capabilities

- `ticket-csv-export`: Export all non-deleted tickets in a project to a downloadable CSV file via `GET /tickets/export?projectId=`.
- `ticket-csv-import`: Parse an uploaded CSV file and bulk-create tickets in a project via `POST /tickets/import`, returning a structured result with per-row success/failure details.

### Modified Capabilities

<!-- No existing spec-level requirements are changing. -->

## Impact

- **TicketsModule** (`src/tickets/`): new controller actions, service methods, and a CSV utility helper.
- **Multer**: reused for file upload on the import endpoint; a separate `FileInterceptor` configuration is needed (MIME: `text/csv` or `text/plain`, max 10 MB).
- **AuditLogModule**: import action must write audit records for each created ticket.
- **AuthGuard**: both endpoints are protected (JWT required).
- No new npm dependencies required — Node.js `stream` / string manipulation covers CSV generation; `csv-parse` or manual string split covers parsing (choose manual split to avoid extra deps).
