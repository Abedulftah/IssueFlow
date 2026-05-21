## ADDED Requirements

### Requirement: Project workload endpoint
The system SHALL expose `GET /projects/:projectId/workload` which returns a list of **all DEVELOPER-role users system-wide** along with their current open (non-DONE) ticket count within the specified project. DEVELOPERs with no tickets in the project SHALL appear with `openTicketCount = 0`. The response SHALL be an array of objects `{ userId, username, openTicketCount }` sorted ascending by `openTicketCount`. The endpoint SHALL be protected by JWT AuthGuard.

#### Scenario: Returns workload for all project DEVELOPERs
- **WHEN** `GET /projects/:projectId/workload` is called for a project with multiple DEVELOPER members
- **THEN** the response contains one entry per DEVELOPER with their `userId`, `username`, and correct `openTicketCount`

#### Scenario: Results sorted ascending by openTicketCount
- **WHEN** DEVELOPERs have different open ticket counts
- **THEN** the response array is sorted ascending by `openTicketCount`

#### Scenario: DONE tickets not counted
- **WHEN** a DEVELOPER has tickets with `status = DONE` and tickets with other statuses
- **THEN** only non-DONE tickets are counted in `openTicketCount`

#### Scenario: DEVELOPER with no tickets in project appears with count zero
- **WHEN** `GET /projects/:projectId/workload` is called and a DEVELOPER has no tickets in that project
- **THEN** that DEVELOPER appears in the response with `openTicketCount = 0`

#### Scenario: No DEVELOPERs in system returns empty array
- **WHEN** `GET /projects/:projectId/workload` is called and no DEVELOPER-role users exist in the system
- **THEN** the response is an empty array `[]`

#### Scenario: Non-existent project returns 404
- **WHEN** `GET /projects/:projectId/workload` is called with a projectId that does not exist
- **THEN** the response status is 404

#### Scenario: Unauthenticated request is rejected
- **WHEN** `GET /projects/:projectId/workload` is called without a valid JWT token
- **THEN** the response status is 401
