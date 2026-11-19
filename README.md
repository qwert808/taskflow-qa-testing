# TaskFlow — Web Application QA & Testing Lab

A full-stack web application integrated with a dedicated Quality Assurance (QA) testing environment, designed to demonstrate practical software testing, API validation, defect management and database verification.

TaskFlow combines a functional task management platform with an integrated testing laboratory, enabling structured test execution, issue tracking and application quality assessment.

---

## Overview

**TaskFlow** is a web-based task management application built with React, Express.js, Drizzle ORM, Firebase Authentication and PostgreSQL.

Beyond its core application functionality, TaskFlow includes an integrated QA environment that supports test case management, defect tracking, API testing and SQL-based database validation.

The project demonstrates practical implementation of software testing methodologies and quality assurance workflows across frontend, backend and database layers.

## Key Features

### 1. User Authentication & Security
- Email and password registration and authentication.
- Google Sign-In integration using Firebase Authentication.
- Inline form validation and password visibility controls.
- Duplicate email detection and rejection.
- Session termination and token revocation on sign-out.
- Protected workspace routes and authenticated API access.
- Strict user-level data isolation.

### 2. Task Management
- Create, edit, complete, reopen and delete tasks.
- Task priorities: High, Medium and Low.
- Task statuses: Pending and Completed.
- Deadline management and configurable past-deadline validation.
- User-specific task ownership and access restrictions.

### 3. Search, Filtering & Sorting
- Live search across task titles and descriptions.
- Filter tasks by status and priority.
- Sort by creation date and deadline.
- Dedicated empty-state and no-match handling.

### 4. User Profile Management
- View account information and metadata.
- Update display name and email.
- Change password with confirmation validation.
- Duplicate email and invalid input detection.

### 5. Dashboard & Analytics
- Total, completed, pending and overdue task counts.
- Task priority distribution.
- Completion percentage and progress visualisation.
- Optional sample task loader for testing scenarios.

---

## Integrated QA & Testing Environment

The project's central component is its dedicated QA laboratory, designed to support structured software testing and defect management.

### Test Case Management
- 30 pre-populated test cases (TC-001 to TC-030).
- PostgreSQL-backed test case management.
- Editable execution status and actual results.
- Defect linking and execution date tracking.
- Module-based and status-based filtering.
- CSV export functionality.

### Bug & Defect Management
- GitLab-style issue tracking workflow.
- Separate severity and priority classifications.
- Defect lifecycle management:
  - Open
  - In Progress
  - Retesting
  - Closed
- Defect documentation and test case association.

### API Testing Workbench
- Live REST API request execution.
- Coverage of all nine TaskFlow API endpoints.
- Validation of successful and unsuccessful requests.
- HTTP response and error handling checks.
- Unauthenticated access validation (401 responses).

### SQL
