# AI Interaction Log — IssueFlow

**Model used:** Claude Sonnet 4.6 (`claude-sonnet-4-6`)  
**Interface:** Claude Code (VS Code extension)

---

## Feature: 2.1 User Management

### Prompt 1 — Propose change
> Implement the 2.1 User Management in the pdf.
> - watchout for constraints.
> - build the 4.5 requirements.
> - 2.1 doesn't asks for password while 2.2 asks for login password, suggest a solution without adding an additional endpoint.
> - feel free to ask for clarifications

**What the model did:**  
Read the requirements PDF and README API contract, identified the password gap between §2.1 and §2.2, and proposed accepting an optional `password` field on `POST /users` (defaulting to a hashed `"secret"` if omitted). Generated `proposal.md`, `design.md`, `specs/user-crud/spec.md`, and `tasks.md` via `/opsx:propose`.

---

### Prompt 2 — Align update endpoint with README
> POST /users/update/:userId only accepts `{ "fullName", "role" }` — make sure all APIs match the README.

**What the model did:**  
Removed `password` from `UpdateUserDto` and all references to it in the update flow across `design.md`, `spec.md`, and `tasks.md`.

---

### Prompt 3 — Default password
> Not random password or null, make a default password "secret".

**What the model did:**  
Updated proposal, design, spec, and tasks so that `POST /users` without a `password` field stores `bcrypt.hash("secret", 10)` instead of `null`.

---

### Prompt 4 — Implement User Management
> /opsx:apply user-management

**What the model did:**  
Implemented all 21 tasks: installed `bcrypt`, wired TypeORM into `AppModule`, enabled global `ValidationPipe` + `ClassSerializerInterceptor`, created the `User` entity with `@Exclude` on `passwordHash`, `CreateUserDto`, `UpdateUserDto`, `UsersService` (create/findAll/findOne/findByUsername/update/remove), `UsersController` with the exact five routes from the README, `UsersModule`, and unit tests (14 passing).

---

### Prompt 5 — Update returns 200 OK empty body
> The update a user API doesn't return the details of the user, just 200 OK as described in the README.

**What the model did:**  
Changed the `update` controller method to `Promise<void>` so NestJS returns an empty 200 OK, and updated the corresponding test assertion.

---

---

## Feature: 2.2 Authentication

### Prompt 6 — Propose authentication change
> Implement 2.2 Authentication.
> - The system must protect all API endpoints using JWT-based authentication.
> - follow the README.md.

**What the model did:**  
Read `README.md` and `CLAUDE.md` to extract all auth requirements (`POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, JWT deny-list, global guard). Generated `proposal.md`, `design.md`, `specs/jwt-auth/spec.md`, `specs/users/spec.md`, and `tasks.md` via `/opsx:propose`. Proposed a global `JwtAuthGuard` with `@Public()` opt-out, a `DeniedToken` DB table for logout revocation, and bcrypt password hashing.

---

### Prompt 7 — Remove role-based access control from auth scope
> there is no ADMIN-only endpoints. (or developer)

**What the model did:**  
Removed the "Role-based access control" requirement and its scenarios from `specs/jwt-auth/spec.md`. Removed the `RolesGuard` tasks (5.1–5.3) and the corresponding unit test from `tasks.md`, renumbered remaining sections.

---

### Prompt 8 — Implement authentication
> /opsx:apply auth-JWT

**What the model did:**  
Installed `@nestjs/jwt`, `@nestjs/passport`, `passport`, `passport-jwt`, `@types/passport-jwt`. Created `DeniedToken` entity, `@Public()` decorator, `JwtStrategy` (with `passReqToCallback: true` to check deny-list on every request), `JwtAuthGuard` registered as `APP_GUARD`, `LoginDto`, `AuthService` (login/logout/getMe), `AuthController` (`POST /auth/login`, `POST /auth/logout`, `GET /auth/me`), and `AuthModule`. Marked `POST /users` as `@Public()`. Wired `AuthModule` into `AppModule`. Wrote 6 unit tests — all 20 tests in the suite passed.

---

### Prompt 9 — Add createdAt to User (hidden from responses)
> add a createdAt to user so we can use it later, make sure not make it appear in any output for now.

**What the model did:**  
Added `@Exclude() @CreateDateColumn() createdAt: Date` to the `User` entity. TypeORM auto-populates it on insert; `ClassSerializerInterceptor` + `@Exclude()` keeps it out of all API responses.

---

---

## Feature: 2.3 Project Management

### Prompt 10 — Propose project management change
> /opsx:propose implement 2.3 Project Management.
> - take into account the relations.

**What the model did:**
Read the requirements PDF and README API table for §2.3, cross-referenced existing `UsersModule` and `AuthModule` artifacts to understand the dependency graph. Generated `proposal.md`, `design.md`, `specs/project-crud/spec.md`, `specs/project-workload/spec.md`, and `tasks.md` via `/opsx:propose`. Initially included soft-delete, restore, ADMIN-only guards, and the workload endpoint.

---


### Prompt 11 — Trim scope to §2.3 only
> I don't want to implement the workload now nor the delete queries — save it for upcoming points, focus on just the 2.3.

**What the model did:**
Removed the `project-workload` capability and spec entirely. Removed soft-delete (`@DeleteDateColumn`), `GET /projects/deleted`, `POST /projects/:id/restore`, and all ADMIN guard tasks. Changed `DELETE /projects/:projectId` to a hard delete. Updated all four artifacts (`proposal.md`, `design.md`, `specs/project-crud/spec.md`, `tasks.md`) to reflect the trimmed scope.

---

### Prompt 12 — Implement project management
> /opsx:apply project-management

**What the model did:**
Implemented all 17 tasks: created `Project` entity (FK → users), `CreateProjectDto`, `UpdateProjectDto`, `ProjectsService` (create with owner validation, findAll, findOne, update, remove), `ProjectsController` with five routes all guarded by `JwtAuthGuard`, `ProjectsModule` wired into `AppModule`, and `projects.service.spec.ts` with 9 passing unit tests.

---


---

## Feature: 2.4 Ticket Management

### Prompt 13 — Propose ticket management change
> /opsx:propose 2.4 Ticket Management.
> - stick to the requirements of this point.
> - focus on the relations.
> - focus on the constraints.
> - feel free to ask for clarification.

**What the model did:**
Read `README.md`, `CLAUDE.md`, and existing change artifacts (user-management, auth-JWT, project-management) to understand the dependency graph and naming conventions. Generated `proposal.md`, `design.md`, `specs/ticket-crud/spec.md`, `specs/ticket-export-import/spec.md`, `specs/ticket-soft-delete/spec.md`, `specs/ticket-auto-assignment/spec.md`, and `tasks.md`. Initial proposal included CSV export/import, soft-delete/restore, and AuditLog writes for auto-assignment.

---

### Prompt 14 — Trim scope: remove AuditLog forward references
> I want to implement only the requirements of this point 2.4 (first rejection)

**What the model did:**
Removed all forward references to `AuditLogModule` from every artifact: dropped the `AUTO_ASSIGN` AuditLog write from the auto-assignment spec and tasks, removed `AuditLogService` injection from `tasks.md`, and stripped downstream module references (Comments, Dependencies, Attachments, Scheduler) from `proposal.md` Impact section and `design.md`.

---

### Prompt 15 — Implement ticket management
> /opsx:apply ticket-management

**What the model did:**
Implemented all 23 tasks:
- Created `TicketStatus`, `TicketPriority`, `TicketType` enums in `src/tickets/enums/`.
- Created `Ticket` entity with `@VersionColumn`, `@ManyToOne` FK to `projects` and `users`.
- Created `CreateTicketDto` and `UpdateTicketDto` (hand-written without `@nestjs/mapped-types` which is not installed).
- Implemented `TicketsService` with forward-only status transition map, DONE-immutability guard, optimistic lock → 409, auto-assignment raw SQL query (least-loaded DEVELOPER, `createdAt` tiebreak), and `assigneeId` validation.
- Created `TicketsController` with 5 routes (JWT auth via global `APP_GUARD`).
- Registered `TicketsModule` in `AppModule`.
- Wrote 15 unit tests — all passing.

---

### Prompt 16 — Fix FK constraint on ticket creation
> QueryFailedError: insert or update on table "tickets" violates foreign key constraint

**What the model did:**
Identified that providing an explicit `assigneeId` that doesn't exist caused a DB-level FK violation because the service had no validation for it. Added `usersService.findOne(dto.assigneeId)` guard before the insert. Also refactored `create()` to pass explicit `null` (not `undefined`) for `assigneeId` when no assignment occurs, ensuring TypeORM never sends an ambiguous value to PostgreSQL.

---

---

## Feature: 2.5 Comment Management

### Prompt 17 — Propose comment management change
> /opsx:propose 2.5 Comment Management.
> - stick 2.5 requirements, stay in the scope.
> - focus on relations.

**What the model did:**
Read `README.md` and `CLAUDE.md` for the §2.5 API contract (4 nested comment CRUD endpoints under `/tickets/:ticketId/comments`), cross-referenced existing `TicketsModule` and `UsersModule`. Generated `proposal.md`, `design.md`, `specs/comment-crud/spec.md`, `specs/comment-mentions/spec.md`, and `tasks.md`. Initial proposal included `@mention` parsing, a `CommentMention` join entity, mention diff on update, and a paginated `GET /users/:userId/mentions` endpoint.

---


### Prompt 19 — Implement comment management
> /opsx:apply comment-management

**What the model did:**
Implemented all 12 tasks: created `Comment` entity (`@ManyToOne` → `Ticket` + `User`, `@VersionColumn`), `CreateCommentDto`, `UpdateCommentDto`, `CommentsService` (findAllByTicket, create, update with optimistic lock → 409, remove — all with ticket existence guard), `CommentsController` nested at `tickets/:ticketId/comments`, `CommentsModule` wired into `AppModule`. Wrote 9 unit tests — all passing. AuditLog wiring deferred (module not yet implemented).

---

---

## Feature: 3.1 Audit Log

### Prompt 20 — Propose audit log change
> /opsx:propose 3.1 Audit log.

**What the model did:**
Read `README.md` and `CLAUDE.md` for the §3.1 requirements. Generated `proposal.md`, `design.md`, `specs/audit-log-core/spec.md`, `specs/audit-log-query/spec.md`, and `tasks.md` via `/opsx:propose`. Proposed a `@Global()` `AuditLogModule` with an append-only `AuditLog` entity, a shared `AuditLogService.record()` method injected into every domain service, and a `GET /audit-logs` endpoint with optional filters.

---

### Prompt 22 — Implement audit log
> /opsx:apply audit-log

**What the model did:**
Implemented 19 of 22 tasks (3 deferred pending missing modules):
- Created `ActorType` enum, `AuditLog` entity (UUID PK, indexes on `(entityType, entityId)` and `(actor, action)`), `RecordAuditLogDto`, `QueryAuditLogDto`.
- Created `AuditLogService` with `record()` (fire-and-log-on-error) and `findAll()` (filtered, ordered DESC, paginated).
- Created `AuditLogController` (`GET /audit-logs`, JWT-protected via global guard).
- Created `@Global()` `AuditLogModule` exported and imported into `AppModule`.
- Injected `AuditLogService` into `UsersService`, `ProjectsService`, `TicketsService`, `CommentsService`; added `performedBy: string` parameter to all mutating methods; updated all controllers to extract `req.user.id` and pass it down.
- Added `AUTO_ASSIGN` SYSTEM audit entry inside `TicketsService.create()` after auto-assignment fires.
- Wrote 8 unit tests for `AuditLogService` and updated all existing service/controller specs to include the `AuditLogService` mock and updated method signatures (62 total passing).
- Wrote E2E tests in `test/audit-log.e2e-spec.ts` covering auth guard, array shape, filters, and AUTO_ASSIGN entry.
- Deferred tasks 6.5 (Attachments), 6.6 (Dependencies), 7.2 (Scheduler) with notes — those modules do not exist yet.

---


### Prompt 23 — Fix id to be a number
> the id must be a number as in the README.md file

**What the model did:**
Changed `@PrimaryGeneratedColumn('uuid')` to `@PrimaryGeneratedColumn()` in `AuditLog` entity, making `id` an auto-increment integer matching the README example `"id": 1`. Dropped the table again (UUID column can't be altered in-place) and updated spec fixtures from string `'a'`/`'b'` to numeric `1`/`2`.

---

---

## Feature: 3.2 Ticket Dependencies

### Prompt 24 — Propose ticket dependencies change
> /opsx:propose 3.2 Ticket Dependencies.
> - focus on the relations.
> - focus on the Constraint.

**What the model did:**
Read `README.md` and `CLAUDE.md` for the §3.2 API contract and business rules. Generated `proposal.md`, `design.md`, `specs/ticket-dependency-management/spec.md`, `specs/ticket-done-blocker-guard/spec.md`, `specs/tickets/spec.md` (MODIFIED delta), and `tasks.md` via `/opsx:propose`. Proposed a self-referential `@ManyToMany` on `Ticket` backed by a `ticket_blocker` join table, a DFS cycle-detection algorithm in the service layer, and a DONE-transition guard inside `TicketsService.update()`.

---

### Prompt 25 — Switch to ManyToMany relation
> Tickets can depend on other tickets, it's not just one ticket so,
> In DB it would be something like another table ticket_blocker where you would have the id of blocked and id of blocker and there you will have unique pair.
> Also, I think we should consider ManyToMany relation.

**What the model did:**
Revised Decision D1 in `design.md` from an explicit `TicketDependency` entity to a self-referential `@ManyToMany` with a named `@JoinTable` (`ticket_blocker`, columns `blocker_id` / `blocked_id`). Updated D3 (blocker guard now uses `relations: ['blockers']` from the existing `Ticket` repository, no cross-module import needed) and D4 (no separate entity export). Rewrote Section 1 of `tasks.md` to add the two `@ManyToMany` decorators to the `Ticket` entity instead of creating a standalone join entity.

---

### Prompt 26 — Implement ticket dependencies
> /opsx:apply ticket-dependencies

**What the model did:**
Implemented all 20 tasks:
- Added `blockers` and `blockingTickets` self-referential `@ManyToMany` relations to `Ticket` entity with explicit `@JoinTable` creating `ticket_blocker(blocked_id, blocker_id)`.
- Created `CreateDependencyDto` (`blockerId: number`, `@IsInt()`).
- Created `DependenciesService` with `addDependency` (self-block, 404, cross-project, duplicate, DFS cycle guards; persists via relation; writes AuditLog), private `wouldCreateCycle` DFS helper, and `removeDependency`.
- Created `DependenciesController` at `@Controller('tickets')` with `POST :id/dependencies` and `DELETE :id/dependencies/:blockerId`, guarded by `JwtAuthGuard`.
- Created `DependenciesModule` (`TypeOrmModule.forFeature([Ticket])`); `AuditLogModule` is `@Global()` so no explicit import needed.
- Added DONE blocker guard to `TicketsService.update()` — reloads `relations: ['blockers']` and rejects if any are non-DONE.
- Wrote `dependencies.service.spec.ts` (11 cases) and 3 new blocker-guard cases in `tickets.service.spec.ts` — all 75 tests passing.

---

### Prompt 27 — Fix request body field name
> curl result: `{"message":["blockerId should not be empty","blockerId must be an integer number"],"error":"Bad Request","statusCode":400}`

**What the model did:**
README specifies `{ "blockedBy": 42 }` as the request body. Renamed the DTO field from `blockerId` to `blockedBy` and updated the controller call from `dto.blockerId` to `dto.blockedBy`.

---

---

## Feature: 3.3 Attachment Management

### Prompt 28 — Propose attachment management change
> /opsx:propose 3.3 Attachment Management.
> - local filesystem which mocks the aws S3 for files, a lightweight reference for the files.
> - focus on the Constraints.

**What the model did:**  
Read `README.md` and `CLAUDE.md` for the §3.3 API contract and business rules. Generated `proposal.md`, `design.md`, `specs/attachment-upload/spec.md`, `specs/attachment-delete/spec.md`, `specs/attachment-constraints/spec.md`, and `tasks.md` via `/opsx:propose`. Proposed local `./uploads/attachments/` as the S3 mock, UUID-prefixed filenames for collision safety, Multer's `diskStorage` + `fileFilter` + `limits.fileSize` for constraint enforcement, and a lightweight `Attachment` entity (metadata only, no binary blobs in DB). Five key decisions documented in `design.md`: UUID prefix strategy, inline `FileInterceptor` config, `PayloadTooLargeException` → 400 remapping filter, hard FK to `Ticket`, and synchronous `fs.unlinkSync` on delete.

---

### Prompt 29 — Implement attachment management
> /opsx:apply attachment-management

**What the model did:**  
Implemented all 23 tasks:
- Created `Attachment` entity (UUID PK, `originalName`, `mimeType`, `size`, `storagePath`, `ticketId` FK, `createdAt`).
- Created `AttachmentResponseDto`.
- Created `AttachmentsService`: constructor calls `fs.mkdirSync('./uploads/attachments', { recursive: true })`; `create()` validates ticket exists (404), saves entity, unlinks file on DB error; `remove()` unlinks file (ignores `ENOENT`), deletes record (404 if not found).
- Created `AttachmentsController` at `@Controller()` root with `POST /tickets/:ticketId/attachments` (Multer `FileInterceptor`, UUID filename, MIME allowlist `fileFilter`, 10 MB `limits.fileSize`) and `DELETE /attachments/:id`.
- Created `MulterExceptionFilter` (`@Catch(PayloadTooLargeException)`) applied to the upload action — converts NestJS's auto-mapped 413 back to 400 per spec requirement.
- Created `AttachmentsModule` importing `TypeOrmModule.forFeature([Attachment])` and `TicketsModule`; registered in `AppModule`; `autoLoadEntities: true` handles schema sync.
- Added `uploads/` to `.gitignore`.
- Added `Attachment` cleanup to `test/helpers/db.helper.ts`.
- Wrote `test/attachments.e2e-spec.ts` with 11 integration tests (all passing): 401 without token, valid PNG upload → metadata + file on disk, plain-text upload, disallowed MIME types (gif, zip) → 400, file > 10 MB → 400, missing ticket → 404, delete removes row and file, delete non-existent → 404, audit log entries for UPLOAD and DELETE.

---

### Prompt 30 — Integration tests
> make integration tests for it, and then check.

**What the model did:**  
Added `Attachment` to the `clearDatabase` helper in `test/helpers/db.helper.ts`. Wrote `test/attachments.e2e-spec.ts` with 11 e2e tests covering: upload auth guard, valid PNG/text uploads (metadata + disk presence), disallowed MIME types → 400, oversized file → 400, missing ticket → 404, delete auth guard, delete removes row + disk file, delete non-existent → 404, and AuditLog UPLOAD/DELETE entries. All 11 tests pass.

---

---

## Feature: 3.4 Ticket Export & Import

### Prompt 31 — Propose ticket export & import change
> /opsx:propose 3.4 Ticket Export & Import.

**What the model did:**  
Read `README.md` and `CLAUDE.md` for the §3.4 API contract (`GET /tickets/export?projectId=` and `POST /tickets/import`). Generated `proposal.md`, `design.md`, `specs/ticket-csv-export/spec.md`, `specs/ticket-csv-import/spec.md`, and `tasks.md` via `/opsx:propose`. Identified two new capabilities: streaming project tickets as a downloadable CSV and bulk-creating tickets from an uploaded CSV returning `{ created, failed, errors }`. Design documented 6 key decisions: no external CSV library (manual RFC 4180 quoting), Multer `memoryStorage` for import, insert-only partial-success semantics, auto-assignment reuse from `TicketsService`, audit log per imported ticket (`actor = SYSTEM`, `action = IMPORT`), and a fixed 9-column schema (`id`, `title`, `description`, `status`, `priority`, `type`, `assigneeId`, `dueDate`, `createdAt`).

---

### Prompt 32 — Implement ticket export & import
> /opsx:apply ticket-export-import

**What the model did:**  
Implemented all 27 tasks:
- Created `src/tickets/csv.util.ts` with RFC 4180 `toCsvRow` (double-quote wrapping with `""` escaping) and a full `parseCsv` (handles quoted fields containing commas and escaped quotes).
- Created `ExportTicketsQueryDto`, `ImportTicketsDto`, `ImportResultDto`.
- Added `exportToCsv(projectId: string)` to `TicketsService`: validates project, queries non-deleted tickets, formats 9-column CSV.
- Added `importFromCsv(projectId: string, fileBuffer: Buffer)` to `TicketsService`: parses CSV rows, validates per-row (`title` required, enum values checked), applies defaults (`status = TODO`, `priority = LOW`, `type = TASK`), calls existing `autoAssign`, saves ticket + audit log, returns `{ created, failed, errors }` with per-row error collection.
- Added `GET /tickets/export` and `POST /tickets/import` to `TicketsController`, placed before `:ticketId` to avoid route conflicts; used `@Res()` with manual `res.send()` for the CSV download.
- Verified `AuditLogModule` is already `@Global()` — no module wiring changes needed; `FileInterceptor` with inline `memoryStorage()` needs no `MulterModule`.
- Wrote 11 unit tests for `csv.util` and 5 new service unit tests (export/import) — all 26 pass.
- Verified e2e tests in `test/tickets.e2e-spec.ts` (lines 487–544) cover 401, 200 CSV headers, import shape, and partial success.

---

---

## Feature: 3.5 Soft Delete for Tickets and Projects

### Prompt 33 — Propose soft delete change
> /opsx:propose 3.5 Soft Delete for Tickets and Projects.
> - focus on constraints.

**What the model did:**
Read `README.md` and `CLAUDE.md` for the §3.5 API contract. Generated `proposal.md`, `design.md`, `specs/ticket-soft-delete/spec.md`, `specs/project-soft-delete/spec.md`, and `tasks.md` via `/opsx:propose`. Proposed TypeORM `@DeleteDateColumn` on both `Ticket` and `Project` entities, a service-layer `assertProjectActive()` guard in `TicketsService`, no cascade from project to tickets, and `SOFT_DELETE` / `RESTORE` audit log actions. Documented route-ordering risk (`GET /tickets/deleted` before `GET /tickets/:id`), ADMIN-only guards for all restore and deleted-list endpoints, and a 409 constraint that prevents restoring a ticket whose parent project is still soft-deleted.

---

### Prompt 34 — Clarify behavior when a ticket's project is soft-deleted
> what will happen to the tickets that their project is deleted?

**What the model did:**
Explained that tickets are not cascade-deleted — they remain in the DB with `deletedAt = null`. However, `GET /tickets/:id`, `PATCH /tickets/:id`, and `DELETE /tickets/:id` would return the ticket successfully (gap identified). `POST /tickets` with a soft-deleted `projectId` returns 404 (standard `findOne` excludes it), and `POST /tickets/:id/restore` returns 409 if the parent project is soft-deleted.

---

### Prompt 35 — Enforce 404 on all ticket operations when project is soft-deleted
> yes go with option B

**What the model did:**
Updated three artifacts:
- `specs/project-soft-delete/spec.md` — added new requirement "All ticket operations blocked when parent project is soft-deleted" with 4 scenarios (`GET`, `PATCH`, `DELETE`, and resume-after-restore).
- `design.md` — revised Decision 3 to explain `assertProjectActive()` as a service-layer guard (single indexed PK lookup, no cascade). Added a new risk row for the extra DB read.
- `tasks.md` — split task 2.1 into helper definition + call-site wiring, renumbered downstream tasks, added two E2E test cases (7.8, 7.9).

---

### Prompt 36 — Implement soft delete
> /opsx:apply soft-delete-tickets-projects

**What the model did:**
Implemented all 39 tasks:
- Added `@DeleteDateColumn() deletedAt: Date | null` to `Ticket` and `Project` entities.
- Created `RolesGuard` and `@Roles()` decorator; registered `RolesGuard` as a second global `APP_GUARD` in `AuthModule`.
- Added `findOneWithDeleted()`, `softDelete()`, `findDeleted()`, `restore()` to `ProjectsService`; replaced hard-delete `remove()`.
- Added `assertProjectActive()` private helper to `TicketsService` (called inside `findOne()` so all single-ticket operations propagate the check); added `softDelete()`, `findDeleted()`, `restore()`; replaced hard-delete `remove()`. TypeORM automatically excludes soft-deleted blockers from `@ManyToMany` relation loads (task 2.6 free).
- Reordered `TicketsController`: `GET /tickets/deleted` declared before `GET /tickets/:ticketId` to prevent route shadowing; same fix in `ProjectsController`.
- Added `DELETE /tickets/:id` (soft-delete, any authenticated user), `GET /tickets/deleted` (ADMIN), `POST /tickets/:id/restore` (ADMIN), `DELETE /projects/:id` (ADMIN), `GET /projects/deleted` (ADMIN), `POST /projects/:id/restore` (ADMIN).
- Updated both service spec files; all 108 unit tests pass. E2E test files for tickets and projects already covered soft-delete and restore scenarios.

---

---

## Feature: 3.6 @Mention Mechanism in Comments

### Prompt 37 — Propose @mention change
> /opsx:propose 3.6 @Mention Mechanism in Comments
> When a user includes @username inside a comment body, the mentioned user is notified and the association is persisted for later retrieval.
> Features:
> • GET /users/{userId}/mentions returns all comments where that user was mentioned, newest first.
> • Mention metadata is included in each comment response: mentionedUsers: [{ id, username, fullName }].
> • On comment update the mention list is re-evaluated: newly added mentions are created, removed mentions are deleted.
> Constraints:
> • Mentions are case-insensitive when matching usernames.

**What the model did:**
Read `README.md`, `CLAUDE.md`, and existing spec/change artifacts to understand the dependency graph. Generated `proposal.md`, `design.md`, `specs/comment-mentions/spec.md`, `specs/comments/spec.md` (MODIFIED delta), and `tasks.md` via `/opsx:propose`. Proposed a new `CommentMention` join entity, a `/@([a-zA-Z0-9_]+)/g` regex extractor (case-insensitive, deduplicated), diff-on-update logic (add new, delete removed), eager-loading `mentions → user` for response enrichment, and a paginated `GET /users/:userId/mentions` endpoint (circular dependency solved with `forwardRef()`).

---

### Prompt 38 — Add email notification on mention
> if some user is mentioned then we send an email as a notification to this user.

**What the model did:**
Updated all four artifacts to include email notification:
- `proposal.md` — added fire-and-forget email to "What Changes" and a new `mail` capability.
- `design.md` — added decisions D6 (nodemailer over `@nestjs-modules/mailer`), D7 (fire-and-forget after transaction commit; email failure never rolls back the comment), D8 (on update, only users in the added diff receive email). Added risks for SMTP misconfiguration, null email, and email flooding.
- `specs/comment-mentions/spec.md` — new "Mentioned users are notified by email" requirement with 5 scenarios.
- `specs/mail/spec.md` — new capability spec for the `MailModule` transport and `sendMentionNotification` contract.
- `tasks.md` — added MailModule section (4 tasks) and updated service tasks to dispatch emails post-commit.

---

### Prompt 39 — Implement @mention mechanism
> /opsx:apply at-mention-comments

**What the model did:**
Implemented all 26 tasks across 7 groups:
- Created `CommentMention` entity with `@ManyToOne` to `Comment` (CASCADE) and `User`; added `@OneToMany` back-reference on `Comment`.
- Created `MentionedUserDto`, `MentionsQueryDto`.
- Added Mailpit to `compose.yml`; created `MailModule` (`@Global()`) and `MailService` (credential-free nodemailer transport, `sendMentionNotification` with try/catch + Logger).
- Registered `MailModule` in `AppModule`.
- Created `extractMentions` utility (regex, lowercased, deduplicated); added `resolveMentions` and `getMentionsForUser` to `CommentsService`; rewrote `create` and `update` for mention persistence, diff, and fire-and-forget email dispatch.
- Added `GET /users/:userId/mentions` to `UsersController` injecting `CommentsService`; wired circular dependency with `forwardRef()` in both `CommentsModule` and `UsersModule`; `CommentsService` exported.
- Updated `CommentsController.update` to return the comment body (required by e2e tests).
- Wrote 22 unit tests (`mentions.util.spec.ts`, `mail.service.spec.ts`, updated `comments.service.spec.ts`, fixed `users.controller.spec.ts`) — all 122 unit tests passing.

---

---

## Feature: 3.7 Auto-Scheduling Escalation Level on Tickets

### Prompt 40 — Propose auto-escalation change
> /opsx:propose 3.7 Auto-Scheduling Escalation Level on Tickets
> Tickets are automatically escalated in priority when they remain unresolved past a configured due date.
> Features:
> • Ticket creation and update accept an optional dueDate field (ISO-8601 datetime).
> • For each overdue ticket whose priority is below CRITICAL, the priority is promoted one level: LOW → MEDIUM → HIGH → CRITICAL.
> • When a ticket reaches CRITICAL and is still overdue, its is_overdue flag is set to true; this flag is visible in all GET responses.
> Constraints:
> • Escalation is idempotent: a CRITICAL ticket is never escalated further regardless of how far past due it is.
> • Escalation only applies to tickets for which dueDate has been set.
> • A manual priority change by a user (via PATCH /tickets/{id}) resets the auto-escalation state for that ticket (is_overdue is cleared, and the next escalation cycle re-evaluates from the new priority).
> • Escalation does not transition a ticket's status field; only the priority and is_overdue flag are modified.
> - focus on integrations tests.

**What the model did:**
Read `README.md` and `CLAUDE.md`, found that `dueDate` and `isOverdue` were already on the `Ticket` entity and DTOs from prior work. Generated `proposal.md`, `design.md`, `specs/ticket-due-date/spec.md`, `specs/ticket-auto-escalation/spec.md`, `specs/ticket-overdue-reset/spec.md`, and `tasks.md` via `/opsx:propose`. Documented 5 design decisions: `@Cron` with env-configurable expression (tests call `runEscalation()` directly per the `testing-trigger` constraint), entity-by-entity saves for per-ticket audit log entries, `isOverdue` lifecycle (set on CRITICAL+overdue, cleared on manual `priority` patch), integration test strategy, and ISO-8601 validation. Spec scenarios were written to be directly 1:1 mappable to E2E test cases.

---

### Prompt 41 — Implement auto-escalation
> /opsx:apply ticket-auto-escalation

**What the model did:**
Identified 9 tasks already complete from prior work (entity columns, DTO fields, `create()` mapping). Implemented remaining tasks:
- Added `isOverdue = false` reset to `TicketsService.update()` when `priority` is present in the patch body.
- Added `TicketsService.findOverdueForEscalation()` — QueryBuilder filtering `dueDate IS NOT NULL`, `dueDate < NOW()`, `status != DONE`, `deletedAt IS NULL`.
- Created `src/scheduler/scheduler.service.ts`: `@Cron('*/5 * * * *')` on `runEscalation()`, priority promotion via `PRIORITY_ORDER` array, `isOverdue = true` set for already-CRITICAL overdue tickets, per-ticket try/catch, ESCALATE AuditLog entry per mutated ticket.
- Created `src/scheduler/scheduler.module.ts` importing `TypeOrmModule.forFeature([Ticket])` and `TicketsModule`; exports `SchedulerService` for E2E test access.
- Wired `ScheduleModule.forRoot()` and `SchedulerModule` into `AppModule`.
- Wrote `test/ticket-escalation.e2e-spec.ts` with 13 integration tests covering all spec scenarios (LOW→MEDIUM, MEDIUM→HIGH, HIGH→CRITICAL, CRITICAL+isOverdue, idempotency, null dueDate skip, DONE skip, audit log present, audit log absent, manual reset, no-reset without priority, re-evaluate after reset, re-flag after reset). Fixed tests 6.11/6.12 to use GET after PATCH since the PATCH handler returns `void`. All 13 tests pass.

---

---

## Feature: 3.8 Auto Assignment to Users by Workload

### Prompt 42 — Propose auto-assignment change
> /opsx:propose 3.8 Auto Assignment to Users by Workload
> When a ticket is created without an explicit assigneeId, the system automatically selects the least-loaded DEVELOPER in the project.
> Features: [full feature list from PDF]
> - focus on integration tests.

**What the model did:**
Read `README.md` and `CLAUDE.md` for the §3.8 API contract. Generated `proposal.md`, `design.md`, `specs/auto-assignment/spec.md`, `specs/project-workload/spec.md`, and `tasks.md` via `/opsx:propose`. Initially restricted candidates to DEVELOPERs who already had tickets in the project (inferred from the CLAUDE.md project-membership constraint). Documented 5 design decisions: LEFT JOIN query strategy (no N+1), logic placed in `TicketsService.autoAssignTicket()`, per-project workload counting, `GET /projects/:projectId/workload` placed in `ProjectsController` with `TicketsService` delegated via `forwardRef`, and integration-test-first approach with real DB.

---

### Prompt 45 — Implement auto-assignment
> /opsx:apply auto-assign--by-workload

**What the model did:**
Found that tasks 1.1–2.1 were already implemented in prior work (the `autoAssign()` raw SQL method and `AUTO_ASSIGN` audit log entry existed in `TicketsService.create()`). Implemented remaining tasks:
- Added `getProjectWorkload(projectId: number)` to `TicketsService` using a LEFT JOIN over all DEVELOPER users, counting non-DONE non-deleted tickets per project, sorted ascending.
- Added `GET /projects/:projectId/workload` route to `ProjectsController` (with `projectsService.findOne()` 404 guard), injecting `TicketsService` via constructor.
- Added `forwardRef(() => TicketsModule)` import to `ProjectsModule` to resolve the circular dependency.
- Created `test/auto-assign.e2e-spec.ts` with 14 integration tests covering all spec scenarios. Fixed three initially failing tests (6.2, 6.3, 6.7) by adding an `ensureAllDevsHaveTicketInProject()` helper that gives all existing DEVELOPERs a ticket before introducing the "target" DEVELOPER — making the assignment deterministic despite a shared global DEVELOPER pool across tests. All 14 tests pass.

<!-- Add a new entry for each feature / prompt as you continue building -->
