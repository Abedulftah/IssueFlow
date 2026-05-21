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

```bash
npm run start:dev
```

**Production mode** (requires a prior build):

```bash
npm run start:prod
```

The API is available at `http://localhost:3000`.

---

## 5. Run Tests

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

## 6. Lint

Auto-fix linting errors:

```bash
npm run lint
```

---

## 7. Stop Services

```bash
docker compose down
```
