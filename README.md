# Expense Tracker

A small personal expense tracker built with **Node.js, Express, Prisma and PostgreSQL**.

It is the direct evolution of a beginner Todo app. The authentication flow, JWT
middleware, project layout, Express configuration and Docker setup were all kept
intact — only the Todo feature was replaced with basic expense tracking.

---

## Features

- Register / log in with a username + password (bcrypt-hashed passwords, JWT session)
- Create an expense with a **title** and an **amount**
- List all of *your* expenses, with a live count and a running total
- Delete an expense
- Each user only ever sees and manages their own expenses

---

## Tech stack

| Layer          | Choice                                |
| -------------- | ------------------------------------- |
| Runtime        | Node.js 22 (ES modules)               |
| Web framework  | Express 5                             |
| ORM            | Prisma 7 (`prisma-client` generator)  |
| Database       | PostgreSQL                            |
| Auth           | `jsonwebtoken` (JWT) + `bcryptjs`     |
| Driver adapter | `@prisma/adapter-pg`                  |
| Styling        | hand-written CSS + Fanta.css          |

---

## Project structure

```
.
├── prisma/
│   └── schema.prisma            # User + Expense models
├── prisma7.config.ts            # Prisma 7 config (schema path + DATABASE_URL)
├── public/
│   ├── index.html               # single-page UI (auth screen + expense dashboard)
│   ├── styles.css               # app-specific styles
│   └── fanta.css                # base theme
├── src/
│   ├── server.js                # Express app: middleware + route mounting
│   ├── prismaClient.js          # PrismaClient singleton (with the pg adapter)
│   ├── db.js                    # legacy SQLite helper (unused, kept for reference)
│   ├── middleware/
│   │   └── authMiddleware.js    # verifies the JWT and sets req.userId
│   └── routes/
│       ├── authRoutes.js        # POST /auth/register, POST /auth/login
│       └── expenseRoutes.js     # GET/POST/DELETE /expenses
├── expense-app.rest             # sample requests for manual testing
├── DockerFile
├── docker-compose.yaml
└── README.md
```

---

## Prerequisites

- Node.js 22 or newer
- A PostgreSQL database (local install, Docker container, or hosted)
- npm

---

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Create a .env file in the project root (it is gitignored)
#    DATABASE_URL=postgresql://postgres:postgres@localhost:5432/expensetracker
#    JWT_SECRET=your_jwt_secret_here
#    PORT=5003

# 3. Generate the Prisma client into src/generated/prisma
npx prisma generate

# 4. Create the database tables
npx prisma db push

# 5. Start the dev server (auto-reloads on changes)
npm run dev

# 6. Open http://localhost:5003
```

---

## Environment variables

| Variable       | Required | Description                                  |
| -------------- | -------- | -------------------------------------------- |
| `DATABASE_URL` | yes      | PostgreSQL connection string                 |
| `JWT_SECRET`   | yes      | Secret used to sign and verify JWTs          |
| `PORT`         | no       | Port the server listens on (default `5003`)  |

The `.env` file is loaded automatically by the `dev` script via `--env-file=.env`.

---

## Database setup

The schema lives in `prisma/schema.prisma`. The project does **not** commit
migrations, so after changing the schema you sync the database with:

```bash
npx prisma db push
```

`prisma7.config.ts` is what passes `DATABASE_URL` to the Prisma CLI, so you do
not need to hard-code the connection string in the schema.

---

## Data model

### User

| Field      | Type       | Notes                     |
| ---------- | ---------- | ------------------------- |
| `id`       | `Int`      | autoincrement primary key |
| `username` | `String`   | unique                    |
| `password` | `String`   | bcrypt hash               |
| `expenses` | `Expense[]`| relation                  |

### Expense

| Field   | Type     | Notes                     |
| ------- | -------- | ------------------------- |
| `id`    | `Int`    | autoincrement primary key |
| `title` | `String` |                           |
| `amount`| `Float`  |                           |
| `userId`| `Int`    | foreign key -> `User.id`  |
| `user`  | `User`   | relation                  |

---

## API reference

Base URL: `http://localhost:5003`

> **Note:** every `/expenses` route reads the token from the `Authorization`
> header and expects the **raw JWT** (no `Bearer ` prefix).

### `POST /auth/register`

Creates a user, seeds a welcome expense, and returns a token.

```json
// request body
{ "username": "you@example.com", "password": "123456" }

// 200 response
{ "token": "<jwt>" }
```

### `POST /auth/login`

```json
// request body
{ "username": "you@example.com", "password": "123456" }

// 200 response
{ "token": "<jwt>" }

// 404 -> user not found
// 401 -> password is invalid
```

### `GET /expenses`

Returns every expense belonging to the logged-in user.

```
Authorization: <jwt>
```

```json
[
  { "id": 1, "title": "Hello :) Add your first expense!", "amount": 0, "userId": 1 },
  { "id": 2, "title": "Groceries", "amount": 42.5, "userId": 1 }
]
```

### `POST /expenses`

```json
// request body
{ "title": "Groceries", "amount": 42.5 }

// 200 response
{ "id": 2, "title": "Groceries", "amount": 42.5, "userId": 1 }
```

### `DELETE /expenses/:id`

```json
// 200 response
{ "message": "Expense deleted" }
```

---

## Authentication flow

1. The client POSTs `username` + `password` to `/auth/register` or `/auth/login`.
2. The server hashes the password with **bcrypt** on register, or compares it
   with `bcrypt.compareSync` on login.
3. The server signs a JWT containing `{ id: user.id }` with `JWT_SECRET`,
   valid for 24 hours, and returns it.
4. The client stores the token in `localStorage`.
5. Every `/expenses` request sends the token in the `Authorization` header.
6. `authMiddleware` verifies the token and attaches `req.userId`, which the
   expense routes use to scope every query to the logged-in user.

---

## Frontend notes

- Everything lives in `public/index.html`; the auth screen and the dashboard are
  toggled with `display`.
- `expenses` holds the fetched list and `renderExpenses()` rebuilds the DOM.
- The header total is computed on the client from the already-fetched list:
  `expenses.reduce((sum, e) => sum + e.amount, 0)`.
- The add form uses `titleInput` + `amountInput`; the amount is parsed with
  `parseFloat()` before being sent.

---

## Available scripts

| Script       | Command                                          |
| ------------ | ------------------------------------------------ |
| `dev`        | `node --watch --env-file=.env ./src/server.js`   |
| `postinstall`| `prisma skills sync`                             |

---

## Known quirks / limitations

- The frontend validates `username` as an email address (it must contain `@`).
- `src/db.js` is unused legacy SQLite code kept only for reference.
- The `Authorization` header expects the raw token, not `Bearer <token>`.
- No migrations folder is committed; use `npx prisma db push` after schema changes.

---

## License

ISC
