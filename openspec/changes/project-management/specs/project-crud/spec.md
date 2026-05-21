## ADDED Requirements

### Requirement: Create project
The system SHALL create a new project when `POST /projects` is called with a valid request body. The request body MUST include `name`, `description`, and `ownerId`. The system SHALL reject with 404 if `ownerId` does not reference an existing user. The response SHALL be `{ id, name, description, ownerId }`. The endpoint MUST be protected by JWT authentication.

#### Scenario: Successful creation
- **WHEN** `POST /projects` is called with `{ "name": "Sample Project", "description": "A sample project", "ownerId": 1 }` and user 1 exists
- **THEN** the response is 200 OK with `{ "id": <number>, "name": "Sample Project", "description": "A sample project", "ownerId": 1 }`

#### Scenario: Owner does not exist
- **WHEN** `POST /projects` is called with `{ "name": "X", "description": "Y", "ownerId": 9999 }` and no user with id 9999 exists
- **THEN** the response is 404 Not Found

#### Scenario: Missing name field
- **WHEN** `POST /projects` is called without a `name` field
- **THEN** the response is 400 Bad Request

#### Scenario: Unauthenticated request
- **WHEN** `POST /projects` is called without a valid JWT Authorization header
- **THEN** the response is 401 Unauthorized

### Requirement: Get all projects
The system SHALL return an array of all projects when `GET /projects` is called. The endpoint MUST be protected by JWT authentication.

#### Scenario: Projects exist
- **WHEN** `GET /projects` is called and two projects exist
- **THEN** the response is 200 OK with an array of two project objects, each containing `{ id, name, description, ownerId }`

#### Scenario: No projects
- **WHEN** `GET /projects` is called and no projects exist
- **THEN** the response is 200 OK with an empty array `[]`

### Requirement: Get project by ID
The system SHALL return a single project record when `GET /projects/:projectId` is called with an existing project id. The system SHALL return 404 if the project does not exist. The endpoint MUST be protected by JWT authentication.

#### Scenario: Existing project
- **WHEN** `GET /projects/1` is called and project 1 exists
- **THEN** the response is 200 OK with `{ "id": 1, "name": ..., "description": ..., "ownerId": ... }`

#### Scenario: Non-existing project
- **WHEN** `GET /projects/9999` is called and no such project exists
- **THEN** the response is 404 Not Found

### Requirement: Update project
The system SHALL update `name` and/or `description` of an existing project when `PATCH /projects/:projectId` is called. Fields not present in the request body SHALL remain unchanged. The system SHALL return 404 if the project does not exist. The endpoint MUST be protected by JWT authentication.

#### Scenario: Update name
- **WHEN** `PATCH /projects/1` is called with `{ "name": "Updated Name" }` and project 1 exists
- **THEN** the response is 200 OK and project 1's name is `"Updated Name"` while description is unchanged

#### Scenario: Update description
- **WHEN** `PATCH /projects/1` is called with `{ "description": "Updated description" }`
- **THEN** the response is 200 OK and project 1's description is updated

#### Scenario: Project not found
- **WHEN** `PATCH /projects/9999` is called
- **THEN** the response is 404 Not Found

### Requirement: Delete project
The system SHALL permanently delete a project when `DELETE /projects/:projectId` is called. The system SHALL return 404 if the project does not exist. The endpoint MUST be protected by JWT authentication.

#### Scenario: Successful delete
- **WHEN** `DELETE /projects/1` is called and project 1 exists
- **THEN** the response is 200 OK and a subsequent `GET /projects/1` returns 404

#### Scenario: Non-existing project
- **WHEN** `DELETE /projects/9999` is called
- **THEN** the response is 404 Not Found
