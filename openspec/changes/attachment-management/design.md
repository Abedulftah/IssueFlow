## Context

IssueFlow runs in a self-contained assignment environment without cloud credentials. The assignment spec mandates that binary files go to the **local server filesystem** (`./uploads/attachments/`) and that the database holds only metadata. NestJS ships with Multer integration via `@nestjs/platform-express`, so no extra upload library is needed.

Constraints in force:
- Max file size: **10 MB**
- Allowed MIME types: `image/png`, `image/jpeg`, `application/pdf`, `text/plain`
- Database stores: `originalName`, `mimeType`, `size` (bytes), `storagePath` (relative path string), `ticketId` FK
- All endpoints require JWT (`AuthGuard`)
- Every upload/delete emits an AuditLog entry

## Goals / Non-Goals

**Goals:**
- Implement `POST /tickets/:ticketId/attachments` (multipart upload) and `DELETE /attachments/:id`
- Enforce MIME-type allowlist and 10 MB size cap at the Multer layer — before controller logic runs
- Persist a lightweight `Attachment` entity (metadata only) with a FK to `Ticket`
- Write files to `./uploads/attachments/<uuid>-<originalname>` for collision safety
- Record AuditLog entries for upload and delete
- Return 400 with a descriptive message for invalid MIME type or oversized file

**Non-Goals:**
- Cloud storage (S3, GCS) — local FS is the mock for now
- Streaming / chunked upload
- Image resizing or virus scanning
- Download / serving endpoints (not in the README contract)
- Pagination of attachments list

## Decisions

### 1. Storage path strategy — UUID prefix

**Decision**: Filename on disk = `<uuidv4>-<sanitised-original-name>`, stored under `./uploads/attachments/`.

**Rationale**: Prevents collisions when two users upload files with the same name, avoids path-traversal issues if the original name contains `../`. `uuid` is already available via Node.js `crypto.randomUUID()` — no extra dependency.

**Alternatives considered**: Keeping the original filename (collision-prone); hashing content (makes debugging hard).

---

### 2. Multer configuration — `FileInterceptor` with inline options

**Decision**: Use `FileInterceptor('file', { storage: diskStorage({...}), limits: { fileSize: 10_485_760 }, fileFilter })` directly on the controller action via NestJS interceptor decorator.

**Rationale**: Keeps validation co-located with the endpoint. Multer's `fileFilter` callback rejects unsupported MIME types before any body bytes are written to disk. The `limits.fileSize` option causes Multer to abort the stream and throw `MulterError('LIMIT_FILE_SIZE')` if the upload exceeds 10 MB.

**Alternatives considered**: Global Multer middleware (less granular; harder to reuse with different limits per endpoint); custom pipe (runs after the file is already received).

---

### 3. Error handling for constraint violations — NestJS exception filter

**Decision**: Catch `MulterError` in the controller and rethrow as `BadRequestException` with a user-friendly message.

**Rationale**: Multer errors are not NestJS `HttpException` instances, so the default exception filter returns 500 without intervention. A try/catch in the controller is the simplest fix that keeps the global filter intact.

**Alternatives considered**: Custom global exception filter for `MulterError` — overkill for a single endpoint; riskier to accidentally swallow other errors.

---

### 4. Database schema — separate `Attachment` entity, hard FK

**Decision**: `Attachment` entity with `@ManyToOne(() => Ticket)` hard FK (no soft-delete cascade).  Deletion of an attachment is independent of ticket lifecycle.

**Rationale**: Keeps the schema simple and query straightforward. If a ticket is deleted (soft), its attachment records remain but are orphaned harmlessly — acceptable for an assignment scope.

**Alternatives considered**: Polymorphic attachments (entity + entityId string) — premature for a ticket-only requirement; cascading on ticket soft-delete — spec doesn't require it.

---

### 5. File removal on DELETE — synchronous `fs.unlinkSync` inside service

**Decision**: When `DELETE /attachments/:id` is called, remove the file from disk synchronously before committing the DB delete.

**Rationale**: Simple and consistent for the assignment scope. If unlink fails (file already gone), swallow the `ENOENT` error and proceed with the DB delete — the record is the authoritative reference.

**Alternatives considered**: Async `fs.promises.unlink` — correct for production but adds error-handling complexity for no observable benefit here; soft-delete on `Attachment` — spec doesn't call for it.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| `./uploads/attachments/` not created on first boot | `fs.mkdirSync(dir, { recursive: true })` in the `AttachmentsService` constructor |
| Large file partially written then rejected | Multer `fileSize` limit aborts the stream before writing completes; temp file (if any) is cleaned up by Multer's disk storage |
| Filename collision despite UUID prefix | UUID v4 collision probability is astronomically low; acceptable for this scope |
| Orphaned files if DB write fails after disk write | Wrap in try/catch: if entity save throws, call `fs.unlinkSync` on the just-written path to clean up |
| No download endpoint — files accumulate indefinitely | Out of scope per the README contract; acceptable for assignment |
