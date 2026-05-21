## Context

IssueFlow tickets have an optional `assigneeId` foreign key. Today, if a caller omits `assigneeId` on `POST /tickets`, the ticket is created unassigned. The assignment spec requires that the system automatically pick the least-loaded DEVELOPER in the project when no explicit assignee is given.

Candidates for auto-assignment are **all DEVELOPER-role users system-wide**. Workload is computed per-project: count of non-DONE tickets assigned to each DEVELOPER within the target project. A DEVELOPER with no tickets in that project has a workload of `0` and is a valid candidate. There is no project-membership gate — any DEVELOPER can be assigned to any project's tickets.

## Goals / Non-Goals

**Goals:**
- Select the DEVELOPER in the project with the fewest non-DONE tickets on `POST /tickets` when `assigneeId` is absent.
- Break ties by earliest `createdAt` on the `users` table.
- Record `AUTO_ASSIGN` audit log entry with `actor = SYSTEM`.
- Return `assigneeId = null` silently when no DEVELOPER candidates exist.
- Expose `GET /projects/:projectId/workload` returning `[{ userId, username, openTicketCount }]` sorted ascending.

**Non-Goals:**
- Reassigning existing tickets when workload changes.
- Triggering auto-assignment on `PATCH /tickets/:id`.
- Considering project membership via explicit join tables (not in this system).
- Load-balancing across ADMIN users.

## Decisions

### D1 — Query strategy for workload calculation

**Decision:** Use a single TypeORM `createQueryBuilder` that LEFT JOINs users on their non-DONE ticket count for the project, rather than fetching all users and tickets separately and computing in JS.

**Rationale:** Keeps the workload calculation atomic and avoids N+1 queries. A single query with a subquery or GROUP BY is more efficient and race-condition-resistant than in-process aggregation.

**Alternative considered:** Fetch all DEVELOPER users, then for each user count tickets in a loop → rejected due to N+1 queries.

### D2 — Where to place auto-assignment logic

**Decision:** A private `autoAssignTicket(projectId: string): Promise<string | null>` method on `TicketsService`, called from `create()` before the ticket is persisted.

**Rationale:** Keeps the logic co-located with ticket creation; no new service is needed. `TicketsService` already has access to both `UserRepository` and `TicketRepository`.

**Alternative considered:** A dedicated `AutoAssignService` in its own module → over-engineering for a single responsibility; would require circular module dependency or a separate injection.

### D3 — Defining "DEVELOPER candidates"

**Decision:** Candidates are **all users with `role = DEVELOPER`** in the system, regardless of prior activity in the project. Workload for each candidate is the count of non-DONE tickets assigned to them within the target project (defaulting to `0` for those with no tickets there). The query is a LEFT JOIN from `users` (where `role = DEVELOPER`) onto `tickets` (where `projectId = :pid` and `status != DONE` and `deletedAt IS NULL`), grouped by user, ordered by count ASC then `createdAt` ASC.

**Rationale:** The README and PDF assignment description make no mention of project-scoped membership. Restricting candidates to previously-assigned developers would break auto-assignment for brand-new projects and contradict the workload endpoint's intent of showing all DEVELOPERs. "If no DEVELOPERs exist in the project" in the original spec simply means no DEVELOPER-role users exist at all in the system.

### D4 — Workload endpoint placement

**Decision:** `GET /projects/:projectId/workload` is added to `ProjectsController`, with the query delegated to `TicketsService` (or a shared helper) since it depends on ticket data.

**Rationale:** The route is project-scoped, so `ProjectsController` is the natural owner. Ticket count logic lives in `TicketsService` to avoid cross-module data access. `ProjectsModule` already imports `TicketsModule` (or will be wired to do so).

### D5 — Integration tests focus

**Decision:** Write E2E-style integration tests using a real PostgreSQL test database (no mocks) that cover: (a) auto-assign selects least-loaded DEVELOPER, (b) tie-breaking by `createdAt`, (c) `null` when no DEVELOPERs in project, (d) PATCH override works, (e) workload endpoint returns correct sorted list, (f) audit log entry is created.

**Rationale:** Business rules here are data-dependent; unit tests with mocked repos would not catch SQL query bugs. Integration tests against a real DB catch the actual behavior.

## Risks / Trade-offs

- **Race condition on concurrent ticket creation** → Two simultaneous `POST /tickets` calls could both read the same "least loaded" developer and assign both tickets to the same user. Mitigation: acceptable for MVP; a pessimistic lock or advisory lock can be added later if load warrants it.
- **New project with no DEVELOPER assignments** → Returns `null` assignee silently. This is correct per spec but callers must handle unassigned tickets in their UI.
- **workload query performance** → For large projects with many tickets, the GROUP BY query may be slow. Mitigation: indexes on `tickets.projectId` and `tickets.assigneeId` (already present or to be added).
- **Circular module dependency** → `ProjectsModule` importing `TicketsModule` (for workload query) while `TicketsModule` may import `ProjectsModule` (for project validation). Mitigation: use `forwardRef()` or extract the workload query into `TicketsService` and inject it into `ProjectsController` via module imports.
