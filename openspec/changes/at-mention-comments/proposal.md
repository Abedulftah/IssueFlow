## Why

IssueFlow comments currently have no way to notify or reference other users inline. Adding `@username` mention parsing closes this gap — it surfaces who is being addressed in a ticket thread, notifies them by email in real time, and enables efficient retrieval via a dedicated association table.

## What Changes

- Parse `@username` tokens (case-insensitive) from comment `content` on create and update.
- Validate each mentioned username exists; reject the request if any username is unknown.
- Persist mention associations in a new `comment_mention` join table (`commentId` → `userId`).
- On comment update, diff old vs. new mention sets: insert newly added, delete removed ones.
- Send an email notification to each newly mentioned user after the comment is persisted (fire-and-forget; does not block the HTTP response).
- On update, only users in the **added** diff receive an email; users whose mentions were removed do not.
- Expose `mentionedUsers: [{ id, username, fullName }]` in every comment response.
- Add `GET /users/:userId/mentions` — paginated list of comments where the user was mentioned, newest first (query params: `page`, `pageSize`; response: `{ data, total, page }`).

## Capabilities

### New Capabilities

- `comment-mentions`: Parsing, persisting, and diffing `@username` mention associations on comments, email notification on new mentions, plus the user-mentions retrieval endpoint.
- `mail`: Transactional email delivery via a shared `MailModule` (nodemailer + SMTP config).

### Modified Capabilities

- `comments`: Comment create/update/read behavior changes — mentions are now parsed, validated, stored, and included in responses. Spec-level contract changes (new response field, new validation rule).

## Impact

- **New entity**: `CommentMention` (join table: `comment_mention`) with FK to `Comment` and `User`.
- **API surface**: New endpoint `GET /users/:userId/mentions`; `Comment` response shape gains `mentionedUsers`.
- **CommentsModule**: Service layer gains mention diffing logic and email dispatch; entity gains `@OneToMany` to `CommentMention`.
- **UsersModule**: New controller route wired into existing `UsersModule`; `User` entity must expose `email`.
- **New `MailModule`**: Wraps `nodemailer`; configured via env vars (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`).
- **Dependencies**: `nodemailer` + `@types/nodemailer` added to `package.json`.
