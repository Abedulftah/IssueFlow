# IssueFlow — Run Instructions

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- [Docker](https://www.docker.com/) (for PostgreSQL and Mailpit)
- npm (bundled with Node.js)

---

## 1. Install Dependencies

```bash
npm install
```

---

## 2. Start the Database (and Mail Server)

Docker Compose starts PostgreSQL on port `5432` and Mailpit (SMTP dev server) on ports `1025` / `8025`.

**Prerequisite:** Make sure Docker is running on your system before proceeding.

```bash
docker compose up -d
```

Verify both containers are running:

```bash
docker compose ps
```

Database connection details (configured in `src/app.module.ts`):

| Setting  | Value      |
|----------|------------|
| Host     | localhost  |
| Port     | 5432       |
| Database | issueflow  |
| Username | issueflow  |
| Password | issueflow  |

---

## 3. Build

Compile TypeScript to `dist/`:

```bash
npm run build
```

---

## 4. Run the Application

**Development mode** (watch — auto-reloads on file changes):

Ensure the `.env` file is present in the project root and personlized before running:

```bash
npm run start:dev
```

**Production mode** (requires a prior build):

```bash
npm run start:prod
```

The API is available at `http://localhost:3000`.

---

## 5. User Management

Registration is open — no token is required to create an account.

### Step 1 — Create a new user

```bash
curl -X POST http://localhost:3000/users \
  -H "Content-Type: application/json" \
  -d '{
    "username": "jdoe",
    "email": "jdoe@example.com",
    "fullName": "John Doe",
    "role": "DEVELOPER",
    "password": "changeme"
  }'
```

Valid values for `role`: `ADMIN`, `DEVELOPER`.

### Step 2 — Log in

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "jdoe", "password": "changeme"}'
```

Response:

```json
{
  "accessToken": "<YOUR_JWT_TOKEN>",
  "tokenType": "Bearer",
  "expiresIn": 3600
}
```

Copy the `accessToken` value — you will use it in the `Authorization` header for all subsequent requests.

### Step 3 — Verify your identity

```bash
curl http://localhost:3000/auth/me \
  -H "Authorization: Bearer <YOUR_JWT_TOKEN>"
```

### Step 4 — Log out (invalidate the token)

```bash
curl -X POST http://localhost:3000/auth/logout \
  -H "Authorization: Bearer <YOUR_JWT_TOKEN>"
```

---

## 6. Run Tests

### Unit tests

```bash
npm run test
```

### Single test file

```bash
npx jest src/tickets/tickets.service.spec.ts
```

### E2E tests

The E2E suite requires the database to be running (step 2).

```bash
npm run test:e2e
```

### Test coverage report

```bash
npm run test:cov
```

---

## 7. Lint

Auto-fix linting errors:

```bash
npm run lint
```

---

## 8. Stop Services

```bash
docker compose down
```
