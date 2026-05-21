## Why

IssueFlow requires a user registry as the foundational identity layer — every ticket assignment, comment, and audit record traces back to a user. Section 2.1 of the requirements defines this entity; without it nothing else can be built.

## What Changes

- Introduce the `User` entity (id, username, email, fullName, role, passwordHash) backed by a PostgreSQL table via TypeORM.
- Expose CRUD endpoints: `POST /users`, `GET /users`, `GET /users/:userId`, `POST /users/update/:userId`, `DELETE /users/:userId`.
- Validate that `role` is one of `ADMIN | DEVELOPER`; reject all other values with a 400 error.
- **Password field on `POST /users`**: The requirements split user creation (2.1) and authentication (2.2) into separate sections, but login requires a password. To avoid introducing a separate "set-password" endpoint, `POST /users` will accept an optional `password` field. If provided it is bcrypt-hashed before storage; if omitted the system defaults to hashing the literal string `"secret"`. The password is **never** returned in any response.

## Capabilities

### New Capabilities

- `user-crud`: Full CRUD for the User entity — create (with optional password), read by id, list all, update fullName/role, delete. Enforces role enum constraint and unique username/email.

### Modified Capabilities

<!-- none — no existing specs -->

## Impact

- **New module**: `src/users/` (entity, DTO, service, controller, module).
- **Database**: new `users` table migration managed by TypeORM `synchronize` (dev) or explicit migration.
- **AppModule**: `UsersModule` registered.
- **Downstream**: AuthModule (2.2) will depend on `UsersService.findByUsername()`.
