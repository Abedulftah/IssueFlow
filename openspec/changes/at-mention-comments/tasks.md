## 1. Database Entity & Schema

- [x] 1.1 Create `CommentMention` entity (`src/comments/comment-mention.entity.ts`) with `@ManyToOne` to `Comment` and `@ManyToOne` to `User`; add `@OneToMany` back-reference on `Comment`
- [x] 1.2 Verify TypeORM auto-creates the `comment_mention` table on next app start (`synchronize: true`)

## 2. Data Transfer Objects

- [x] 2.1 Add `MentionedUserDto` class `{ id, username, fullName }` in `src/comments/dto/`
- [x] 2.2 Add `mentionedUsers: MentionedUserDto[]` to `CommentResponseDto` (or equivalent comment response shape)
- [x] 2.3 Add `page` and `pageSize` query-param DTO for `GET /users/:userId/mentions` in `src/users/dto/`

## 3. MailModule

- [x] 3.1 Install `nodemailer` and `@types/nodemailer` (`npm install nodemailer @types/nodemailer`)
- [x] 3.2 Add Mailpit service to `compose.yml` (image: `axllent/mailpit`, ports: `1025:1025` for SMTP, `8025:8025` for web UI) — no credentials needed
- [x] 3.3 Create `src/mail/mail.module.ts` — `@Global()` module exporting `MailService`
- [x] 3.4 Create `src/mail/mail.service.ts` — create nodemailer transport with only `host: 'localhost'` and `port: 1025` (no `auth` block); hardcode `from: 'no-reply@issueflow.local'`; implement `sendMentionNotification(to, mentionedBy, ticketId, commentContent)` with try/catch + NestJS Logger
- [x] 3.5 Register `MailModule` in `AppModule` imports

## 4. Core Service Logic

- [x] 4.1 Implement `extractMentions(content: string): string[]` utility — regex `/@([a-zA-Z0-9_]+)/g`, returns lowercased usernames, deduplicated
- [x] 4.2 Implement `resolveMentions(usernames: string[]): Promise<User[]>` in `CommentsService` — queries `LOWER(username) = ANY(...)`, throws `BadRequestException` listing unknown usernames if any are missing
- [x] 4.3 On `createComment`: call `extractMentions` → `resolveMentions` → bulk-insert `CommentMention` rows inside the same transaction; after commit, fire-and-forget `MailService.sendMentionNotification` for all mentioned users with an email address
- [x] 4.4 On `updateComment`: call `extractMentions` → `resolveMentions` → diff existing mentions → insert added, delete removed inside the same `QueryRunner` transaction; after commit, fire-and-forget email only to users in the **added** set
- [x] 4.5 Update all comment read queries to eager-load `mentions → user` relation and map to `mentionedUsers` in the response

## 5. REST Controller Routing

- [x] 5.1 Add `GET /users/:userId/mentions` route to `UsersController`; inject `CommentsService` (or a `MentionsService`) to run the paginated query
- [x] 5.2 Implement `getMentionsForUser(userId, page, pageSize)` in `CommentsService` — selects `CommentMention` rows for the user, joins `Comment`, orders by `comment.createdAt DESC`, applies `skip`/`take` for pagination, returns `{ data, total, page }`
- [x] 5.3 Return HTTP 404 from the endpoint if the target user does not exist

## 6. Module Wiring & Auth Guarantees

- [x] 6.1 Export `CommentsService` (or a dedicated `MentionsService`) from `CommentsModule` so `UsersModule` can import it without circular dependency (use `forwardRef()` if needed)
- [x] 6.2 Ensure `GET /users/:userId/mentions` is protected by `JwtAuthGuard` (consistent with all non-login endpoints)
- [x] 6.3 Confirm `CommentMentionRepository` is registered in `CommentsModule` providers

## 7. Tests

- [x] 7.1 Unit-test `extractMentions`: empty string, single mention, multiple mentions, case variants, duplicate tokens
- [x] 7.2 Unit-test `CommentsService.createComment` mention path: valid mentions create rows and trigger `MailService.sendMentionNotification`; unknown username throws 400 and no email is sent
- [x] 7.3 Unit-test `CommentsService.updateComment` diff logic: add mention sends email to new user only; remove mention sends no email; SMTP error does not propagate
- [x] 7.4 Unit-test `MailService.sendMentionNotification`: calls nodemailer `sendMail` with correct `to`/`subject`/body; swallows and logs SMTP errors
- [x] 7.5 E2E test `GET /users/:userId/mentions`: returns paginated results newest-first; empty list when no mentions; 404 for unknown user
