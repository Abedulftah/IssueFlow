## 1. Database Entity & Schema

- [x] 1.1 Create `src/comments/comment.entity.ts` — `@Entity('comments')` with `id` (PK), `content` (text), `version` (`@VersionColumn`), `createdAt`, `updatedAt`; `@ManyToOne(() => Ticket, { nullable: false })` via `ticketId`; `@ManyToOne(() => User, { nullable: false })` via `authorId`

## 2. Data Transfer Objects (DTOs)

- [x] 2.1 Create `src/comments/dto/create-comment.dto.ts` — `authorId: number` (`@IsInt()`), `content: string` (`@IsString()`, `@IsNotEmpty()`)
- [x] 2.2 Create `src/comments/dto/update-comment.dto.ts` — `content: string` (`@IsString()`, `@IsNotEmpty()`)

## 3. Core Service Logic

- [x] 3.1 Create `CommentsService` injecting `CommentRepository`, `TicketRepository`, `AuditLogService`
- [x] 3.2 Implement `findAllByTicket(ticketId)` — verify ticket exists (404); return all comments for that ticket
- [x] 3.3 Implement `create(ticketId, dto)` — verify ticket exists (404); save `Comment`; write AuditLog `CREATE COMMENT`; return saved comment
- [x] 3.4 Implement `update(ticketId, commentId, dto)` — verify ticket + comment exist (404); save updated `content` (catch `OptimisticLockVersionMismatchError` → 409); write AuditLog `UPDATE COMMENT`
- [x] 3.5 Implement `remove(ticketId, commentId)` — verify ticket + comment exist (404); delete `Comment`; write AuditLog `DELETE COMMENT`

## 4. REST Controller Routing

- [x] 4.1 Create `CommentsController` at `@Controller('tickets/:ticketId/comments')` with `@UseGuards(JwtAuthGuard)`: `@Get()`, `@Post()`, `@Patch(':commentId')`, `@Delete(':commentId')`

## 5. Module Wiring

- [x] 5.1 Create `CommentsModule` — `imports: [TypeOrmModule.forFeature([Comment]), TicketsModule, UsersModule, AuditLogModule]`; `controllers: [CommentsController]`; `providers: [CommentsService]`
- [x] 5.2 Register `CommentsModule` in `AppModule`
- [x] 5.3 Write unit tests in `src/comments/comments.service.spec.ts`: create on valid ticket, create on missing ticket → 404, concurrent update → 409
