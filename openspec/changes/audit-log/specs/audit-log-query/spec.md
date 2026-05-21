## ADDED Requirements

### Requirement: GET /audit-logs endpoint
The system SHALL expose `GET /audit-logs` protected by JWT AuthGuard. It SHALL accept optional query parameters: `entityType` (string), `entityId` (string), `action` (string), `actor` (`USER` | `SYSTEM`), `page` (integer, default 1), `pageSize` (integer, default 20). It SHALL return `{ data: AuditLog[], total: number, page: number }`.

#### Scenario: Query all audit logs (no filters)
- **WHEN** an authenticated user calls `GET /audit-logs` with no query params
- **THEN** the response is `200 OK` with `{ data: [...], total: <count>, page: 1 }` containing all entries ordered by `timestamp` descending

#### Scenario: Filter by entityType and entityId
- **WHEN** `GET /audit-logs?entityType=Ticket&entityId=<uuid>` is called
- **THEN** only entries matching both `entityType = "Ticket"` and `entityId = <uuid>` are returned

#### Scenario: Filter by actor
- **WHEN** `GET /audit-logs?actor=SYSTEM` is called
- **THEN** only entries with `actor = SYSTEM` are returned

#### Scenario: Filter by action
- **WHEN** `GET /audit-logs?action=AUTO_ASSIGN` is called
- **THEN** only entries with `action = "AUTO_ASSIGN"` are returned

#### Scenario: Pagination
- **WHEN** `GET /audit-logs?page=2&pageSize=10` is called
- **THEN** the response returns at most 10 entries for page 2 and `total` reflects the full unfiltered count

#### Scenario: Unauthenticated request
- **WHEN** `GET /audit-logs` is called without a valid JWT
- **THEN** the response is `401 Unauthorized`

### Requirement: Audit log response shape
Each entry in the `data` array SHALL include: `id`, `action`, `entityType`, `entityId`, `performedBy`, `actor`, `timestamp`. No sensitive fields (e.g., passwords) SHALL appear.

#### Scenario: Response fields present
- **WHEN** `GET /audit-logs` returns entries
- **THEN** each entry object contains exactly the fields: `id`, `action`, `entityType`, `entityId`, `performedBy`, `actor`, `timestamp`
