# TaskFlow — Task Management & Quality Engineering Platform

**A full-stack task management application with an integrated Quality Assurance environment, built to demonstrate practical software testing, test management, API automation and database integrity verification.**

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=flat&logo=react&logoColor=61DAFB)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat&logo=nodedotjs&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=flat&logo=postgresql&logoColor=white)
![Drizzle ORM](https://img.shields.io/badge/Drizzle_ORM-C5F74F?style=flat&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat&logo=vite&logoColor=white)

---

## Overview

TaskFlow is a full-stack task management application enhanced with an integrated Quality Assurance (QA) environment.

The project demonstrates how software quality can be incorporated throughout the Software Development Life Cycle (SDLC), from requirements engineering and test case design to execution, defect management, regression testing and reporting.

Rather than treating testing as a separate activity, TaskFlow connects requirements, test cases, test executions and defects through a structured traceability workflow.

The platform consists of three interconnected areas:

- **TaskFlow Core:** Task management, user authentication and productivity features.
- **TaskFlow QA Lab:** Requirements management, test case design, test execution, defect tracking and QA reporting.
- **TaskFlow API Guard:** API regression testing, data-driven validation and PostgreSQL integrity checks.

## Key Features

### 1. Task Management

- User authentication and session management.
- Create, update, complete and delete tasks.
- Task priorities and deadlines.
- Search, filtering and sorting.
- Dashboard with task statistics and progress indicators.
- Profile management and password updates.

### 2. Requirements Management

- Create and maintain software requirements.
- Document Software Requirements Specifications (SRS).
- Define user stories and acceptance criteria.
- Maintain requirement identifiers and traceability.
- Generate and maintain a Requirements Traceability Matrix (RTM).
- Monitor requirement-to-test-case coverage.

### 3. Test Case Management

- Create, update and duplicate test cases.
- Associate test cases with requirements.
- Maintain test scenarios, expected results and test data.
- Organise test cases into test cycles.
- Track test execution status:
  - Not Run
  - Pass
  - Fail
  - Blocked
- Preserve historical execution records.

### 4. Test Execution Management

- Execute test cases and record outcomes.
- Record actual and expected results.
- Maintain tester, environment and browser/device information.
- Associate execution records with test cycles and defects.
- Preserve execution history, including archived snapshots when test cases are deleted.

### 5. Defect Management

- Create and manage defect reports.
- Record severity and priority independently.
- Link defects to requirements and test cases.
- Track defect lifecycle and status changes.
- Maintain defect history.
- Support dependency-aware deletion and explicit reference unlinking.
- Record relevant operations in audit logs.

### 6. API Automation & Validation

- Postman/Newman API regression testing.
- Data-driven negative testing.
- Request and response validation.
- API status-code and business-rule verification.
- Automated HTML/JUnit test reporting.
- PostgreSQL integrity and constraint validation.

### 7. Database Integrity & Recovery

- Composite foreign keys for same-user data ownership.
- Transactional operations for reference updates and deletions.
- Concurrency-safe initialisation using PostgreSQL advisory locks.
- Idempotent initialisation and partial-data recovery.
- Execution-history snapshot preservation.
- Administrative recovery with explicit confirmation and audit logging.

### 8. QA Analytics & Reporting

- Test execution summaries.
- Pass, Fail and Blocked statistics.
- Requirement coverage and traceability.
- Defect tracking and status monitoring.
- QA activity and execution reports.

---

## Technology Stack

| Layer | Technologies |
|---|---|
| Frontend | React 19, TypeScript |
| Styling | Tailwind CSS v4 |
| Build Tool | Vite 8 |
| Backend | Node.js, Express 4 |
| Database | PostgreSQL 18.6 |
| ORM | Drizzle ORM |
| API Testing | Postman, Newman |
| UI Verification | Headless Chromium |
| Authentication | Session-based authentication, Firebase Google Sign-In integration |
| Database Validation | PostgreSQL integrity and constraint testing |

## Quality Engineering Approach

TaskFlow follows a structured testing workflow:

```text
Requirements
     |
     v
Acceptance Criteria
     |
     v
Test Case Design
     |
     v
Requirements Traceability Matrix
     |
     v
Test Cycle & Execution
     |
     +-------> PASS
     |
     +-------> FAIL
                  |
                  v
             Defect Report
                  |
                  v
             Fix & Retest
                  |
                  v
           Regression Testing
                  |
                  v
             Test Closure
                  |
                  v
             QA Reporting
```

The workflow connects requirements, test cases, execution records and defects, allowing test coverage and defect history to be tracked systematically.

## Testing & Verification Results

The following results were obtained during the project's implementation verification against the live application and PostgreSQL database.

| Test Suite | Result |
|---|---:|
| Unit Tests | 18/18 passed |
| Newman API Regression | 34 requests, 178/178 assertions passed |
| Data-Driven API Tests | 7 iterations, 14/14 assertions passed |
| PostgreSQL Integrity Suite | 10/10 checks passed |
| Verification Matrix | VER-01 to VER-09 passed |
| TypeScript Compilation | Passed |
| Production Build | Passed |
| Headless Chromium UI Verification | Passed |

### Areas Covered by Verification

- Authentication and session behaviour.
- Task CRUD operations and filtering.
- Requirements and test case management.
- Requirements traceability.
- Test execution and historical records.
- Defect lifecycle and reference validation.
- Concurrent initialisation and idempotency.
- Database-level same-user ownership enforcement.
- Foreign-key constraints and safe deletion.
- Execution-history preservation.
- Transactional reference updates.
- Administrative recovery and audit logging.

*These results represent the recorded verification run for the current project version. They should not be interpreted as proof of exhaustive testing across every possible scenario or production environment.*

## Database Design & Data Integrity

TaskFlow uses PostgreSQL to maintain relationships between users, requirements, test cases, executions and defects.

Important database-level safeguards include:

- Composite unique constraints.
- Composite foreign keys enforcing same-user ownership.
- `ON DELETE RESTRICT` for protected references.
- Transactional unlinking and deletion.
- Advisory locks for concurrent initialisation.
- Audit records for administrative recovery and reference changes.
- Snapshot fields for preserving historical test execution information.

These mechanisms help prevent orphaned references, cross-user data associations and accidental loss of historical QA records.

## Project Structure

The main source areas are organised as follows:

```text
TaskFlow/
│
├── src/
│   ├── components/
│   │   ├── RequirementsView.tsx
│   │   ├── QaLabView.tsx
│   │   └── DefectsView.tsx
│   │
│   ├── db/
│   │   ├── schema.ts
│   │   └── repository.ts
│   │
│   ├── lib/
│   │   ├── api.ts
│   │   ├── qaTemplates.ts
│   │   ├── types.ts
│   │   ├── postgresValidator.ts
│   │   └── qaIntegrity.test.ts
│   │
│   └── ...
│
├── server.ts
├── package.json
├── vite.config.ts
└── README.md
```

*The structure above highlights the principal files and modules; it is not an exhaustive listing of the repository.*

## Getting Started

### Prerequisites

- Node.js
- npm
- PostgreSQL 18 or a compatible PostgreSQL instance
- Access to a configured database

### Installation

Clone the repository:

```bash
git clone https://github.com/YOUR-USERNAME/TaskFlow.git
```

Navigate into the project:

```bash
cd TaskFlow
```

Install dependencies:

```bash
npm install
```

### Environment Configuration

Configure the required database and application environment variables in your deployment environment.

```env
SQL_HOST=
SQL_USER=
SQL_PASSWORD=
SQL_DB_NAME=

SESSION_SECRET=

PORT=3000
```

For schema initialisation, the application may additionally require:

```env
SQL_ADMIN_USER=
SQL_ADMIN_PASSWORD=
```

Do not commit real credentials, API tokens or secrets to GitHub.

`SESSION_SECRET` should be replaced with a strong, randomly generated value before deployment.

### Running the Application

Use the development command configured in `package.json`:

```bash
npm run dev
```

The application uses port `3000` by default unless another port is configured.

*Database connectivity and schema initialisation must be configured before the application can operate correctly.*

## Running Tests

Run the available verification commands:

**Unit tests**

```bash
npm run test:unit
```

**API regression tests**

```bash
npm run test:api
```

**Data-driven API tests**

```bash
npm run test:api:ddt
```

**TypeScript validation**

```bash
npx tsc --noEmit
```

**Production build**

```bash
npm run build
```

The PostgreSQL integrity suite can also be triggered through the application's QA automation endpoint when the database and application are configured.

## Security & Configuration Notes

- Never commit database credentials or session secrets.
- Use environment variables for sensitive configuration.
- Keep user data isolated through ownership validation and database constraints.
- Use explicit confirmation for destructive operations involving linked records.
- Preserve execution history when test cases are removed.
- Configure production authentication and session security before public deployment.

## Project Objectives

TaskFlow was developed to demonstrate practical understanding of:

- Software Testing Life Cycle (STLC).
- Software Development Life Cycle (SDLC).
- Requirements engineering.
- Test planning and test case design.
- Requirements Traceability Matrix (RTM).
- Manual and automated testing.
- API testing and regression testing.
- Defect lifecycle management.
- Database validation and referential integrity.
- Test reporting and quality assurance.

## Future Improvements

Potential future enhancements include:

- Expanded Playwright end-to-end test coverage.
- GitLab issue integration and CI/CD pipeline execution.
- More comprehensive accessibility testing.
- Security testing and automated vulnerability checks.
- Advanced test analytics and coverage visualisation.

These are potential extensions, not claims of currently completed functionality.

## Author

**Dip Biswas Shanto**

B.Tech (Honours with Research) in Computer Science & Engineering

Interested in Software Quality Engineering, Test Automation, Artificial Intelligence and Backend Development.

## Disclaimer

TaskFlow is an educational and portfolio project developed to demonstrate full-stack development and Quality Engineering practices. It is not presented as a certified commercial test management product.

---

**If you find this project interesting, feel free to explore the repository and its implementation.**
