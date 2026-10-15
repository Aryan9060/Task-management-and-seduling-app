# Task Management and Scheduling System

A full-stack personal productivity and team task management web application built with the **MERN** stack (MongoDB, Express.js, React, Node.js).

---

## Features

- **Task Management** — Create, update, delete, and track tasks with title, description, priority, deadline, and estimated duration
- **Task Status** — To Do, In Progress, Completed, Cancelled; Overdue derived automatically from deadline
- **Categories** — Organize tasks into custom categories (Study, Development, Personal, Health, etc.)
- **Subtasks** — Break tasks into subtasks with individual completion tracking; the parent shows completed/total progress
- **Assignees** — Assign tasks to other users; assignees can view their assigned tasks and update status, while only the owner can edit everything else
- **Activity log** — Automatic audit trail per task: status, priority, due/start date, category, and assignee changes, plus archive/restore, each with actor and timestamp
- **Recurring Tasks** — Schedule tasks to repeat daily, weekly, or monthly
- **Dashboard & Analytics** — Summary of total, completed, pending, and overdue tasks with weekly trends
- **Authentication** — JWT access + refresh tokens: short-lived access token with an HttpOnly refresh cookie, rotated on every refresh and revocable server-side
- **Responsive UI** — Works on desktop and mobile screens

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, React Router v7, Axios, Vite |
| Backend | Node.js, Express.js |
| Database | MongoDB (Mongoose ODM) |
| Auth | JWT (jsonwebtoken), bcryptjs |
| Dev Tools | Docker (MongoDB container), morgan, express-rate-limit |

---

## Project Structure

```
├── client/                  # React frontend
│   ├── src/
│   │   ├── api/             # Axios API call helpers
│   │   ├── components/      # Reusable UI components
│   │   ├── context/         # React context (auth, etc.)
│   │   ├── pages/           # Page components (Dashboard, Tasks, Categories, Login, Register)
│   │   └── utils/           # Utility functions
│   ├── index.html
│   └── vite.config.js
│
├── server/                  # Express backend
│   ├── src/
│   │   ├── config/          # DB connection and config
│   │   ├── controllers/     # Route handler logic
│   │   ├── middleware/       # Auth, error handling
│   │   ├── models/          # Mongoose models (User, Task, TaskActivity, Category)
│   │   ├── routes/          # API route definitions
│   │   └── utils/           # Helper utilities
│   ├── scripts/
│   │   └── smoke.mjs        # Smoke test script
│   └── .env.example
│
├── docker-compose.yml       # MongoDB container setup
└── README.md
```

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [Docker](https://www.docker.com/) (for running MongoDB locally)

---

### 1. Clone the repository

```bash
git clone <your-repo-url>
cd "Task management and seduling app"
```

### 2. Start MongoDB with Docker

```bash
docker-compose up -d
```

This starts a MongoDB 7 container on port `27017` with a volume for persistent data.

---

### 3. Set up the server

```bash
cd server
cp .env.example .env
```

Edit `.env` and update the values as needed:

```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/taskapp
JWT_ACCESS_SECRET=your-long-random-secret
JWT_REFRESH_SECRET=a-different-long-random-secret
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL=30d
CLIENT_ORIGIN=http://localhost:5173
```

Install dependencies and start the dev server:

```bash
npm install
npm run dev
```

The API will be available at `http://localhost:5000`.

---

### 4. Set up the client

```bash
cd client
npm install
npm run dev
```

The frontend will be available at `http://localhost:5173`.

---

## API Endpoints

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| GET | `/api/health` | Health check | No |
| POST | `/api/auth/register` | Register a new user, returns access token + sets refresh cookie | No |
| POST | `/api/auth/login` | Login, returns access token + sets refresh cookie | No |
| POST | `/api/auth/refresh` | Exchange the refresh cookie for a new access token (rotates the refresh token) | Cookie |
| POST | `/api/auth/logout` | Revoke the refresh token and clear the cookie | Cookie |
| GET | `/api/auth/me` | Current user | Yes |
| GET | `/api/tasks` | Get all top-level tasks (subtasks are excluded) | Yes |
| POST | `/api/tasks` | Create a task, optionally with assignees | Yes |
| GET | `/api/tasks/:id` | Get a task with its subtasks and progress | Yes |
| PUT | `/api/tasks/:id` | Update a task (owner: all fields; assignee: status only) | Yes |
| DELETE | `/api/tasks/:id` | Archive a task and its subtasks | Yes |
| POST | `/api/tasks/:id/restore` | Restore a task and its subtasks | Yes |
| POST | `/api/tasks/:id/subtasks` | Create a subtask under a task (owner only) | Yes |
| GET | `/api/tasks/:id/activities` | Activity history for a task | Yes |
| GET | `/api/users` | Search users by name/email (for assignment) | Yes |
| GET | `/api/categories` | Get all categories | Yes |
| POST | `/api/categories` | Create a category | Yes |
| DELETE | `/api/categories/:id` | Delete a category | Yes |
| GET | `/api/dashboard` | Dashboard stats | Yes |

---

## Available Scripts

### Server

| Command | Description |
|---|---|
| `npm run dev` | Start server with file watching (auto-restart) |
| `npm start` | Start server in production mode |
| `npm run smoke` | Run smoke tests against the running API |

### Client

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server with hot reload |
| `npm run build` | Build for production |
| `npm run preview` | Preview the production build |
| `npm run lint` | Lint with oxlint |

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `5000` | Port the Express server listens on |
| `MONGODB_URI` | `mongodb://localhost:27017/taskapp` | MongoDB connection string |
| `JWT_ACCESS_SECRET` | — | Secret for signing short-lived access tokens (required) |
| `JWT_REFRESH_SECRET` | — | Secret for signing refresh tokens (required, must differ from the access secret) |
| `ACCESS_TOKEN_TTL` | `15m` | Access token lifetime |
| `REFRESH_TOKEN_TTL` | `30d` | Refresh token / cookie lifetime |
| `CLIENT_ORIGIN` | `http://localhost:5173` | Allowed CORS origin(s), comma-separated |

---

## License

Aryan
