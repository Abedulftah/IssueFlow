## Context

The NestJS skeleton has `UsersModule` (§2.1) and `AuthModule` (§2.2) already designed. The `projects` table is the next structural pillar: every ticket will carry a `projectId` FK into this table. This change covers only the five core CRUD endpoints from §2.3. Soft-delete (§3.5) and workload (§3.8) will extend this module in separate changes.

Key constraints from the architecture:
- All endpoints require JWT authentication.
- `ownerId` must reference an existing user — validated at the service layer.

## Goals / Non-Goals

**Goals:**
- Implement the five project CRUD endpoints exactly as specified in the README for §2.3.
- Persist `Project` entity with `id`, `name`, `description`, `ownerId` (FK → users).
- Validate that `ownerId` references an existing user on create.

**Non-Goals:**
- Soft-delete, restore, or listing deleted projects (§3.5).
- Workload endpoint (§3.8).
- Explicit project-membership management.

## Decisions

### D1 — `ownerId` as a simple FK column (no eager relation load)

**Decision:** Store `ownerId` as a plain `number` column with a TypeORM `@ManyToOne(() => User)` relation, `{ eager: false }`. API responses return the scalar `ownerId`, not a nested user object (matches README response shape `{ id, name, description, ownerId }`).

**Why:** Embedding the full user object would break the contract and over-fetch data.

### D2 — Owner existence validated via UsersService

**Decision:** On `POST /projects`, inject `UsersService` and call `findOne(ownerId)` before saving. Throw `NotFoundException` if the user does not exist.

**Why:** Prevents orphaned project records with a dangling `ownerId`; keeps the check in the service layer where business rules live.

### D3 — TypeORM `synchronize: true` for schema creation

**Decision:** Rely on TypeORM `synchronize: true` (already configured in dev) to auto-create the `projects` table.

**Why:** Consistent with the approach used for the `users` table; no migration overhead for a dev/test assignment.

### D4 — DELETE is a hard delete for §2.3

**Decision:** `DELETE /projects/:projectId` permanently removes the record. Soft-delete will replace this behavior when §3.5 is implemented.

**Why:** §2.3 only specifies "Delete a project" — soft-delete is a §3.5 concern. A hard delete now keeps this change minimal and avoids introducing `deletedAt` infrastructure before it is needed.

## Risks / Trade-offs

- **Hard delete replaced in §3.5** → When §3.5 is implemented, the DELETE handler will be changed to a soft-delete. Any integration tests written against hard-delete behavior must be updated. Mitigation: keep DELETE tests minimal and note the upcoming change.
- **`synchronize: true` schema changes** → Adding the `projects` table is additive; risk is low.

## Migration Plan

1. Create `src/projects/` module files (entity, DTOs, service, controller, module).
2. Register `ProjectsModule` in `AppModule`.
3. Restart app — TypeORM creates the `projects` table via `synchronize`.
4. No data migration required.

## Open Questions

<!-- none -->
