## Why

IssueFlow's API endpoints are currently unprotected — any caller can read or mutate data without identifying themselves. Implementing JWT-based authentication establishes who is acting on the system, enables role-based access control (ADMIN vs. DEVELOPER), and unlocks the audit log's `performedBy` tracking across every other feature.

## What Changes

- Add `password` (hashed) field to the `User` entity.
- Introduce `AuthModule` with three endpoints: `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`.
- Issue signed JWT access tokens on login (HS256, 1-hour expiry).
- Maintain a token deny-list (database table) so logout immediately invalidates the token.
- Add a global `JwtAuthGuard` that validates the Bearer token on every request except `POST /auth/login`.
- Expose a `@Roles(...)` decorator + `RolesGuard` for ADMIN-only endpoints (soft-delete listing, restore).

## Capabilities

### New Capabilities

- `jwt-auth`: Login, logout, and current-user endpoints; JWT issuance and validation; token deny-list; global auth guard; roles guard and decorator.

### Modified Capabilities

- `users`: User entity gains a hashed `password` column; `POST /users` (create user) accepts a `password` field.

## Impact

- **New dependency**: `@nestjs/jwt`, `@nestjs/passport`, `passport`, `passport-jwt`, `bcrypt` (+ types).
- **Entity change**: `User` gets a `password` column (not returned in API responses).
- **New entity**: `DeniedToken` — stores jti/token string + expiry for invalidated tokens.
- **Global guard**: All controllers become protected by default; `POST /auth/login` is explicitly public via a `@Public()` decorator.
- **All other modules** will receive the authenticated user via `@Request()` for future audit-log actor resolution.
