## Context

The NestJS skeleton (`src/`) ships only `AppModule/AppController/AppService`. The `package.json` already includes `@nestjs/typeorm`, `typeorm`, `pg`, `class-validator`, and `class-transformer`, so the ORM and validation infrastructure is ready. `bcrypt` is **not** in the current dependencies and must be added.

The requirements split user creation (§2.1) and login (§2.2) into separate sections; the README API table for `POST /users` does not list a `password` field. However, login requires a password that must be stored at creation time. Resolving this without a separate "set-password" endpoint is the central design decision here.

## Goals / Non-Goals

**Goals:**
- Implement the five User CRUD endpoints exactly as specified in the README API table.
- Persist `passwordHash` on the User entity so §2.2 AuthModule can validate credentials.
- Enforce `role` enum (`ADMIN | DEVELOPER`) at the DTO validation layer.
- Return responses that never expose `passwordHash`.

**Non-Goals:**
- JWT generation or token management (belongs to §2.2 AuthModule).
- Soft-delete for users (§3.5 only covers tickets and projects).
- Role-based authorization guards (§2.2 concern).

## Decisions

### D1 — Password at user-creation time (no extra endpoint)

**Decision:** Accept an optional `password` field on `POST /users`. If provided, hash it with bcrypt (cost 10) and store as `passwordHash`. If omitted, default to hashing the literal string `"secret"` — every user always has a usable password from the moment of creation. `POST /users/update/:userId` accepts only `fullName` and `role` — exactly as the README table specifies — and does NOT expose a password field.

**Why over alternatives:**
- *Separate `/users/:id/set-password` endpoint* — rejected; the prompt explicitly asks for no additional endpoint.
- *Derive password from username* — rejected; weak security and non-obvious to callers.
- *Hard-require password on create* — valid option, but the README `POST /users` table omits it; making it optional is the closest match to the documented contract while still enabling §2.2 login for any user whose password was set at creation time.

### D2 — TypeORM entity with `synchronize: true` in development

**Decision:** Use TypeORM `synchronize: true` in the development config to auto-create/migrate the `users` table. Disable in production.

**Why:** The assignment uses Docker Compose for Postgres; `synchronize` is acceptable for a homework project and avoids migration file overhead until the schema stabilizes.

### D3 — `passwordHash` excluded from responses via class serialization

**Decision:** Annotate `passwordHash` with `@Exclude()` from `class-transformer` and enable `ClassSerializerInterceptor` globally. The DTO/response type never includes the field.

**Why:** Prevents accidental leakage without requiring manual field omission in every service method.

### D4 — `POST /users/update/:userId` (not `PATCH`)

**Decision:** Follow the README contract verbatim — the update route is `POST /users/update/:userId`, not the RESTful `PATCH /users/:userId`.

**Why:** The README is the implementation contract per the assignment instructions. Deviating breaks the expected API surface.

## Risks / Trade-offs

- **Default password `"secret"`** → Every user can log in immediately after creation. This is intentional for a dev/test assignment; callers should override it by supplying a real `password` in `POST /users`.
- **`synchronize: true`** → Schema drift risk if entity is changed without care. Acceptable for a dev/test assignment; document in `run.md`.
- **bcrypt dependency** → Must be added (`npm install bcrypt @types/bcrypt`). Adds one dependency but is the industry-standard for password hashing.

## Migration Plan

1. `npm install bcrypt @types/bcrypt`
2. Create `src/users/` module with entity, DTOs, service, controller.
3. Register `UsersModule` in `AppModule`.
4. Start Postgres via `docker compose up -d` and run the app — TypeORM creates the table.
5. No rollback complexity; table creation is additive.
