## ADDED Requirements

### Requirement: Ticket accepts optional dueDate on creation
The system SHALL accept an optional `dueDate` field (ISO-8601 datetime string) in the `POST /tickets` request body. When provided, it SHALL be stored on the ticket and returned in all GET responses. When omitted, the field SHALL be `null`.

#### Scenario: Create ticket with dueDate
- **WHEN** a client sends `POST /tickets` with a valid ISO-8601 `dueDate` value
- **THEN** the response SHALL include the provided `dueDate` and `isOverdue: false`

#### Scenario: Create ticket without dueDate
- **WHEN** a client sends `POST /tickets` without a `dueDate` field
- **THEN** the response SHALL include `dueDate: null` and `isOverdue: false`

#### Scenario: Create ticket with invalid dueDate
- **WHEN** a client sends `POST /tickets` with a non-ISO-8601 string for `dueDate`
- **THEN** the system SHALL respond with HTTP 400

### Requirement: Ticket accepts optional dueDate on update
The system SHALL accept an optional `dueDate` field in the `PATCH /tickets/:id` request body. When provided, it SHALL replace the existing value. When omitted, the existing value SHALL be preserved.

#### Scenario: Update ticket dueDate
- **WHEN** a client sends `PATCH /tickets/:id` with a new `dueDate`
- **THEN** the response SHALL include the updated `dueDate`

#### Scenario: Clear ticket dueDate by setting null
- **WHEN** a client sends `PATCH /tickets/:id` with `dueDate: null`
- **THEN** the stored `dueDate` SHALL become `null` and escalation SHALL no longer apply to this ticket

### Requirement: dueDate and isOverdue visible in GET responses
Every ticket response (single and collection) SHALL include `dueDate` (ISO-8601 string or `null`) and `isOverdue` (boolean).

#### Scenario: GET single ticket includes temporal fields
- **WHEN** a client sends `GET /tickets/:id`
- **THEN** the response SHALL include `dueDate` and `isOverdue` fields

#### Scenario: GET ticket list includes temporal fields
- **WHEN** a client sends `GET /tickets`
- **THEN** every item in the response array SHALL include `dueDate` and `isOverdue`
