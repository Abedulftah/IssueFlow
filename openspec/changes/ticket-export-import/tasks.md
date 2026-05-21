## 1. CSV Utility Helper

- [x] 1.1 Create `src/tickets/csv.util.ts` with a `toCsvRow(fields: string[]): string` function that wraps each field in double-quotes and escapes inner `"` as `""`
- [x] 1.2 Add `parseCsv(content: string): Record<string, string>[]` to `csv.util.ts` that splits lines, maps header columns to values, and returns an array of row objects (skipping blank lines)

## 2. DTOs

- [x] 2.1 Create `ExportTicketsQueryDto` in `src/tickets/dto/export-tickets-query.dto.ts` with a required `projectId: string` field (validated with `class-validator`)
- [x] 2.2 Create `ImportTicketsDto` in `src/tickets/dto/import-tickets.dto.ts` with a required `projectId: string` field (for the form field; file handled by Multer interceptor)
- [x] 2.3 Create `ImportResultDto` in `src/tickets/dto/import-result.dto.ts` with `created: number`, `failed: number`, `errors: Array<{ row: number; error: string }>`

## 3. Service — Export Logic

- [x] 3.1 Add `exportToCsv(projectId: string): Promise<string>` to `TicketsService`
- [x] 3.2 In `exportToCsv`: verify project exists and is not soft-deleted (throw `NotFoundException` if not)
- [x] 3.3 In `exportToCsv`: query all non-deleted tickets for the project, map each to a CSV row using `toCsvRow`, prepend the header row, and return the joined string

## 4. Service — Import Logic

- [x] 4.1 Add `importFromCsv(projectId: string, fileBuffer: Buffer): Promise<ImportResultDto>` to `TicketsService`
- [x] 4.2 In `importFromCsv`: verify project exists and is not soft-deleted (throw `NotFoundException` if not)
- [x] 4.3 In `importFromCsv`: call `parseCsv` on the buffer's UTF-8 string to get row objects
- [x] 4.4 In `importFromCsv`: iterate rows; for each row validate `title` is non-empty (collect error and continue if missing)
- [x] 4.5 In `importFromCsv`: apply defaults — `status = TODO` if blank, `priority = LOW` if blank, `dueDate = null` if blank
- [x] 4.6 In `importFromCsv`: call the existing `autoAssign` helper when `assigneeId` is blank
- [x] 4.7 In `importFromCsv`: insert the ticket entity and write an AuditLog entry (`action = IMPORT`, `actor = SYSTEM`) in a single `EntityManager` transaction per row
- [x] 4.8 In `importFromCsv`: accumulate `created` / `failed` counts and `errors` array; return `ImportResultDto`

## 5. Controller — Export & Import Endpoints

- [x] 5.1 Add `GET /tickets/export` action to `TicketsController` with `@Query()` bound to `ExportTicketsQueryDto`; set `Content-Type: text/csv` and `Content-Disposition: attachment; filename="tickets.csv"` on the `Response` object; write the CSV string and end the response
- [x] 5.2 Add `POST /tickets/import` action to `TicketsController` with `@UseInterceptors(FileInterceptor('file'))` (memoryStorage, limits: `{ fileSize: 10 * 1024 * 1024 }`, fileFilter rejects non-`text/csv`/`text/plain` MIME types with HTTP 400)
- [x] 5.3 In the import action: extract `projectId` from `@Body()` and `file` from `@UploadedFile()`; validate file is present (400 if not); call `importFromCsv` and return the result
- [x] 5.4 Ensure both endpoints are covered by the JWT `AuthGuard` (verify `@UseGuards(AuthGuard('jwt'))` is applied at controller or action level)

## 6. Module Wiring

- [x] 6.1 Confirm `AuditLogModule` is imported into `TicketsModule` so `AuditLogService` can be injected into `TicketsService` (add to `imports` array if missing)
- [x] 6.2 Confirm `MulterModule` or the `FileInterceptor` import is available in `TicketsModule` (add `MulterModule.register({ storage: memoryStorage() })` to `TicketsModule.imports` if not already present)

## 7. Tests

- [x] 7.1 Add unit tests for `toCsvRow` and `parseCsv` in `src/tickets/csv.util.spec.ts` covering: normal row, field with comma, field with double-quote, empty field, blank lines ignored
- [x] 7.2 Add unit tests for `TicketsService.exportToCsv` in `src/tickets/tickets.service.spec.ts`: project not found → 404, empty project → header only, tickets present → correct rows
- [x] 7.3 Add unit tests for `TicketsService.importFromCsv`: project not found → 404, all rows valid → correct counts, row missing title → counted in failed, auto-assignment called when assigneeId blank
- [x] 7.4 Add E2E tests in `test/tickets.e2e-spec.ts` for `GET /tickets/export`: 401 without token, 404 unknown project, 200 CSV response with correct headers and body
- [x] 7.5 Add E2E tests in `test/tickets.e2e-spec.ts` for `POST /tickets/import`: 401 without token, 400 wrong MIME type, 404 unknown project, 200 partial success with errors array
