## 1. Database Entity & Schema

- [x] 1.1 Create `src/attachments/attachment.entity.ts` with columns: `id` (uuid PK), `originalName` (varchar), `mimeType` (varchar), `size` (int), `storagePath` (varchar), `ticketId` (FK → tickets), `createdAt` (timestamp)
- [x] 1.2 Add `@ManyToOne(() => Ticket, { onDelete: 'CASCADE' })` relation on `Attachment` and import `Attachment` into `TicketsModule` entity list if needed
- [x] 1.3 Add `Attachment` to the TypeORM `entities` array in `AppModule` (or the data-source config) so `synchronize: true` creates the table on next start

## 2. Data Transfer Objects

- [x] 2.1 Create `src/attachments/dto/attachment-response.dto.ts` with fields: `id`, `originalName`, `mimeType`, `size`, `storagePath`, `ticketId`
- [x] 2.2 No request body DTO needed for upload (file comes via Multer `Express.Multer.File`); document this in a comment at the controller action

## 3. Core Service Logic

- [x] 3.1 Create `src/attachments/attachments.service.ts`; in the constructor call `fs.mkdirSync('./uploads/attachments', { recursive: true })` to guarantee the directory exists
- [x] 3.2 Implement `create(ticketId, file: Express.Multer.File)`: verify the ticket exists (throw 404 if not), build the `storagePath`, save the `Attachment` entity; on DB error, call `fs.unlinkSync(storagePath)` before re-throwing
- [x] 3.3 Implement `remove(id)`: find the `Attachment` record (throw 404 if not found), call `fs.unlinkSync(storagePath)` with a try/catch that ignores `ENOENT`, then delete the record
- [x] 3.4 Inject `AuditLogService` and emit entries: `action = 'UPLOAD'` in `create` and `action = 'DELETE'` in `remove`, both with `entityType = 'ATTACHMENT'`, `actor = USER`

## 4. REST Controller & Multer Configuration

- [x] 4.1 Create `src/attachments/attachments.controller.ts` with `@UseGuards(AuthGuard('jwt'))` at class level
- [x] 4.2 Add `POST /tickets/:ticketId/attachments` action using `@UseInterceptors(FileInterceptor('file', multerOptions))` where `multerOptions` configures `diskStorage` (destination `./uploads/attachments`, filename `<uuid>-<originalname>`), `limits: { fileSize: 10_485_760 }`, and a `fileFilter` that calls `cb(new BadRequestException('File type not allowed'), false)` for disallowed MIME types
- [x] 4.3 In the upload action, wrap the call to `attachmentsService.create(...)` in a try/catch; catch `MulterError` with code `LIMIT_FILE_SIZE` and rethrow as `BadRequestException('File too large. Maximum size is 10 MB')`
- [x] 4.4 Add `DELETE /attachments/:id` action that calls `attachmentsService.remove(id)` and returns HTTP 200

## 5. Module Wiring & Auth Guarantees

- [x] 5.1 Create `src/attachments/attachments.module.ts` importing `TypeOrmModule.forFeature([Attachment])`, `TicketsModule` (or `TypeOrmModule.forFeature([Ticket])` if circular), and `AuditLogModule`
- [x] 5.2 Register `AttachmentsModule` in `AppModule` imports array
- [x] 5.3 Ensure `@types/multer` is installed (`npm i -D @types/multer`) so `Express.Multer.File` resolves without TS errors
- [x] 5.4 Add `uploads/` to `.gitignore` so uploaded files are not committed

## 6. Verification

- [x] 6.1 Start the app (`npm run start:dev`) and confirm no TypeORM / Multer startup errors
- [x] 6.2 Upload a valid PNG via `curl -F "file=@test.png" -H "Authorization: Bearer <token>" http://localhost:3000/tickets/<id>/attachments` and verify a row appears in the `attachments` table and the file exists under `./uploads/attachments/`
- [x] 6.3 Upload a disallowed file type (e.g., `.gif`) and verify the response is HTTP 400
- [x] 6.4 Upload a file > 10 MB and verify the response is HTTP 400
- [x] 6.5 Delete the uploaded attachment via `DELETE /attachments/:id` and verify the row is gone and the file is removed from disk
- [x] 6.6 Confirm AuditLog rows are created for both upload and delete actions
