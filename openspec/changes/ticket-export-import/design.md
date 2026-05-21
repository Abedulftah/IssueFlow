## Context

IssueFlow's `TicketsModule` currently supports CRUD and soft-delete but has no bulk data transfer. The project API contract (README) mandates two endpoints:

- `GET /tickets/export?projectId=<id>` → CSV file download
- `POST /tickets/import` → multipart upload returning `{ created, failed, errors }`

Both endpoints must sit in `TicketsController`, delegate to `TicketsService`, and be protected by JWT `AuthGuard`. The import path reuses Multer (already wired for `AttachmentsModule`) but with a different interceptor configuration. AuditLogModule must be injected into TicketsModule to record import events.

## Goals / Non-Goals

**Goals:**

- Implement export: stream all non-deleted tickets for a project as a UTF-8 CSV response.
- Implement import: parse uploaded CSV, bulk-create tickets row by row, collect per-row errors, return summary.
- Apply auto-assignment on import (same logic as ticket creation) when `assigneeId` is absent.
- Write an audit record per successfully created ticket (`actor = SYSTEM`, `action = IMPORT`).
- No new npm packages — use built-in string manipulation for CSV serialisation/deserialisation.

**Non-Goals:**

- Streaming / chunked large-file import (files are bounded to 10 MB).
- Updating or upserting existing tickets on import (insert-only).
- Exporting soft-deleted tickets.
- CSV schema versioning or backward-compatibility beyond this initial spec.

## Decisions

### D1 — CSV generation without a library

**Decision:** Build the CSV string manually (`Array.map → join(',')`) rather than pulling in `fast-csv` or `csv-stringify`.

**Rationale:** The column set is fixed and small (8 columns). A library adds a transitive dependency and build surface for zero functional benefit at this scale. Any field containing a comma or newline will be double-quoted per RFC 4180 — a one-liner helper covers this.

**Alternative considered:** `csv-stringify` (streams, handles quoting automatically). Ruled out to keep the dependency tree lean, which is an explicit project constraint.

---

### D2 — CSV parsing without a library

**Decision:** Split each import row by comma after stripping the header, map to a DTO, validate required fields in-process.

**Rationale:** Same as D1. The import schema is fixed; defensive per-row try/catch gives granular error messages (`{ row, error }`) without a streaming parser.

**Alternative considered:** `csv-parse` with async iterator. Adds a dependency; the synchronous line-split approach is simpler to unit-test and sufficient for 10 MB files.

---

### D3 — Multer `memoryStorage` for import

**Decision:** Use `memoryStorage` (buffer in RAM) for the import CSV, unlike attachments which write to disk.

**Rationale:** CSVs are text, bounded to 10 MB, processed synchronously in the service. No need to write then read a temp file. Attachment storage to disk is required by the `attachment-storage` constraint; that constraint does not apply here.

---

### D4 — Import is insert-only, row errors are non-fatal

**Decision:** Process each CSV row independently. A validation failure or DB error on one row is collected into the `errors` array; processing continues for remaining rows.

**Rationale:** The API contract returns `{ created, failed, errors }`, implying partial success is valid. Aborting on first error would make the endpoint less useful for bulk migrations.

---

### D5 — Auto-assignment on import mirrors ticket creation

**Decision:** Reuse the same `autoAssign` private method already planned for `TicketsService.create`.

**Rationale:** Consistency — the same "fewest open tickets" DEVELOPER selection logic must apply regardless of how a ticket enters the system.

---

### D6 — CSV column set

Columns (in order): `title`, `description`, `status`, `priority`, `assigneeId`, `dueDate`.

Export also includes read-only columns: `id`, `createdAt`.

Import ignores `id` and `createdAt` (system-generated). `status` defaults to `TODO` if blank. `priority` defaults to `LOW` if blank. `assigneeId` triggers auto-assignment if blank.

## Risks / Trade-offs

- **Large file memory pressure** → Mitigation: 10 MB Multer limit is enforced at the interceptor level; a 10 MB CSV at ~100 bytes/row is ~100k rows, acceptable for in-memory processing.
- **Comma/newline in ticket titles** → Mitigation: Export wraps every field in double-quotes and escapes inner double-quotes (`""`); import assumes this encoding. Free-text titles with raw commas from other sources may fail to parse — document this limitation.
- **Partial import and audit consistency** → Mitigation: Each successful row's audit entry is written in the same transaction as the ticket insert (TypeORM `EntityManager`), so no ticket exists without its audit record.
- **projectId validation** → Mitigation: Service verifies the project exists and is not soft-deleted before processing any rows; returns 404 early if invalid.
