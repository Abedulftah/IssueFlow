## Context

IssueFlow is a NestJS + TypeScript backend with PostgreSQL via TypeORM. No authentication exists today — all endpoints are open. The `User` entity already has `username`, `email`, `fullName`, and `role` fields but no `password`. We must add authentication without breaking the existing user CRUD API surface.

The assignment requires JWT auth with logout support (token invalidation), `GET /auth/me`, and role-based guards for ADMIN-only routes.

## Goals / Non-Goals

**Goals:**
- Issue signed JWT Bearer tokens on `POST /auth/login`.
- Invalidate tokens immediately on `POST /auth/logout` via a database deny-list.
- Protect all endpoints globally; exempt only `POST /auth/login` via `@Public()` decorator.
- Expose `GET /auth/me` returning the authenticated user's profile.
- Provide `@Roles()` + `RolesGuard` for ADMIN-only endpoints.
- Hash passwords with bcrypt before storage.

**Non-Goals:**
- Refresh tokens / token rotation (out of scope for assignment).
- OAuth / SSO / external identity providers.
- Rate limiting on login endpoint.
- Email verification or password reset flows.

## Decisions

### D1 — Token storage strategy: deny-list (not allowlist)
**Decision**: Store only invalidated tokens in a `DeniedToken` table; all tokens not present are considered valid.  
**Rationale**: Stateless JWT fits the bulk of requests (no DB hit on every request) while logout still achieves immediate revocation. An allowlist would require a DB lookup on every authenticated request.  
**Alternative considered**: Redis-based deny-list — rejected to avoid adding a new infrastructure dependency; PostgreSQL is already present.

### D2 — Global guard with `@Public()` opt-out
**Decision**: Register `JwtAuthGuard` as a global guard via `APP_GUARD`; mark public routes with a `@Public()` custom decorator.  
**Rationale**: Opt-out is safer than opt-in — new endpoints are protected by default, reducing the risk of accidentally shipping an unguarded route.  
**Alternative considered**: Decorator-based opt-in `@UseGuards(JwtAuthGuard)` per controller — rejected because it is easy to forget.

### D3 — JWT algorithm and expiry
**Decision**: HS256 (symmetric), 1-hour (`3600s`) expiry. Secret read from `JWT_SECRET` environment variable (falls back to a dev default).  
**Rationale**: Sufficient for the assignment scope; asymmetric RS256 adds key management overhead with no benefit here.

### D4 — Password hashing
**Decision**: bcrypt with cost factor 10.  
**Rationale**: Industry standard; bcrypt is resistant to GPU-based brute-force. Cost 10 is the widely-used default balance of security vs. latency.

### D5 — DeniedToken cleanup
**Decision**: Deny-list rows are never actively purged in this implementation; expired tokens are harmless because the JWT itself rejects them first.  
**Rationale**: Keep the implementation simple; a scheduled cleanup job is out of scope.

### D6 — `password` field excluded from API responses
**Decision**: The `User` entity keeps a `password` column; the `UserResponseDto` (or serialization exclusion via `@Exclude()`) omits it in all responses.  
**Rationale**: Passwords must never be leaked in HTTP responses.

## Risks / Trade-offs

- **Deny-list grows unbounded** → Acceptable for the assignment; production would add a cron to delete rows where `expiresAt < NOW()`.
- **Single JWT_SECRET** → Secret rotation requires all current tokens to be re-issued. Not a concern at assignment scale.
- **bcrypt latency** → At cost 10, bcrypt takes ~100 ms per hash. Login endpoint will be slightly slow — acceptable trade-off for security.
- **No refresh token** → After 1 hour the user must re-login. Acceptable per spec; adding refresh tokens later would require a new endpoint and a `RefreshToken` table.

## Migration Plan

1. Run `npm install` to pull new dependencies (`@nestjs/jwt`, `@nestjs/passport`, `passport`, `passport-jwt`, `bcrypt`, `@types/bcrypt`, `@types/passport-jwt`).
2. TypeORM `synchronize: true` will add the `password` column to `users` table and create the `denied_tokens` table automatically on next app start.
3. Existing users have no password — callers must re-create or seed users via `POST /users` with a `password` field before they can log in.
4. Rollback: remove `AuthModule`, revert `User` entity, drop `denied_tokens` table. No data is destroyed in the primary tables.

## Open Questions

- Should `POST /users` (create user) be a public endpoint or require authentication? For the assignment, it is left public so testers can seed the first admin user without a chicken-and-egg problem.
