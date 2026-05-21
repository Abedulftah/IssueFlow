# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

IssueFlow is a NestJS + TypeScript backend for a lightweight ticket management platform. The skeleton is bare (only `AppModule`, `AppController`, `AppService`). Every feature must be implemented from scratch using NestJS modules, TypeORM entities, and a PostgreSQL database.

## Commands

```bash
# Start database (Docker required)
docker compose up -d

# Install dependencies
npm install

# Development (watch mode)
npm run start:dev

# Build
npm run build

# Lint (auto-fix)
npm run lint

# Unit tests (rootDir: src, matches *.spec.ts)
npm run test

# Run a single test file
npx jest src/tickets/tickets.service.spec.ts

# E2E tests
npm run test:e2e

# Test coverage
npm run test:cov
```

## Database

Docker Compose (`compose.yml`) spins up PostgreSQL with:
- Host: `localhost:5432`
- Database / User / Password: all `issueflow`

TypeORM must be configured with `synchronize: true` (dev) or migrations. TypeScript target is ES2021, `strictNullChecks` and `noImplicitAny` are both off.

## Architecture

Build one NestJS feature module per domain entity. Each module owns its controller, service, entity, and DTOs. Wire all modules into `AppModule`.

**Modules to create:**
- `AuthModule` — JWT login/logout/me; a token deny-list for logout
- `UsersModule` — user CRUD; roles: `ADMIN | DEVELOPER`
- `ProjectsModule` — project CRUD; soft-delete + restore (ADMIN only)
- `TicketsModule` — ticket CRUD, export/import CSV, soft-delete + restore, auto-assignment
- `CommentsModule` — nested under tickets; `@mention` parsing
- `AuditLogModule` — append-only log, queryable by `entityType`, `entityId`, `action`, `actor`
- `DependenciesModule` — ticket blocker relationships
- `AttachmentsModule` — file upload with Multer
- `SchedulerModule` — background job for auto-escalation (use `@nestjs/schedule`)

## Critical Business Rules

### Ticket Status Lifecycle
Status can only move **forward**: `TODO → IN_PROGRESS → IN_REVIEW → DONE`. Backward transitions must be rejected. A `DONE` ticket cannot be updated at all.

### Ticket / Comment Concurrency
Tickets and comments cannot be updated by two users simultaneously — use optimistic locking (TypeORM `@VersionColumn`) or a database-level advisory lock.

### Auto-Escalation (scheduled job)
Runs periodically. For every overdue ticket (current time > `dueDate`) with priority below `CRITICAL`: promote priority one level (`LOW→MEDIUM→HIGH→CRITICAL`). When a ticket is CRITICAL and still overdue, set `isOverdue = true`. A manual `PATCH /tickets/:id` with a new priority clears `isOverdue` and resets escalation state. Escalation never changes `status`, only `priority` and `isOverdue`. Escalation is idempotent; only runs for tickets that have `dueDate` set.

### Auto-Assignment (on ticket creation)
If `assigneeId` is absent, assign the DEVELOPER (any DEVELOPER-role user system-wide) with the fewest non-DONE tickets in that project (ties broken by earliest `createdAt`). Workload is counted per-project; DEVELOPERs with no tickets in the project have a count of 0 and are valid candidates. If no DEVELOPER-role users exist at all, leave `assigneeId = null`. Record in AuditLog with `actor = SYSTEM`, `action = AUTO_ASSIGN`. Never triggered on update.

### Soft Delete
`DELETE /tickets/:id` and `DELETE /projects/:id` soft-delete only (`deletedAt` timestamp). Standard GET responses exclude soft-deleted records. `GET /tickets/deleted` and `GET /projects/deleted` are ADMIN-only. Restore via `POST /tickets/:id/restore` and `POST /projects/:id/restore` (ADMIN only).

### Ticket Dependencies
Both tickets must exist and belong to the same project. A ticket cannot transition to `DONE` if it has unresolved (non-DONE) blockers.

### Attachments
Multer handles `multipart/form-data`. Max file size: **10 MB**. Allowed MIME types: `image/png`, `image/jpeg`, `application/pdf`, `text/plain`. Reject all others with a 400.

### @Mentions in Comments
Parse `@username` tokens (case-insensitive) from comment `content`. Validate each username exists. Persist the mention associations. On comment update, diff the mention list — create new ones, delete removed ones. `GET /users/:userId/mentions` returns paginated comments where the user was mentioned, newest first.

### Audit Log
Every state-changing action (create, update, delete, restore, auto-assign, escalation) must be recorded with: `action`, `entityType`, `entityId`, `performedBy` (userId or SYSTEM), `actor` (`USER | SYSTEM`), `timestamp`.

## API Contract

All response status codes are `200 OK` per the README spec. See README.md for full endpoint tables. Key non-obvious endpoints:

| Endpoint | Notes |
|---|---|
| `POST /auth/login` | Body: `{ username, password }` → `{ accessToken, tokenType, expiresIn }` |
| `GET /tickets/export?projectId=` | Returns CSV file (Content-Type: text/csv) |
| `POST /tickets/import` | `multipart/form-data`: `file` (CSV) + `projectId` form field → `{ created, failed, errors }` |
| `GET /projects/:projectId/workload` | `[{ userId, username, openTicketCount }]` sorted ascending |
| `GET /users/:userId/mentions` | Query params: `page`, `pageSize`; response: `{ data, total, page }` |
| `POST /users/update/:userId` | Uses POST not PATCH (per README) |

## Deliverables Required by the Assignment

- `run.md` — exact steps: install deps, start DB, build, run app, run tests
- `prompts.md` — key AI interaction prompts + which model was used
- All Claude Code instruction/skill files committed to the repo
