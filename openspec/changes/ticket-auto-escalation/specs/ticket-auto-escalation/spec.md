## ADDED Requirements

### Requirement: Escalation promotes priority one level for overdue tickets
The system SHALL run a scheduled escalation job. For each ticket where `dueDate` is set, `dueDate < now`, and `status != DONE`, the system SHALL promote `priority` by one level: `LOW → MEDIUM`, `MEDIUM → HIGH`, `HIGH → CRITICAL`. The system SHALL NOT promote priority beyond `CRITICAL`.

#### Scenario: LOW priority ticket promoted to MEDIUM
- **WHEN** the escalation job runs and a ticket has `priority = LOW`, `dueDate` in the past, and `status != DONE`
- **THEN** the ticket's `priority` SHALL become `MEDIUM`

#### Scenario: MEDIUM priority ticket promoted to HIGH
- **WHEN** the escalation job runs and a ticket has `priority = MEDIUM`, `dueDate` in the past, and `status != DONE`
- **THEN** the ticket's `priority` SHALL become `HIGH`

#### Scenario: HIGH priority ticket promoted to CRITICAL
- **WHEN** the escalation job runs and a ticket has `priority = HIGH`, `dueDate` in the past, and `status != DONE`
- **THEN** the ticket's `priority` SHALL become `CRITICAL`

### Requirement: Escalation is idempotent for CRITICAL tickets
The system SHALL NOT escalate a ticket whose `priority` is already `CRITICAL`. Running the job multiple times on the same CRITICAL overdue ticket SHALL produce no change to `priority`.

#### Scenario: CRITICAL ticket not escalated further
- **WHEN** the escalation job runs and a ticket has `priority = CRITICAL` and `dueDate` in the past
- **THEN** the ticket's `priority` SHALL remain `CRITICAL` after the job completes

#### Scenario: Running escalation twice on CRITICAL ticket is idempotent
- **WHEN** the escalation job runs twice in succession on a CRITICAL overdue ticket
- **THEN** the ticket's `priority` SHALL still be `CRITICAL` and `isOverdue` SHALL be `true`

### Requirement: Escalation sets isOverdue for CRITICAL overdue tickets
When the escalation job detects a ticket that is already `CRITICAL` and has `dueDate < now` and `status != DONE`, the system SHALL set `isOverdue = true` on that ticket.

#### Scenario: CRITICAL overdue ticket gets isOverdue flag set
- **WHEN** the escalation job runs and a ticket has `priority = CRITICAL`, `dueDate` in the past, `status != DONE`, and `isOverdue = false`
- **THEN** the ticket's `isOverdue` SHALL become `true`

#### Scenario: CRITICAL overdue ticket already flagged remains true
- **WHEN** the escalation job runs and a ticket has `priority = CRITICAL`, `dueDate` in the past, and `isOverdue = true`
- **THEN** the ticket's `isOverdue` SHALL remain `true`

### Requirement: Escalation skips tickets without dueDate
The system SHALL NOT escalate any ticket whose `dueDate` is `null`.

#### Scenario: Ticket without dueDate is not escalated
- **WHEN** the escalation job runs and a ticket has `dueDate = null` regardless of `priority`
- **THEN** the ticket's `priority` and `isOverdue` SHALL remain unchanged

### Requirement: Escalation skips DONE tickets
The system SHALL NOT escalate a ticket whose `status` is `DONE`.

#### Scenario: DONE ticket is not escalated
- **WHEN** the escalation job runs and a ticket has `status = DONE` and `dueDate` in the past
- **THEN** the ticket's `priority` and `isOverdue` SHALL remain unchanged

### Requirement: Escalation records an audit log entry per ticket
For each ticket whose `priority` or `isOverdue` is changed by the escalation job, the system SHALL create an AuditLog entry with `action = ESCALATE`, `entityType = Ticket`, `entityId = <ticketId>`, `actor = SYSTEM`, `performedBy = SYSTEM`.

#### Scenario: Audit log entry created on escalation
- **WHEN** the escalation job promotes a ticket's priority
- **THEN** an AuditLog entry SHALL exist with `action = ESCALATE`, `entityType = Ticket`, `entityId` matching the ticket, and `actor = SYSTEM`

#### Scenario: No audit log entry for skipped tickets
- **WHEN** the escalation job runs on a ticket with no `dueDate` or with `status = DONE`
- **THEN** no new AuditLog entry with `action = ESCALATE` SHALL be created for that ticket
