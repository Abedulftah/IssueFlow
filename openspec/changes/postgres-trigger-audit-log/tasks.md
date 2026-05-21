## 1. Database Schema & Migration

- [x] 1.1 Create `src/database/data-source.ts` exporting a standalone TypeORM `DataSource` (mirrors the config in `AppModule`) with `migrations: ['dist/database/migrations/*.js']` and `migrationsRun: true`
- [x] 1.2 Add `migration:run` and `migration:revert` scripts to `package.json` using `typeorm-ts-node-commonjs` CLI pointing at the `data-source.ts`
- [x] 1.3 Generate migration file `src/database/migrations/1716000000000-AuditTriggers.ts` implementing `MigrationInterface`
- [x] 1.4 In `up()`: write the PL/pgSQL `CREATE OR REPLACE FUNCTION issueflow_audit_trigger()` that reads `TG_OP`, `TG_ARGV[0]` (entityType), `NEW.id`/`OLD.id`, and `current_setting('issueflow.current_user_id', true)`, then inserts into `audit_logs`
- [x] 1.5 In `up()`: create `AFTER INSERT OR UPDATE OR DELETE` triggers on each tracked table: `tickets`, `projects`, `users`, `comments`, `attachments`, `ticket_blocker`
- [x] 1.6 In `down()`: drop all six triggers by name, then drop the `issueflow_audit_trigger` function
- [x] 1.7 Enable `migrationsRun: true` in the TypeORM config inside `AppModule` so triggers are created on app startup

## 2. AuditInterceptor

- [x] 2.1 Create `src/audit-log/audit.interceptor.ts` implementing `NestInterceptor`
- [x] 2.2 Inject `DataSource` into the interceptor via constructor
- [x] 2.3 In `intercept()`: extract `request.user?.sub` (userId from JWT); if present, call `await this.dataSource.query("SET issueflow.current_user_id = $1", [userId])`
- [x] 2.4 Wrap the `next.handle()` observable with `finalize(() => this.dataSource.query("SET issueflow.current_user_id = ''"))` to reset on completion or error
- [x] 2.5 Register `AuditInterceptor` as a global interceptor in `AppModule` providers: `{ provide: APP_INTERCEPTOR, useClass: AuditInterceptor }`

## 3. Remove Manual USER-Actor Audit Calls

- [x] 3.1 Remove all `auditLogService.record(...)` USER-actor calls from `TicketsService`
- [x] 3.2 Remove all `auditLogService.record(...)` USER-actor calls from `ProjectsService`
- [x] 3.3 Remove all `auditLogService.record(...)` USER-actor calls from `UsersService`
- [x] 3.4 Remove all `auditLogService.record(...)` USER-actor calls from `CommentsService`
- [x] 3.5 Remove all `auditLogService.record(...)` USER-actor calls from `AttachmentsService`
- [x] 3.6 Remove all `auditLogService.record(...)` USER-actor calls from `DependenciesService`
- [x] 3.7 Removed `AuditLogService` from constructor injection in ProjectsService, UsersService, CommentsService, AttachmentsService, DependenciesService; retained in TicketsService for SYSTEM AUTO_ASSIGN

## 4. Module Wiring & Auth Guarantees

- [x] 4.1 `AuditLogModule` remains `@Global()` and still exports `AuditLogService`
- [x] 4.2 `TicketsService` retains SYSTEM-actor AUTO_ASSIGN `record()` call; scheduler SYSTEM calls unchanged
- [x] 4.3 `DataSource` injected in `AuditInterceptor` via `@InjectDataSource()`

## 5. Testing

- [x] 5.1 Updated E2E test: create a ticket and assert exactly one `audit_logs` row with `action = 'CREATE'` and `performedBy` equal to the authenticated user's ID
- [x] 5.2 Existing E2E test covers: update a ticket and assert one `audit_logs` row with `action = 'UPDATE'`
- [x] 5.3 Updated E2E test: soft-delete a ticket and assert `action = 'DELETE'` (trigger maps `deletedAt` change to DELETE, not SOFT_DELETE)
- [x] 5.4 Added E2E test: exactly one CREATE entry per ticket — no duplicates from trigger + removed manual call
- [x] 5.5 Run full test suite (`npm run test` + `npm run test:e2e`) and confirm all tests pass
