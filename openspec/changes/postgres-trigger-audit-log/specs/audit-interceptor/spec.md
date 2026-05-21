## ADDED Requirements

### Requirement: AuditInterceptor sets session variable before handler
The `AuditInterceptor` (implementing `NestInterceptor`) SHALL call `dataSource.query("SET issueflow.current_user_id = $1", [userId])` before passing control to the route handler, using the `sub` claim from the JWT payload on `req.user`. It MUST reset the variable to `''` in a `finally` block after the handler completes.

#### Scenario: Authenticated request sets userId
- **WHEN** an authenticated HTTP request is processed
- **THEN** `issueflow.current_user_id` is set to the user's ID on the DB connection before any entity mutation occurs

#### Scenario: Unauthenticated request (POST /auth/login)
- **WHEN** a request reaches the interceptor without a `req.user` object (login route, no JWT)
- **THEN** the interceptor skips the `SET` call and proceeds normally without error

#### Scenario: Variable is reset after response
- **WHEN** a request completes (success or error)
- **THEN** `issueflow.current_user_id` is reset to `''` on the connection before it returns to the pool

### Requirement: AuditInterceptor is registered globally
The interceptor MUST be registered as a global interceptor via `APP_INTERCEPTOR` in `AppModule` providers so it applies to every route without per-controller decoration.

#### Scenario: All routes use the interceptor
- **WHEN** any route handler is invoked
- **THEN** the session variable is set without requiring any annotation on the controller

### Requirement: Manual record() calls for USER events are removed
After the interceptor and triggers are in place, `AuditLogService.record()` MUST NOT be called for `actor = USER` events in `TicketsService`, `ProjectsService`, `UsersService`, `CommentsService`, `AttachmentsService`, or `DependenciesService`. Duplicate entries in `audit_logs` are not permitted.

#### Scenario: No duplicate audit entries for user actions
- **WHEN** a user creates a ticket via `POST /tickets`
- **THEN** exactly one audit row exists in `audit_logs` for that create event (from the trigger, not a manual call)

### Requirement: SYSTEM actor entries remain in AuditLogService
`AuditLogService.record()` MUST still be called for auto-assign (`actor = SYSTEM`, `action = AUTO_ASSIGN`) and auto-escalation (`actor = SYSTEM`, `action = ESCALATE`) events, because these originate from the scheduler with no HTTP request context and no session variable is set.

#### Scenario: Auto-assign writes SYSTEM audit entry
- **WHEN** a ticket is created without an assignee and auto-assignment runs
- **THEN** an audit row exists with `actor = 'SYSTEM'` and `action = 'AUTO_ASSIGN'` recorded by `AuditLogService.record()`
