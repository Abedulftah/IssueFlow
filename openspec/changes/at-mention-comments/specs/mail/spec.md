## ADDED Requirements

### Requirement: MailModule provides a credential-free email transport
The system SHALL expose a `MailModule` (global) containing a `MailService` that wraps `nodemailer`. The transport MUST connect to Mailpit at `host: localhost, port: 1025` with **no authentication block**. No credentials of any kind SHALL appear in code or configuration files. The sender address is hardcoded as `no-reply@issueflow.local`.

#### Scenario: MailService is injectable in CommentsModule
- **WHEN** `CommentsModule` imports `MailModule`
- **THEN** `MailService` is available for injection in `CommentsService`

#### Scenario: Transport requires no credentials
- **WHEN** the nodemailer transport is created
- **THEN** it contains no `auth.user` or `auth.pass` fields

### Requirement: Mention notification email is sent to mentioned users
`MailService` SHALL expose a `sendMentionNotification(to: string, mentionedBy: string, ticketId: number, commentContent: string)` method. The email MUST include the commenter's username, a reference to the ticket, and the comment content.

#### Scenario: Notification email contains expected fields
- **WHEN** `sendMentionNotification` is called with valid arguments
- **THEN** nodemailer's `sendMail` is called with `to`, `subject` referencing the ticket, and a `text`/`html` body containing the commenter's username and comment content

#### Scenario: SMTP error is caught and logged
- **WHEN** nodemailer's `sendMail` rejects
- **THEN** `MailService` catches the error, logs it via NestJS `Logger`, and does not re-throw
