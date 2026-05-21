## ADDED Requirements

### Requirement: Create user
The system SHALL create a new user when `POST /users` is called with valid fields. The request body MUST include `username`, `email`, `fullName`, and `role`. A `password` field MAY be included; if omitted the system SHALL use the default value `"secret"`. In both cases the value SHALL be bcrypt-hashed before storage and MUST NOT appear in any response. The system SHALL reject the request with 400 if `role` is not `ADMIN` or `DEVELOPER`, if `username` or `email` is missing, or if `email` is not a valid email address. The system SHALL reject with 409 if `username` or `email` is already taken.

#### Scenario: Successful creation without password uses default
- **WHEN** `POST /users` is called with `{ "username": "jdoe", "email": "jdoe@example.com", "fullName": "John Doe", "role": "DEVELOPER" }` and no `password` field
- **THEN** the response is 200 OK with `{ "id": <number>, "username": "jdoe", "email": "jdoe@example.com", "fullName": "John Doe", "role": "DEVELOPER" }`, no `passwordHash` in the response, and the stored hash is a valid bcrypt hash of `"secret"`

#### Scenario: Successful creation with explicit password
- **WHEN** `POST /users` is called with the above body plus `"password": "secret123"`
- **THEN** the response is 200 OK with the same shape (no password field) and the stored `passwordHash` is a valid bcrypt hash of `"secret123"`

#### Scenario: Invalid role
- **WHEN** `POST /users` is called with `"role": "MANAGER"`
- **THEN** the response is 400 Bad Request with a descriptive error message

#### Scenario: Duplicate username
- **WHEN** `POST /users` is called with a `username` that already exists
- **THEN** the response is 409 Conflict

### Requirement: Get user by ID
The system SHALL return a single user record when `GET /users/:userId` is called with an existing `userId`. The response MUST NOT include `passwordHash`. The system SHALL return 404 if the user does not exist.

#### Scenario: Existing user
- **WHEN** `GET /users/1` is called and user 1 exists
- **THEN** the response is 200 OK with `{ "id": 1, "username": ..., "email": ..., "fullName": ..., "role": ... }`

#### Scenario: Non-existing user
- **WHEN** `GET /users/9999` is called and no such user exists
- **THEN** the response is 404 Not Found

### Requirement: List all users
The system SHALL return an array of all users when `GET /users` is called. Each entry MUST follow the same shape as a single user response (no `passwordHash`).

#### Scenario: Users exist
- **WHEN** `GET /users` is called and the database contains two users
- **THEN** the response is 200 OK with an array of two user objects

#### Scenario: No users
- **WHEN** `GET /users` is called on an empty database
- **THEN** the response is 200 OK with an empty array `[]`

### Requirement: Update user
The system SHALL update `fullName` and/or `role` for an existing user when `POST /users/update/:userId` is called. The request body MUST contain only `fullName` and/or `role` — no `password` field. Fields not present in the body SHALL remain unchanged. The system SHALL return 404 if the user does not exist. The system SHALL reject with 400 if an invalid `role` value is supplied.

#### Scenario: Update fullName
- **WHEN** `POST /users/update/1` is called with `{ "fullName": "Jane Doe" }`
- **THEN** the response is 200 OK and the user's `fullName` is updated to `"Jane Doe"`

#### Scenario: Update role to ADMIN
- **WHEN** `POST /users/update/1` is called with `{ "role": "ADMIN" }`
- **THEN** the response is 200 OK and the user's `role` is `"ADMIN"`

#### Scenario: User not found
- **WHEN** `POST /users/update/9999` is called
- **THEN** the response is 404 Not Found

### Requirement: Delete user
The system SHALL permanently delete a user when `DELETE /users/:userId` is called. The system SHALL return 404 if the user does not exist.

#### Scenario: Successful delete
- **WHEN** `DELETE /users/1` is called and user 1 exists
- **THEN** the response is 200 OK and subsequent `GET /users/1` returns 404

#### Scenario: Non-existing user
- **WHEN** `DELETE /users/9999` is called
- **THEN** the response is 404 Not Found

### Requirement: Password never exposed
The system SHALL NEVER include `passwordHash` or any password-derived field in any API response for user endpoints.

#### Scenario: Password excluded from all responses
- **WHEN** any user endpoint (`POST /users`, `GET /users`, `GET /users/:id`, `POST /users/update/:id`) returns a response
- **THEN** the response body does not contain a `password` or `passwordHash` key
