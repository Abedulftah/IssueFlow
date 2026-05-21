## Why

IssueFlow tickets need file evidence (screenshots, PDFs, logs) attached directly to them. Without attachments, users must share files out-of-band and reference them manually, breaking traceability. Implementing local-filesystem storage now unblocks the feature without requiring cloud credentials, satisfying the assignment constraint.

## What Changes

- New `AttachmentsModule` with a single `POST /tickets/:ticketId/attachments` upload endpoint and `DELETE /attachments/:id` removal endpoint.
- Multer middleware enforces a **10 MB** size limit and an allowlist of MIME types (`image/png`, `image/jpeg`, `application/pdf`, `text/plain`); all other types are rejected with HTTP 400.
- Binary files are written to `./uploads/attachments/` on the server filesystem; the database stores only lightweight metadata (originalName, mimeType, size, storagePath) — no blobs.
- Every upload and deletion is recorded in the AuditLog (`entityType = ATTACHMENT`, `actor = USER`).

## Capabilities

### New Capabilities

- `attachment-upload`: Accept a `multipart/form-data` POST on `/tickets/:ticketId/attachments`, validate MIME type and file size, persist the file to the local filesystem under a collision-safe path, and write a metadata row to the `attachments` table.
- `attachment-delete`: Soft-delete (or hard-delete) an attachment record and remove the file from disk via `DELETE /attachments/:id`.
- `attachment-constraints`: Centralised Multer guard that enforces the 10 MB limit and MIME-type allowlist, returning 400 with a descriptive error on violation.

### Modified Capabilities

<!-- No existing spec-level requirements change. -->

## Impact

- **New files**: `src/attachments/` module (entity, controller, service, DTOs); `uploads/attachments/` directory (gitignored).
- **APIs**: Two new endpoints (`POST /tickets/:ticketId/attachments`, `DELETE /attachments/:id`).
- **Dependencies**: `@nestjs/platform-express` (already present via NestJS), `multer` types (`@types/multer`).
- **AuditLogModule**: consumed to record upload/delete events.
- **TicketsModule**: `Ticket` entity referenced by the `Attachment` entity foreign key.
