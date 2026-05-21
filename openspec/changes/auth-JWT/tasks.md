## 1. Dependencies & Configuration

- [x] 1.1 Install `@nestjs/jwt`, `@nestjs/passport`, `passport`, `passport-jwt`, `bcrypt` and their `@types/*` dev packages
- [x] 1.2 Add `JWT_SECRET` and `JWT_EXPIRES_IN` to environment config (with dev defaults)

## 2. User Entity — Password Field

- [x] 2.1 Add nullable `password` column to the `User` entity (type `varchar`, `select: false`)
- [x] 2.2 Update `CreateUserDto` to accept optional `password` field; default to `"secret"` when omitted
- [x] 2.3 Update `UsersService.create()` to bcrypt-hash the resolved password (`input.password ?? "secret"`) before saving
- [x] 2.4 Ensure `password` is excluded from all `User` response shapes (use `@Exclude()` or manual omission in response DTOs)
- [x] 2.5 Mark `POST /users` with `@Public()` so it is accessible without a JWT token

## 3. DeniedToken Entity

- [x] 3.1 Create `DeniedToken` entity with fields: `id`, `token` (text, unique), `expiresAt` (timestamp)
- [x] 3.2 Register `DeniedToken` in the TypeORM entity list so the table is auto-created

## 4. JWT Strategy & Auth Guard

- [x] 4.1 Create `JwtStrategy` (passport-jwt) that extracts the Bearer token, validates it against the deny-list, and returns the user payload
- [x] 4.2 Create `JwtAuthGuard` that extends `AuthGuard('jwt')` and respects a `@Public()` decorator to skip auth
- [x] 4.3 Create `@Public()` custom decorator using `SetMetadata`
- [x] 4.4 Register `JwtAuthGuard` as a global guard via `APP_GUARD` in `AuthModule`

## 5. AuthModule — Endpoints

- [x] 5.1 Create `AuthModule`, `AuthController`, and `AuthService` files
- [x] 5.2 Implement `POST /auth/login`: validate credentials, issue JWT, return `{ accessToken, tokenType, expiresIn }`; mark as `@Public()`
- [x] 5.3 Implement `POST /auth/logout`: add the current token to `DeniedToken` table, return HTTP 200
- [x] 5.4 Implement `GET /auth/me`: return the authenticated user's profile (id, username, email, fullName, role) without password

## 6. Wire Into AppModule

- [x] 6.1 Import `AuthModule` in `AppModule`
- [x] 6.2 Verify `UsersModule` is exported so `AuthService` can resolve users

## 7. Tests

- [x] 7.1 Write unit tests for `AuthService` (login success, login invalid password, login unknown user, logout adds deny-list entry)
- [x] 7.2 Write unit tests for `JwtStrategy` (valid token passes, denied token rejected, expired token rejected)
