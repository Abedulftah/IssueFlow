## 1. Dependencies & Configuration

- [x] 1.1 Install bcrypt: `npm install bcrypt @types/bcrypt`
- [x] 1.2 Add TypeORM + Postgres config in `AppModule` (DataSource with `synchronize: true`, reading env vars `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, `DB_NAME`)
- [x] 1.3 Enable `ClassSerializerInterceptor` globally and `ValidationPipe` globally in `main.ts`

## 2. User Entity

- [x] 2.1 Create `src/users/user.entity.ts` with columns: `id` (PK auto-increment), `username` (unique), `email` (unique), `fullName`, `role` (enum `ADMIN|DEVELOPER`), `passwordHash` (nullable)
- [x] 2.2 Annotate `passwordHash` with `@Exclude()` from `class-transformer`

## 3. DTOs

- [x] 3.1 Create `src/users/dto/create-user.dto.ts` with fields: `username` (required string), `email` (required valid email), `fullName` (required string), `role` (required, IsEnum), `password` (optional string)
- [x] 3.2 Create `src/users/dto/update-user.dto.ts` with optional fields: `fullName` (string) and `role` (IsEnum `ADMIN|DEVELOPER` if present) — no password field

## 4. UsersService

- [x] 4.1 Create `src/users/users.service.ts` injecting `UsersRepository`
- [x] 4.2 Implement `create(dto)` — bcrypt-hash `dto.password ?? 'secret'`, store as `passwordHash`, save entity, return saved entity
- [x] 4.3 Implement `findAll()` — return all users
- [x] 4.4 Implement `findOne(id)` — return user or throw `NotFoundException`
- [x] 4.5 Implement `findByUsername(username)` — used by AuthModule; return user including `passwordHash`
- [x] 4.6 Implement `update(id, dto)` — update `fullName` and/or `role` only; throw `NotFoundException` if not found
- [x] 4.7 Implement `remove(id)` — hard delete; throw `NotFoundException` if not found

## 5. UsersController

- [x] 5.1 Create `src/users/users.controller.ts` with routes matching README contract:
  - `GET /users` → `findAll()`
  - `GET /users/:userId` → `findOne(id)`
  - `POST /users` → `create(dto)`
  - `POST /users/update/:userId` → `update(id, dto)`
  - `DELETE /users/:userId` → `remove(id)`
- [x] 5.2 Apply `@UseInterceptors(ClassSerializerInterceptor)` on the controller (or rely on global interceptor) to exclude `passwordHash`

## 6. UsersModule & AppModule

- [x] 6.1 Create `src/users/users.module.ts` — declare entity, export `UsersService`
- [x] 6.2 Register `UsersModule` in `AppModule`

## 7. Tests

- [x] 7.1 Write unit tests for `UsersService` covering: create with/without password, findOne not-found, update role, remove
- [x] 7.2 Write e2e/integration test for `POST /users` validating 400 on invalid role and 200 on valid creation
- [x] 7.3 Verify `passwordHash` is absent from all response shapes in tests
