## ADDED Requirements

### Requirement: Scan behaviour is preserved
The system SHALL preserve existing scan behaviour after the refactor.

#### Scenario: Scan still finds repos
- **GIVEN** a tree of repos
- **WHEN** the scan runs
- **THEN** the same repos are discovered as before
