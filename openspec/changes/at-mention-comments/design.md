## Context

Comments exist in IssueFlow as child records of tickets. Currently no user-reference mechanism exists. The mention feature requires: regex-based token extraction, user lookup, a new join table, response enrichment, email notification delivery, and a new retrieval endpoint. The change touches `CommentsModule` and `UsersModule` and introduces a new shared `MailModule`. TypeORM `synchronize: true` keeps schema management trivial for dev.

## Goals / Non-Goals

**Goals:**
- Parse `@username` tokens from comment body on create and update (case-insensitive).
- Validate all mentioned usernames exist at write time; return 400 if any are unknown.
- Persist mention associations in a `comment_mention` join table.
- On update, diff and reconcile mentions (insert new, delete removed) atomically within the comment update transaction.
- Include `mentionedUsers: [{ id, username, fullName }]` in all comment read responses.
- Implement `GET /users/:userId/mentions` with pagination (`page`, `pageSize`) returning `{ data, total, page }`.
- Send an email notification to each newly mentioned user immediately after the comment is persisted.
- On update, email only users in the **added** diff; do not email users whose mentions were retained or removed.

**Non-Goals:**
- Real-time push notifications or WebSocket events for mentions.
- In-app notification delivery or notification inbox.
- Guaranteed delivery / retry queues — fire-and-forget is acceptable for this assignment.
- Mention autocomplete or fuzzy matching — exact `@username` tokens only.
- Rate-limiting mention creation.

## Decisions

### D1 — Dedicated `CommentMention` entity vs. PostgreSQL array column
**Decision:** Dedicated `CommentMention` entity with FK columns `commentId` and `userId`.

**Rationale:** A join table supports efficient queries in both directions (`SELECT ... WHERE userId = ?` for the mentions endpoint) without PostgreSQL-specific array operators. It is consistent with the rest of the TypeORM schema and allows future extension (e.g., `notifiedAt` column).

**Alternative considered:** Store `mentionedUserIds` as a JSON/array column on `Comment`. Cheaper to write but requires a full-table scan or GIN index for the `GET /users/:userId/mentions` query. Rejected.

### D2 — Mention diffing strategy on update
**Decision:** Load existing `CommentMention` rows for the comment, compute added/removed sets in the service layer, then batch-insert new rows and batch-delete removed rows — all inside a single TypeORM `QueryRunner` transaction alongside the comment update.

**Rationale:** Keeps atomicity simple. TypeORM's `save()` with cascades can silently orphan rows; explicit diff + QueryRunner is more predictable and easier to unit-test.

**Alternative considered:** Delete-all + re-insert on every update. Simpler code but discards any future metadata (e.g., `notifiedAt`) on surviving mentions. Rejected.

### D3 — Username extraction regex
**Decision:** `/(@[a-zA-Z0-9_]+)/g` applied to `content`, then strip the leading `@` and lowercase for lookup. Match against `LOWER(username)` in a single `WHERE username = ANY(...)` query.

**Rationale:** Covers all typical username character sets. Case-insensitive matching is required by spec; lowercasing both sides is the simplest portable approach.

### D4 — Placement of `GET /users/:userId/mentions` endpoint
**Decision:** Add the route to `UsersController` inside `UsersModule`. The `UsersModule` imports `CommentsModule` (or uses the `CommentMention` repository directly if exported).

**Rationale:** The endpoint is semantically about a user's mentions, not about comments. Keeping it in `UsersModule` is consistent with the README contract (`GET /users/:userId/mentions`). To avoid circular imports, `CommentsModule` exports its `CommentMentionRepository` (or a `MentionsService`) and `UsersModule` imports `CommentsModule`.

### D6 — Email notification: library and transport choice
**Decision:** Use `nodemailer` directly via a thin `MailService` in a new `MailModule`. Run **Mailpit** as the SMTP server (added to `compose.yml`). The nodemailer transport uses only `host` (`mailpit`) and `port` (`1025`) — **no credentials of any kind**. `MAIL_FROM` is the only configurable value and can be any string (e.g., `no-reply@issueflow.local`).

**Rationale:** Mailpit is credential-free by design — it accepts all connections without authentication. It runs alongside PostgreSQL in the existing Docker Compose setup, so no extra tooling is needed. Sent emails are visible in Mailpit's web UI at `http://localhost:8025`. No secrets ever appear in code or config files.

**Alternative considered:** SMTP with credentials (Ethereal, SendGrid, etc.). Requires storing a username and password somewhere. Rejected — unnecessary for this project.

### D7 — Email dispatch: synchronous vs. fire-and-forget
**Decision:** Dispatch emails **after** the database transaction commits, using `Promise.all(...).catch(err => logger.error(err))` — fire-and-forget. The HTTP response is returned immediately; email failure does not roll back the comment.

**Rationale:** Email delivery is a best-effort side effect. Blocking the HTTP response on SMTP latency (or failure) would degrade the API for users on slow mail servers. The trade-off is that a comment can be saved without the email being sent; this is acceptable for a ticket management tool.

**Alternative considered:** Transactional outbox / retry queue. Guarantees delivery but requires a background worker and additional infrastructure — out of scope.

### D8 — Which users receive email on update
**Decision:** On comment update, only users in the **added** set (new mentions not present before) receive an email. Retained and removed mentions trigger no email.

**Rationale:** Re-notifying users whose mentions were unchanged is noise. Users whose mentions are removed have no actionable reason to be emailed.

### D5 — Response enrichment for `mentionedUsers`
**Decision:** Eager-load `CommentMention → User` relation via TypeORM `relations` option in the comment find queries. Map to `{ id, username, fullName }` in the service before returning.

**Rationale:** Avoids N+1; a single JOIN retrieves all mention data alongside the comment. Consistent with how other relations (e.g., `assignee`) are loaded elsewhere in the project.

## Risks / Trade-offs

- **Unknown usernames at write time** → Return HTTP 400 with a list of unresolved usernames. Fail fast; do not silently drop unknown mentions.
- **Circular module dependency (`UsersModule` ↔ `CommentsModule`)** → Use `forwardRef()` or extract `CommentMention` repository into a shared provider. Prefer exporting a focused `MentionsService` from `CommentsModule` to avoid broad coupling.
- **Large comment content with many mentions** → No hard cap imposed; the regex scan is O(n) on content length which is acceptable for typical ticket comments. Could add a soft limit (e.g., 20 mentions per comment) as a future guard.
- **`synchronize: true` schema drift** → `CommentMention` table is auto-created. No migration script needed for dev; production deployments would need a migration, but that is out of scope for this assignment.
- **SMTP misconfiguration** → `MailService` logs the error and swallows it so the API stays healthy. Mailpit must be running (`docker compose up -d`) for emails to be captured; if it is down, the error is logged and the API continues normally.
- **`User.email` may be null/undefined** → `MailService.sendMentionNotification` skips users with no email address and logs a warning; it does not throw.
- **Email flooding on a comment with many mentions** → Emails are dispatched concurrently via `Promise.all`; no per-user rate limit is applied (acceptable for a ticket tool with a bounded team size).
