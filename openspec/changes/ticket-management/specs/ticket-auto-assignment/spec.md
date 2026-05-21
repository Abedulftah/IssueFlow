## ADDED Requirements

### Requirement: Auto-assign on ticket creation
The system SHALL automatically assign a ticket to the DEVELOPER in the project with the fewest non-DONE tickets when `assigneeId` is absent in `POST /tickets`. If no DEVELOPER users exist in the project, `assigneeId` SHALL remain `null`. Auto-assignment SHALL only trigger on ticket creation, never on update.

#### Scenario: Assignee absent — auto-assigned to least-loaded DEVELOPER
- **WHEN** `POST /tickets` is submitted without `assigneeId` and the project has two DEVELOPER users with 3 and 5 non-DONE tickets respectively
- **THEN** the system SHALL assign the ticket to the DEVELOPER with 3 non-DONE tickets

#### Scenario: Tie-break by earliest createdAt
- **WHEN** `POST /tickets` is submitted without `assigneeId` and two DEVELOPERs have the same number of non-DONE tickets
- **THEN** the system SHALL assign the ticket to the DEVELOPER with the earlier `createdAt` timestamp

#### Scenario: No DEVELOPERs in project — assigneeId remains null
- **WHEN** `POST /tickets` is submitted without `assigneeId` and the project has no users with role `DEVELOPER`
- **THEN** the created ticket SHALL have `assigneeId: null`

#### Scenario: Explicit assigneeId skips auto-assignment
- **WHEN** `POST /tickets` is submitted with an explicit `assigneeId`
- **THEN** the system SHALL use the provided `assigneeId` and SHALL NOT run the auto-assignment query


### Requirement: Auto-assignment counts only non-DONE tickets
The system SHALL count only tickets with `status != DONE` (and `deletedAt IS NULL`) when computing the load for each DEVELOPER during auto-assignment.

#### Scenario: DONE tickets excluded from load count
- **WHEN** DEVELOPER A has 5 DONE tickets and 1 non-DONE ticket, and DEVELOPER B has 0 DONE tickets and 2 non-DONE tickets
- **THEN** the system SHALL assign the new ticket to DEVELOPER A (load: 1 vs 2)
