## Context

IssueFlow tickets currently have no formal relationship model. Engineers cannot express "Ticket B is blocked by Ticket A," and the status-transition guard has no mechanism to detect unresolved blockers. The `DependenciesModule` is listed in CLAUDE.md as a required module; this design delivers it.

Current state: `Ticket` entity exists with no self-referential join. `TicketsService.updateTicket` enforces only the forward-only status lifecycle (TODO → IN_PROGRESS → IN_REVIEW → DONE).

## Goals / Non-Goals

**Goals:**
- Introduce a self-referential `@ManyToMany` relation on `Ticket`, backed by a `ticket_blocker(blocker_id, blocked_id)` join table in PostgreSQL.
- Enforce same-project constraint for both tickets in any dependency.
- Prevent circular dependencies (ticket cannot block itself directly or transitively via DFS).
- Block `DONE` transitions when at least one non-`DONE` blocker exists.
- Expose `POST /tickets/:id/dependencies` and `DELETE /tickets/:id/dependencies/:blockerId`.
- Append AuditLog entries for dependency creation and removal.

**Non-Goals:**
- Cascading status changes (resolving a blocker does not auto-progress the blocked ticket).
- Dependency visualization or graph API endpoints beyond what README specifies.
- Transitive "is-blocked-by" queries exposed via the API.

## Decisions

### D1: Self-referential `@ManyToMany` on `Ticket` with explicit `@JoinTable`

**Decision**: Model the blocker relationship as a self-referential `@ManyToMany` on the `Ticket` entity using TypeORM's `@ManyToMany` + `@JoinTable`, with an explicit `@JoinTable` naming the table `ticket_blocker` and the columns `blocker_id` / `blocked_id`.

```typescript
// On Ticket entity
@ManyToMany(() => Ticket, ticket => ticket.blockingTickets)
@JoinTable({
  name: 'ticket_blocker',
  joinColumn:        { name: 'blocked_id',  referencedColumnName: 'id' },
  inverseJoinColumn: { name: 'blocker_id',  referencedColumnName: 'id' },
})
blockers: Ticket[]; // tickets that must be DONE before this one

@ManyToMany(() => Ticket, ticket => ticket.blockers)
blockingTickets: Ticket[]; // tickets that are waiting on this one
```

TypeORM creates `ticket_blocker` with a composite primary key `(blocked_id, blocker_id)` which simultaneously serves as the unique constraint — no separate `@Unique` needed.

**Rationale**: The relation belongs on `Ticket`; a separate entity is unnecessary scaffolding when we need no extra columns on the join row. `@ManyToMany` keeps the data model idiomatic, lets `TicketsService` load blockers in one `relations: ['blockers']` call without importing a second module, and makes the blocker-guard logic trivially simple. The directionality is preserved by the `joinColumn` / `inverseJoinColumn` naming and by the two named sides (`blockers` vs `blockingTickets`).

**Alternative considered**: Explicit `TicketDependency` entity — would be the right call if we needed extra join-row columns (e.g., `dependencyType`, `addedBy`). Deferred to a future extension if requirements change.

---

### D2: Circular-dependency detection via recursive DFS in the service layer

**Decision**: When adding a new `(blockerId, blockedId)` edge, run a depth-first traversal from `blockerId` following existing `blockedId → blockerId` chains. If `blockedId` is reached, the new edge would create a cycle → reject with `400`.

**Rationale**: Ticket graphs in a single project are expected to be small (tens to low hundreds of tickets). A service-layer DFS keeps the logic in TypeScript where it is testable without raw SQL and avoids a PostgreSQL recursive CTE. If scale demands it, a CTE can replace the DFS later.

**Alternative considered**: PostgreSQL `WITH RECURSIVE` CTE — deferred; adds query complexity and makes unit testing harder.

---

### D3: Blocker guard inside `TicketsService.updateTicket`

**Decision**: Before persisting a status change to `DONE`, `TicketsService` loads `ticket.blockers` (via `relations: ['blockers']`) and checks whether any blocker has `status !== 'DONE'`. If any exist, throw `400 Bad Request`.

**Rationale**: The guard must run atomically with the status update. `TicketsService` already owns the `Ticket` repository; loading the `blockers` relation requires no new import, keeping the guard co-located with the forward-only lifecycle check.

---

### D4: `DependenciesModule` uses `Ticket` repository; no cross-import needed

**Decision**: `DependenciesModule` declares `TypeOrmModule.forFeature([Ticket])` and injects `Repository<Ticket>`. Since the `@ManyToMany` relation is defined on `Ticket`, add/remove operations manipulate `ticket.blockers` directly. `TicketsModule` does NOT import `DependenciesModule` — its blocker guard uses its own `Ticket` repository.

**Rationale**: No separate entity means no cross-module repository sharing. The one-way ownership (`DependenciesModule` handles HTTP; `TicketsModule` handles guard) avoids circular imports entirely.

## Risks / Trade-offs

- **Race condition on concurrent dependency writes**: Two simultaneous requests adding edges that together form a cycle could both pass the DFS check before either commits. Mitigation: the composite PK `(blocked_id, blocker_id)` on `ticket_blocker` eliminates duplicates at the DB level; cycle races are extremely unlikely in practice and acceptable without advisory locks for this scope.
- **DFS performance on large graphs**: A project with hundreds of tickets and dense dependencies could make the DFS slow. Mitigation: soft limit is acceptable at this scale; a `WITH RECURSIVE` CTE upgrade path is documented in D2.
- **`TicketsModule` ↔ `DependenciesModule` coupling**: Importing `DependenciesModule` into `TicketsModule` creates a one-way dependency. Circular imports are avoided because `DependenciesModule` does not import `TicketsModule`. Guard this invariant.

## Migration Plan

1. `synchronize: true` in dev — TypeORM auto-creates `ticket_blocker` join table on startup when the `@ManyToMany` relation is added to `Ticket`.
2. No seed data required.
3. Rollback: remove the `@ManyToMany` decorators from `Ticket`, drop `ticket_blocker`, revert the `TicketsService` guard; no other data is affected.

## Open Questions

- None. All constraints are fully specified in CLAUDE.md and README.md.
