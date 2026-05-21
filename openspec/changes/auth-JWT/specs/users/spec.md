## MODIFIED Requirements

### Requirement: Create user accepts an optional password field with default
The `POST /users` endpoint SHALL accept an optional `password` field in the request body. If `password` is omitted, the system SHALL use the literal default value `"secret"`. The resolved password SHALL be hashed with bcrypt (cost 10) before storage. The `password` field SHALL never appear in any API response. `POST /users` SHALL be a public endpoint (no authentication required).

#### Scenario: Create user with explicit password
- **WHEN** a POST request is made to `/users` with `{ username, email, fullName, role, password: "mypassword" }`
- **THEN** the user is created, `"mypassword"` is stored as a bcrypt hash, and the response contains `{ id, username, email, fullName, role }` without a password field

#### Scenario: Create user without password defaults to "secret"
- **WHEN** a POST request is made to `/users` with `{ username, email, fullName, role }` and no password field
- **THEN** the user is created with `"secret"` stored as a bcrypt hash, and the response contains `{ id, username, email, fullName, role }`

#### Scenario: POST /users is accessible without a JWT token
- **WHEN** a POST request is made to `/users` without an Authorization header
- **THEN** the user is created normally (HTTP 200) — not rejected with 401

#### Scenario: Password never returned in user responses
- **WHEN** a GET request is made to `/users` or `/users/:userId`
- **THEN** the response body does not contain a `password` field
