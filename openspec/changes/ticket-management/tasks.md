## 1. Database Entity & Schema

- [x] 1.1 Create `src/tickets/ticket.entity.ts` with columns: `id`, `title`, `description`, `status` (enum default `TODO`), `priority` (enum), `type` (enum), `dueDate`, `isOverdue` (default `false`), `createdAt`, `version` (`@VersionColumn`)
- [x] 1.2 Add `@ManyToOne(() => Project)` relation with `projectId` FK column (eager: false)
- [x] 1.3 Add `@ManyToOne(() => User)` relation with `assigneeId` FK column (nullable, eager: false)
- [x] 1.4 Define `TicketStatus` enum (`TODO | IN_PROGRESS | IN_REVIEW | DONE`), `TicketPriority` enum (`LOW | MEDIUM | HIGH | CRITICAL`), and `TicketType` enum (`BUG | FEATURE | TASK`) in `src/tickets/enums/`

## 2. Data Transfer Objects

- [x] 2.1 Create `CreateTicketDto` with `title` (required), `description`, `status`, `priority` (required), `type` (required), `projectId` (required), `assigneeId` (optional), `dueDate` (optional) — use `class-validator` decorators
- [x] 2.2 Create `UpdateTicketDto` as `PartialType(CreateTicketDto)` excluding `projectId`; add optional `version: number` field

## 3. Core Service Logic

- [x] 3.1 Create `src/tickets/tickets.service.ts`; inject `TicketRepository`, `UsersService`, `ProjectsService`
- [x] 3.2 Implement `findAllByProject(projectId)`: query tickets for the given project; throw 400 if `projectId` is missing
- [x] 3.3 Implement `findOne(id)`: find ticket by id; throw `NotFoundException` if not found
- [x] 3.4 Implement `create(dto)`: validate `projectId` exists; apply auto-assignment if `assigneeId` absent (see 3.7); save and return ticket
- [x] 3.5 Implement `update(id, dto)`: load ticket; throw 400 if status is `DONE`; validate forward-only transition using the static map; catch `OptimisticLockVersionMismatchError` and throw 409; save and return updated ticket
- [x] 3.6 Implement `remove(id)`: find ticket (404 if not found); permanently delete and return 200
- [x] 3.7 Implement `autoAssign(projectId)` private method: query DEVELOPER users with fewest non-DONE tickets in the project; tie-break by `createdAt ASC`; return `userId | null`

## 4. REST Controller Routing

- [x] 4.1 Create `src/tickets/tickets.controller.ts`; apply `@UseGuards(JwtAuthGuard)` at class level
- [x] 4.2 Register `GET /tickets` → `findAllByProject` (query param `projectId`)
- [x] 4.3 Register `GET /tickets/:ticketId` → `findOne`
- [x] 4.4 Register `POST /tickets` → `create`
- [x] 4.5 Register `PATCH /tickets/:ticketId` → `update`
- [x] 4.6 Register `DELETE /tickets/:ticketId` → `remove`

## 5. Module Wiring & Auth Guarantees

- [x] 5.1 Create `src/tickets/tickets.module.ts`; declare entity in `TypeOrmModule.forFeature([Ticket])`; import `ProjectsModule` and `UsersModule`
- [x] 5.2 Register `TicketsModule` in `AppModule`
- [x] 5.3 Verify `RolesGuard` and `@Roles` decorator exist; if not, create `src/auth/roles.guard.ts` and `src/auth/roles.decorator.ts`

## 6. Unit Tests

- [x] 6.1 Write `src/tickets/tickets.service.spec.ts` covering: status forward transition valid/invalid, DONE immutability, optimistic lock conflict (mock `OptimisticLockVersionMismatchError`), auto-assignment with tie-break, auto-assignment with no DEVELOPERs
