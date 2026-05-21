## ADDED Requirements

### Requirement: Manual priority update resets isOverdue flag
When a user sends `PATCH /tickets/:id` with a `priority` field in the request body, the system SHALL set `isOverdue = false` on that ticket, regardless of the new priority value or whether `dueDate` is still in the past.

#### Scenario: Manual priority change clears isOverdue
- **WHEN** a user sends `PATCH /tickets/:id` with a `priority` field and the ticket has `isOverdue = true`
- **THEN** the response SHALL include `isOverdue: false`

#### Scenario: Manual priority change to same value still clears isOverdue
- **WHEN** a user sends `PATCH /tickets/:id` with `priority` equal to the current priority and the ticket has `isOverdue = true`
- **THEN** `isOverdue` SHALL become `false`

### Requirement: Next escalation cycle re-evaluates from the new priority
After a manual priority update clears `isOverdue`, the next escalation cycle SHALL treat the ticket normally — if it is still overdue, it will be promoted one level from the new priority (unless it is already CRITICAL, in which case `isOverdue` will be set again).

#### Scenario: Escalation re-evaluates after manual reset
- **WHEN** a ticket's priority is manually updated (clearing `isOverdue`) and the escalation job runs again while `dueDate` is still in the past
- **THEN** the ticket's priority SHALL be promoted one level from the manually-set priority (unless it is already CRITICAL)

#### Scenario: Ticket reaches CRITICAL again after reset and escalation re-run
- **WHEN** a ticket was reset to `CRITICAL` manually (clearing `isOverdue`) and the escalation job runs again
- **THEN** `isOverdue` SHALL be set to `true` again

### Requirement: PATCH without priority field does not affect isOverdue
When a user sends `PATCH /tickets/:id` without a `priority` field, `isOverdue` SHALL remain unchanged.

#### Scenario: Update title only does not reset isOverdue
- **WHEN** a user sends `PATCH /tickets/:id` with only a `title` change and the ticket has `isOverdue = true`
- **THEN** `isOverdue` SHALL remain `true`
