## ADDED Requirements

### Requirement: Login returns a JWT access token
The system SHALL accept `POST /auth/login` with `{ username, password }` in the request body. On valid credentials it SHALL return `{ accessToken, tokenType: "Bearer", expiresIn: 3600 }` with HTTP 200. On invalid credentials it SHALL return HTTP 401.

#### Scenario: Successful login
- **WHEN** a POST request is made to `/auth/login` with a valid username and matching password
- **THEN** the response is HTTP 200 with `{ accessToken: "<jwt>", tokenType: "Bearer", expiresIn: 3600 }`

#### Scenario: Invalid password
- **WHEN** a POST request is made to `/auth/login` with a valid username but wrong password
- **THEN** the response is HTTP 401 Unauthorized

#### Scenario: Unknown username
- **WHEN** a POST request is made to `/auth/login` with a username that does not exist
- **THEN** the response is HTTP 401 Unauthorized

---

### Requirement: Logout invalidates the JWT token
The system SHALL accept `POST /auth/logout` with a valid Bearer token. It SHALL add the token to a deny-list so subsequent requests using that token are rejected. Response is HTTP 200 with an empty body.

#### Scenario: Successful logout
- **WHEN** a POST request is made to `/auth/logout` with a valid Bearer token in the Authorization header
- **THEN** the response is HTTP 200 and the token is added to the deny-list

#### Scenario: Token rejected after logout
- **WHEN** a request is made with a token that has been added to the deny-list
- **THEN** the response is HTTP 401 Unauthorized

#### Scenario: Logout without token
- **WHEN** a POST request is made to `/auth/logout` without an Authorization header
- **THEN** the response is HTTP 401 Unauthorized

---

### Requirement: Get current authenticated user
The system SHALL accept `GET /auth/me` with a valid Bearer token and return the authenticated user's profile (id, username, email, fullName, role). Password MUST NOT be included in the response.

#### Scenario: Get current user with valid token
- **WHEN** a GET request is made to `/auth/me` with a valid Bearer token
- **THEN** the response is HTTP 200 with `{ id, username, email, fullName, role }`

#### Scenario: Get current user without token
- **WHEN** a GET request is made to `/auth/me` without an Authorization header
- **THEN** the response is HTTP 401 Unauthorized

---

### Requirement: Global JWT guard protects all endpoints
The system SHALL require a valid Bearer JWT token on every endpoint except `POST /auth/login`. Endpoints decorated with `@Public()` are exempt.

#### Scenario: Protected endpoint accessed without token
- **WHEN** a GET request is made to any non-public endpoint without an Authorization header
- **THEN** the response is HTTP 401 Unauthorized

#### Scenario: Protected endpoint accessed with valid token
- **WHEN** a request is made to a protected endpoint with a valid Bearer token
- **THEN** the request is processed normally

#### Scenario: Protected endpoint accessed with expired token
- **WHEN** a request is made to a protected endpoint with an expired JWT
- **THEN** the response is HTTP 401 Unauthorized

