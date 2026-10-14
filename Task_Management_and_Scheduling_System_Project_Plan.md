# Task Management and Scheduling System

**Project Requirements, Feature Plan, Database Design and Development Roadmap**

| | |
|---|---|
| **Application type** | Personal productivity + team task management |
| **Suggested stack** | MongoDB, Express.js, React, Node.js (MERN) |
| **Core goal** | Create, schedule, assign, track, and review tasks |

*Prepared as a practical planning document for a portfolio-ready web application.*

---

## 1. Project Overview

The Task Management and Scheduling System is a web application that helps individuals and teams organize, schedule, assign, and track activities. Users can manage personal tasks, assign tasks to other people, create recurring activities, divide large tasks into subtasks, and review a reliable history of task progress.

The system supports both personal and collaborative use. A task can belong to an owner, be assigned to one or more users (depending on the product rules), and have its own permissions, deadlines, status, category, and activity history.

### Primary objectives

- Make task creation and day-to-day planning simple.
- Support one-time tasks and recurring daily, weekly, or monthly activities.
- Track status, deadlines, duration, and completion history.
- Support subtasks, categories, priorities, and collaboration.
- Store important task events and timestamps for accountability and reporting.

---

## 2. Core Requirements and Features (Merged)

This section combines the core requirements with the suggested new features into one prioritized list. Build the **Core** items first to reach a strong minimum viable product (MVP); add **Enhancement** items in stages once the core workflows are reliable.

| Feature | Requirement / Value to users | Type | Priority |
|---|---|---|---|
| **Task creation and assignment** | Users can create multiple tasks with a title, description, owner, assignee(s), category, priority, start date, deadline, and estimated duration. | Core | MVP / High |
| **Scheduling and recurrence** | A task can be scheduled once or repeat daily, weekly, or monthly. Recurrence settings may include selected weekdays, end date, and time zone. | Core | MVP / High |
| **Duration and time tracking** | Users can set an estimated duration and optionally record actual time spent. Start/end timestamps can support reporting. | Core | MVP / High |
| **Status and flags** | Use defined statuses such as To Do, In Progress, Completed, and Cancelled. Show Overdue as a derived condition when a due date has passed and the task is still incomplete. | Core | MVP / High |
| **Recurring completion tracking** | Each scheduled occurrence has its own status, so completing today's task does not automatically complete tomorrow's occurrence. | Core | MVP / High |
| **Categories and labels** | Users can group tasks into categories such as Study, Development, Personal, Office, Health, or custom categories. | Core | MVP / High |
| **Main tasks and subtasks** | A task can contain subtasks. Show overall progress based on completed subtasks, while allowing the parent task to have its own status. | Core | MVP / High |
| **Database history** | Store creation and update timestamps, completion time, and an activity log of important changes such as assignment, deadline, and status updates. | Core | MVP / High |
| **Dashboard and analytics** | Counts for total, completed, pending, and overdue tasks; completion rate and weekly trends. | Enhancement | MVP / High |
| **Search, filters, and sorting** | Find tasks by keyword, status, priority, category, assignee, or date. | Enhancement | MVP / High |
| **Calendar view** | See deadlines and scheduled occurrences by day, week, or month. | Enhancement | High |
| **Kanban board** | Move tasks between To Do, In Progress, and Done columns. | Enhancement | High |
| **Notifications and reminders** | Reminders before due dates, overdue alerts, and assignment notifications. | Enhancement | High |
| **Archive and restore** | Keep completed or old tasks out of the main view without losing history. | Enhancement | High |
| **Dark mode and responsive UI** | Make the application comfortable on desktop and mobile screens. | Enhancement | High |
| **Collaboration and comments** | Allow team members to comment, discuss, and view relevant activity. | Enhancement | Medium |
| **Task dependencies** | Represent tasks that must be completed before another task can begin. | Enhancement | Medium |
| **Estimated vs actual time** | Compare planned duration with actual effort to improve future estimates. | Enhancement | Medium |
| **Habit streaks** | Show consecutive days or weeks of completing recurring activities. | Enhancement | Medium |
| **Attachments and links** | Attach relevant documents, screenshots, or external references to a task. | Enhancement | Medium |
| **Export reports** | Export selected tasks or productivity summaries to CSV or PDF. | Enhancement | Later |

---

## 3. Recommended Task Status Model

| Status / condition | Meaning |
|---|---|
| **To Do / Pending** | The task exists but work has not started. |
| **In Progress** | Work has started but the task is not complete. |
| **Completed** | The user has finished the task; store `completedAt`. |
| **Cancelled** | The task will not be completed and is no longer active. |
| **Overdue (derived)** | The deadline has passed and the task is not completed or cancelled. |
| **Missed occurrence** | A recurring task occurrence was not completed within its configured completion window. |

---

## 4. Recurring Task Logic (Important)

Do not store only one status on a recurring task and overwrite it every day. Keep a reusable recurrence definition separate from individual scheduled occurrences.

**Example:** "Practice JavaScript" repeats every day for 30 minutes.

| Scheduled date | Occurrence status | Completion record |
|---|---|---|
| 14 October | Completed | `completedAt` is recorded for 14 October |
| 15 October | Pending | No completion time yet |
| 16 October | Missed | Occurrence was not completed within its rule/window |
| 17 October | Pending | A new occurrence is available |

> **Recommended design:** a Recurring Task definition stores the title, schedule rule, duration, and owner. A Task Occurrence record stores the scheduled date, status, completion timestamp, and actual duration for that specific date.

Define how missed tasks work: for example, mark an occurrence missed after its completion window ends, allow users to skip it, or allow completion late with an audit record. Avoid silently changing historical records.

---

## 5. Suggested MongoDB Data Model

A practical starting point is to use separate collections for users, tasks, and categories. Add task occurrences, activity history, and notifications when those features are implemented.

| Collection | Example fields | Purpose |
|---|---|---|
| **User** | name, email, passwordHash, role, timeZone, createdAt | Account, identity, permissions, and preferred time zone. |
| **Task** | title, description, ownerId, assigneeIds, categoryId, priority, status, startAt, dueAt, estimatedDurationMinutes, parentTaskId, recurrenceRule, createdAt, updatedAt | Task definition and current task metadata. |
| **TaskOccurrence** | taskId, scheduledFor, status, completedAt, actualDurationMinutes, notes | One scheduled instance of a recurring task. |
| **TaskActivity** | taskId, actorId, action, oldValue, newValue, timestamp | Audit trail for assignments, status changes, deadline changes, and completion. |
| **Category** | name, color, ownerId, createdAt | System or user-defined task categories. |
| **Notification** | userId, taskId, type, scheduledAt, sentAt, readAt | Reminder and assignment notification state. |

### Suggested relationships

- One user can own many tasks.
- A task may be assigned to one or multiple users, based on the product's rules.
- A task can have a `parentTaskId` pointing to a main task; a null value means it is a top-level task.
- A recurring task can have many `TaskOccurrence` records, normally one per scheduled date/time.
- A task can have many `TaskActivity` records, each identifying who performed the action.
- A category can be referenced by many tasks.

### Key implementation rules

- Use `ownerId` to identify who controls the task and `assigneeIds` to identify who is expected to do the work.
- Enforce authorization in the backend on every read and write. Do not trust a task ID from the client by itself.
- Store timestamps consistently in UTC and display them in each user's local time zone.
- Use a controlled enum or schema validation for statuses, priorities, and recurrence rules.
- Calculate overdue state from `dueAt` and the current status; avoid saving a stale overdue boolean as the source of truth.
- Use indexes for common queries such as `ownerId + status`, `assigneeIds + status`, `dueAt`, and `taskId + scheduledFor`.
- Decide how deleting a parent task affects its subtasks and history. Soft delete or archive is safer for a task system with audit records.

---

## 6. Personal + Team Use: Roles and Permissions

| Role / relationship | Suggested permissions |
|---|---|
| **Task owner** | Manage task details, schedule, category, priority, assignees, and deletion/archive, subject to workspace rules. |
| **Assignee** | View assigned tasks, update allowed status fields, add comments, and record completion or time spent. |
| **Workspace admin** | Manage members, workspace settings, and organization-level access where applicable. |
| **Personal task** | Visible only to its owner unless explicitly shared. |
| **Shared/team task** | Visible to authorized workspace members; editing rights depend on role and assignment. |

---

## 7. Suggested Pages and User Interface

| Page | Main contents |
|---|---|
| **Login / Registration** | Sign up, sign in, password reset, and account settings. |
| **Dashboard** | Today's tasks, upcoming deadlines, task summary cards, and productivity trends. |
| **My Tasks** | List view with search, filters, sorting, and quick status updates. |
| **Team Tasks** | Tasks assigned to me, tasks I assigned, team members, and ownership details. |
| **Task Details** | Description, priority, schedule, category, comments, subtasks, attachments, and activity history. |
| **Calendar** | Daily, weekly, and monthly scheduling views. |
| **Recurring Tasks** | Recurrence settings and a history of individual occurrences. |
| **Categories** | Create and manage categories, labels, and category colors. |
| **Reports / Settings** | Completion statistics, export, notification preferences, time zone, and appearance. |

---

## 8. Example REST API Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/tasks` | Create a task. |
| GET | `/api/tasks` | List tasks visible to the current user; support query filters. |
| GET | `/api/tasks/:taskId` | Get task details after checking access permissions. |
| PATCH | `/api/tasks/:taskId` | Update task fields allowed for the current user. |
| DELETE | `/api/tasks/:taskId` | Archive or delete a task according to retention rules. |
| POST | `/api/tasks/:taskId/subtasks` | Create a subtask under a main task. |
| POST | `/api/tasks/:taskId/occurrences` | Create or complete an occurrence, depending on the endpoint design. |
| GET | `/api/tasks/:taskId/activities` | Read the permitted activity history. |
| GET | `/api/dashboard/summary` | Return counts and summaries for the dashboard. |
| POST | `/api/tasks/:taskId/assignees` | Assign one or more users after permission checks. |

> **API note:** the endpoint list is a starting proposal. Keep the API consistent, validate all inputs, authenticate requests, and check authorization on the server for every task and occurrence.

---

## 9. Security and Reliability Considerations

- Hash passwords using a modern password-hashing algorithm; never store plaintext passwords.
- Use authentication and role-based or relationship-based authorization.
- Validate request bodies and query parameters; enforce reasonable length and size limits.
- Protect against cross-user access by checking ownership, assignment, or workspace membership on every request.
- Rate-limit sensitive endpoints such as login, invitations, and notification-triggering actions.
- Keep secrets in environment variables or a secret manager, not in source control.
- Record important security and task events, but avoid placing passwords, access tokens, or unnecessary sensitive data in logs.
- Use reliable background jobs for reminders and recurring occurrence creation; make jobs idempotent to avoid duplicates.

---

## 10. Development Roadmap

| Phase | Build | Completion goal |
|---|---|---|
| **Phase 1 — Core MVP** | Authentication, task CRUD, category, priority, due date, status, basic dashboard. | A user can securely manage personal tasks. |
| **Phase 2 — Task structure** | Subtasks, owner/assignee model, activity log, archive/restore. | Tasks can be organized and shared safely. |
| **Phase 3 — Recurrence** | Daily/weekly/monthly rules, occurrence records, per-occurrence status and completion timestamps. | Recurring tasks preserve accurate history. |
| **Phase 4 — Planning UI** | Calendar, Kanban, search, filtering, sorting, responsive design. | Users can plan and navigate tasks efficiently. |
| **Phase 5 — Team workflow** | Comments, assignment notifications, reminders, team permissions. | Users can coordinate work with others. |
| **Phase 6 — Analytics and polish** | Time tracking, productivity charts, exports, accessibility, testing, deployment. | A portfolio-ready release with reliable reporting. |

---

## 11. MVP Acceptance Checklist

- [ ] A registered user can create, view, update, archive, and restore tasks.
- [ ] A task can have a category, priority, due date, estimated duration, and status.
- [ ] A user can create subtasks and view parent-task progress.
- [ ] A user can assign tasks to authorized team members and see tasks assigned to them.
- [ ] Personal tasks are private by default; shared tasks follow explicit permissions.
- [ ] A recurring task produces separate occurrence records for each scheduled date.
- [ ] Completing one occurrence does not complete future occurrences.
- [ ] Creation, update, completion, and important status-change timestamps are recorded.
- [ ] The dashboard correctly distinguishes pending, in-progress, completed, overdue, and missed occurrences.
- [ ] Backend tests verify that one user cannot access another user's unauthorized tasks.
- [ ] Reminder jobs do not create duplicate occurrences or duplicate notifications when retried.

---

## 12. Final Recommendations

Because the application will support both personal and team task management, design the data model around ownership, assignment, and permissions from the beginning. The owner and assignee are not always the same person. Keep recurring schedules separate from occurrence history so each day or week can be tracked independently.

Build the MVP first: authentication, task CRUD, categories, priority, subtasks, deadlines, recurrence, per-occurrence completion tracking, and a dashboard. Then add collaboration, notifications, calendar/Kanban views, time tracking, and reporting.

### Recommended first milestone

> A user can create a task, assign it to a teammate, set a due date and duration, split it into subtasks, and track each recurring occurrence without losing previous history.

*End of project plan*
