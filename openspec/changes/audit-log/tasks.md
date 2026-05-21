## 1. Database Entity & Schema

- [x] 1.1 Create `src/audit-log/entities/audit-log.entity.ts` with columns: `id` (UUID PK), `action` (varchar), `entityType` (varchar), `entityId` (varchar), `performedBy` (varchar), `actor` (enum: USER | SYSTEM), `timestamp` (datetime, default NOW). Add index on `(entityType, entityId)`.
- [x] 1.2 Define `ActorType` enum (`USER | SYSTEM`) in `src/audit-log/enums/actor-type.enum.ts`.

## 2. Data Transfer Objects

- [x] 2.1 Create `src/audit-log/dto/record-audit-log.dto.ts` with fields: `action`, `entityType`, `entityId`, `performedBy`, `actor`.
- [x] 2.2 Create `src/audit-log/dto/query-audit-log.dto.ts` with optional fields: `entityType`, `entityId`, `action`, `actor`, `page` (default 1), `pageSize` (default 20).

## 3. Core Service Logic

- [x] 3.1 Create `src/audit-log/audit-log.service.ts` with `record(dto: RecordAuditLogDto): Promise<void>` — inserts one row; catches and logs errors without rethrowing.
- [x] 3.2 Add `findAll(query: QueryAuditLogDto)` to `AuditLogService` — builds a TypeORM `where` clause from provided filters, orders by `timestamp DESC`, returns `{ data, total, page }`.

## 4. REST Controller

- [x] 4.1 Create `src/audit-log/audit-log.controller.ts` with `GET /audit-logs` route, `@UseGuards(AuthGuard('jwt'))`, accepting `@Query() query: QueryAuditLogDto` and returning the paginated result from `AuditLogService.findAll()`.

## 5. Module Wiring

- [x] 5.1 Create `src/audit-log/audit-log.module.ts` as a `@Global()` module exporting `AuditLogService`; import `TypeOrmModule.forFeature([AuditLog])`.
- [x] 5.2 Import `AuditLogModule` into `AppModule`.

## 6. Integrate into Domain Services (USER-actor entries)

- [x] 6.1 Inject `AuditLogService` into `UsersService`; call `record()` with `actor = USER` after: create user, update user, delete user (if applicable).
- [x] 6.2 Inject `AuditLogService` into `ProjectsService`; call `record()` after: create, update, soft-delete, restore project.
- [x] 6.3 Inject `AuditLogService` into `TicketsService`; call `record()` after: create, update, soft-delete, restore ticket.
- [x] 6.4 Inject `AuditLogService` into `CommentsService`; call `record()` after: create, update, delete comment.
- [ ] 6.5 Inject `AuditLogService` into `AttachmentsService`; call `record()` after: upload and delete attachment. (AttachmentsModule not yet implemented — complete when module is added)
- [ ] 6.6 Inject `AuditLogService` into `DependenciesService`; call `record()` after: add and remove dependency. (DependenciesModule not yet implemented — complete when module is added)

## 7. SYSTEM-actor Entries

- [x] 7.1 In `TicketsService` auto-assignment logic: after assigning a developer, call `auditLogService.record({ action: 'AUTO_ASSIGN', entityType: 'Ticket', entityId: ticket.id, performedBy: 'SYSTEM', actor: ActorType.SYSTEM })`.
- [ ] 7.2 In `SchedulerService` (auto-escalation job): after each priority promotion or `isOverdue` set, call `auditLogService.record({ action: 'ESCALATE', entityType: 'Ticket', entityId: ticket.id, performedBy: 'SYSTEM', actor: ActorType.SYSTEM })`. (SchedulerModule not yet implemented — complete when module is added)

## 8. Tests

- [x] 8.1 Write unit tests for `AuditLogService.record()` — verifies repository `save()` is called with correct data.
- [x] 8.2 Write unit tests for `AuditLogService.findAll()` — verifies filter conditions are applied and pagination metadata is correct.
- [x] 8.3 Write E2E test for `GET /audit-logs` — authenticated request returns 200 with paginated shape; unauthenticated returns 401.
- [x] 8.4 Write E2E test verifying AUTO_ASSIGN audit entry is written when a ticket is created without assigneeId.
- [x] 8.5 Write E2E test verifying ESCALATE audit entry is written when the escalation job is manually triggered.
