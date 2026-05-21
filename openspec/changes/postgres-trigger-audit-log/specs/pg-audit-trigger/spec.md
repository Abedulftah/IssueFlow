## ADDED Requirements

### Requirement: Trigger function exists and is parameterized
The database SHALL contain a PL/pgSQL function `issueflow_audit_trigger()` that reads `TG_OP` to derive the action (`CREATE`, `UPDATE`, `DELETE`), reads `current_setting('issueflow.current_user_id', true)` to derive `performedBy`, and inserts one row into `audit_logs` per fired event. The function MUST accept the entity type label as a trigger argument (`TG_ARGV[0]`).

#### Scenario: INSERT fires CREATE audit entry
- **WHEN** a row is inserted into any tracked entity table
- **THEN** one row is appended to `audit_logs` with `action = 'CREATE'`, correct `entityType`, `entityId = NEW.id`, and `performedBy` equal to the value of `issueflow.current_user_id`

#### Scenario: UPDATE fires UPDATE audit entry
- **WHEN** a row is updated in any tracked entity table
- **THEN** one row is appended to `audit_logs` with `action = 'UPDATE'`, correct `entityType`, and `entityId = NEW.id`

#### Scenario: DELETE fires DELETE audit entry
- **WHEN** a row is deleted from any tracked entity table
- **THEN** one row is appended to `audit_logs` with `action = 'DELETE'`, correct `entityType`, and `entityId = OLD.id`

#### Scenario: No session variable set
- **WHEN** a DB mutation occurs without `issueflow.current_user_id` being set (e.g. migration or direct psql)
- **THEN** the trigger still inserts the row with `performedBy = NULL` and does not error

### Requirement: Triggers are attached to all tracked tables
`AFTER INSERT OR UPDATE OR DELETE` triggers using `issueflow_audit_trigger` MUST be attached to: `tickets`, `projects`, `users`, `comments`, `attachments`, `ticket_dependencies`. No trigger is attached to `audit_logs` itself.

#### Scenario: All six tables covered
- **WHEN** the migration runs
- **THEN** `pg_trigger` contains one trigger per tracked table pointing to `issueflow_audit_trigger`

#### Scenario: audit_logs table has no trigger
- **WHEN** a row is inserted into `audit_logs`
- **THEN** no secondary trigger fires and no recursive audit entry is created

### Requirement: Migration is reversible
The TypeORM migration MUST implement both `up()` (creates function + triggers) and `down()` (drops triggers + function). Running `migration:revert` SHALL leave the database in its pre-trigger state with no errors.

#### Scenario: Rollback removes all triggers
- **WHEN** `down()` is executed
- **THEN** `pg_trigger` contains no rows for `issueflow_audit_trigger` and the function no longer exists

### Requirement: Failed mutations produce no audit entry
Because triggers run within the same transaction as the mutation, a rolled-back mutation MUST NOT leave any row in `audit_logs`. The audit log is only updated when the mutation commits.

#### Scenario: Soft-delete of non-existent ticket leaves no audit row
- **WHEN** a `DELETE /tickets/:id` request targets a ticket ID that does not exist (query affects 0 rows)
- **THEN** no trigger fires and no audit row is written for that operation

#### Scenario: Transaction rollback removes audit entry
- **WHEN** a mutation begins, the trigger fires and inserts into `audit_logs`, but the transaction is then rolled back
- **THEN** the `audit_logs` insert is also rolled back and the entry does not persist

### Requirement: Trigger maps soft-delete and restore to semantic actions
TypeORM soft-deletes set `deleted_at` via an `UPDATE`. The trigger MUST record this as `action = 'DELETE'`. A restore (clearing `deleted_at`) MUST be recorded as `action = 'RESTORE'`. Plain field updates with no change to `deleted_at` MUST be recorded as `action = 'UPDATE'`. This semantic mapping applies only to `tickets` and `projects` (the only tables with a `deleted_at` column).

#### Scenario: Soft-delete records action = DELETE
- **WHEN** `DELETE /tickets/:id` soft-deletes a ticket (sets `deleted_at`, `OLD.deleted_at IS NULL`)
- **THEN** the trigger emits an audit row with `action = 'DELETE'` for the tickets table

#### Scenario: Restore records action = RESTORE
- **WHEN** `POST /tickets/:id/restore` clears `deleted_at` (`OLD.deleted_at IS NOT NULL`, `NEW.deleted_at IS NULL`)
- **THEN** the trigger emits an audit row with `action = 'RESTORE'` for the tickets table

#### Scenario: Regular update is still UPDATE
- **WHEN** `PATCH /tickets/:id` updates a field (e.g. `status`) with no change to `deleted_at`
- **THEN** the trigger emits an audit row with `action = 'UPDATE'`
