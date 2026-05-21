## 1. Data Model — Self-Referential Relation on Ticket

- [x] 1.1 Add `blockers: Ticket[]` to the `Ticket` entity with `@ManyToMany(() => Ticket, ticket => ticket.blockingTickets)` and `@JoinTable({ name: 'ticket_blocker', joinColumn: { name: 'blocked_id' }, inverseJoinColumn: { name: 'blocker_id' } })`
- [x] 1.2 Add the inverse side `blockingTickets: Ticket[]` to `Ticket` with `@ManyToMany(() => Ticket, ticket => ticket.blockers)` (no `@JoinTable` here)
- [x] 1.3 Verify TypeORM `synchronize: true` creates `ticket_blocker(blocker_id, blocked_id)` with composite PK on app startup

## 2. Data Transfer Objects

- [x] 2.1 Create `src/dependencies/dto/create-dependency.dto.ts` with `blockerId: string` (UUID, required)
- [x] 2.2 Use `class-validator` decorators (`@IsUUID`, `@IsNotEmpty`) on the DTO

## 3. Core Service Logic

- [x] 3.1 Create `src/dependencies/dependencies.service.ts` and inject `Repository<Ticket>`
- [x] 3.2 Implement `addDependency(blockedId, blockerId, actorId)`: load both tickets (with `relations: ['blockers', 'project']`), validate existence, validate same project, reject self-block, reject duplicate (blocker already in `ticket.blockers`), run DFS cycle check, push `blocker` into `ticket.blockers`, save via repository, write AuditLog entry (`action = ADD_DEPENDENCY`)
- [x] 3.3 Implement DFS cycle-detection helper `wouldCreateCycle(startId, targetId, repo)`: load `blockers` of `startId`; if any blocker's id equals `targetId` return `true`; recurse into each blocker; return `false` if exhausted
- [x] 3.4 Implement `removeDependency(blockedId, blockerId, actorId)`: load `ticket` with `relations: ['blockers']`, find the blocker by id in `ticket.blockers`, throw `NotFoundException` if absent, splice it out, save, write AuditLog entry (`action = REMOVE_DEPENDENCY`)

## 4. REST Controller Routing

- [x] 4.1 Create `src/dependencies/dependencies.controller.ts` with `@Controller('tickets')` and `@UseGuards(AuthGuard('jwt'))`
- [x] 4.2 Add `@Post(':id/dependencies')` handler calling `dependenciesService.addDependency(params.id, body.blockerId, req.user.id)`
- [x] 4.3 Add `@Delete(':id/dependencies/:blockerId')` handler calling `dependenciesService.removeDependency(params.id, params.blockerId, req.user.id)`

## 5. Module Wiring & Auth Guarantees

- [x] 5.1 Create `src/dependencies/dependencies.module.ts`: import `TypeOrmModule.forFeature([Ticket])`, declare controller and service; no cross-module export needed
- [x] 5.2 Import `DependenciesModule` into `AppModule`

## 6. Blocker Guard in TicketsService

- [x] 6.1 In `TicketsService.updateTicket`, when the incoming status is `DONE`, reload the ticket with `relations: ['blockers']` and filter for any blocker whose `status !== 'DONE'`
- [x] 6.2 If unresolved blockers exist, throw `BadRequestException` listing their IDs; no new repository injection needed (`TicketsModule` already owns `Repository<Ticket>`)

## 7. AuditLog Integration

- [x] 7.1 Confirm `AuditLogService` is injectable in `DependenciesService`; add `AuditLogModule` to `DependenciesModule` imports if needed
- [x] 7.2 Verify `ADD_DEPENDENCY` and `REMOVE_DEPENDENCY` action strings are handled by the AuditLog schema (add to enum/union if necessary)

## 8. Unit Tests

- [x] 8.1 Create `src/dependencies/dependencies.service.spec.ts` covering: successful add, self-block rejection, cross-project rejection, duplicate rejection, direct cycle rejection, transitive cycle rejection, successful remove, not-found remove
- [x] 8.2 Add unit tests to `tickets.service.spec.ts` for the blocker guard: DONE blocked by unresolved blocker, DONE allowed when all blockers resolved, DONE allowed with no blockers
