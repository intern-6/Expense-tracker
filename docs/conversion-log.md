# Conversion Log — Todo App → Expense Tracker

This document describes, step by step, everything that happened when the original
Todo app was converted into the basic Expense Tracker. Each step follows the same
format:

- **WHAT** — the concrete change
- **WHY** — the reason for the change
- **IMPACT** — the consequences / ripple effects

The starting point was a single-commit Todo app: Express + Prisma + PostgreSQL,
with `User` and `Todo` models, `/auth/*` and `/todos/*` routes, and a single-page
frontend. The goal was to replace **only** the Todo functionality with basic
expense tracking, keeping the existing architecture, auth flow, JWT middleware,
database connection and Docker setup.

---

## Step 1 — Data model: `Todo` → `Expense`

**WHAT**
In `prisma/schema.prisma`:

- Removed the `Todo` model (`task`, `completed`).
- Added the `Expense` model with `id`, `title`, `amount Float`, `userId`, and the
  `user` relation.
- Renamed `User.todos` to `User.expenses`.
- The `generator` and `datasource` blocks were left exactly as they were.

**WHY**
The domain changed from tasks to money. An expense needs a title and an amount;
the `completed` boolean has no meaning for an expense. Keeping the same overall
shape (`id` + fields + `userId` + relation) preserves the existing Prisma
architecture and the `User → child` relationship.

**IMPACT**
The generated client now exposes `prisma.expense` (and no longer `prisma.todo`).
Every query had to be re-pointed at the new model, and the database table changes
from `todos` to `expenses` (applied with `prisma db push`). Auth and server wiring
were unaffected.

---

## Step 2 — Routes: `todoRoutes` → `expenseRoutes`

**WHAT**
Renamed `src/routes/todoRoutes.js` to `src/routes/expenseRoutes.js` and replaced
the CRUD handlers:

| Method & path      | Behaviour                                             |
| ------------------ | ----------------------------------------------------- |
| `GET /`            | `prisma.expense.findMany({ where: { userId } })`      |
| `POST /`           | `prisma.expense.create({ data: { title, amount, userId } })` |
| `DELETE /:id`      | `prisma.expense.deleteMany({ where: { id, userId } })` |

- Removed the `PUT` "mark complete" endpoint.
- Fixed two latent bugs that the conversion surfaced:
  - `prisma.toso.create` → `prisma.expense.create` (typo would have thrown).
  - `parseInt(userId)` → `parseInt(id)` in the delete lookup (wrong variable).

**WHY**
This router *is* the expense API. The todo "mark done" action has no expense
equivalent, so it was dropped instead of being left as dead code. `deleteMany`
was used rather than `delete` because Prisma's `delete` requires a unique
where-clause; `deleteMany` with `id` + `userId` keeps the ownership check so a
user can only delete their own expenses. The typo/parameter fixes were mandatory —
the create and delete paths would have thrown at runtime.

**IMPACT**
New API surface: `GET`, `POST`, `DELETE` on `/expenses` (no `PUT`). Responses are
expense objects. Ownership is enforced on delete.

---

## Step 3 — Server: mount the new router

**WHAT**
In `src/server.js`:

- Imported `expenseRoutes` from `./routes/expenseRoutes.js`.
- Mounted it behind `authMiddleware` at `/expenses` (previously `/todos`).

**WHY**
Wire the new router into Express under a resource-appropriate path, keeping the
JWT middleware in front of it exactly as before.

**IMPACT**
`/expenses` is live and protected; `/todos` no longer exists. Static file serving
and `GET /` are unchanged.

---

## Step 4 — Auth: seed a welcome expense

**WHAT**
In `src/routes/authRoutes.js`, the post-registration seed changed from a default
todo to a default expense:

```js
const defaultExpense = `Hello :) Add your first expense!`
await prisma.expense.create({
    data: { title: defaultExpense, amount: 0, userId: user.id }
})
```

**WHY**
Preserve the original "give a brand-new user their first item" onboarding
behaviour, expressed in the expense domain. `amount: 0` avoids inventing a fake
value.

**IMPACT**
Every new account starts with one $0.00 welcome expense. Password hashing and
JWT issuance are untouched.

---

## Step 5 — Auth: return a correct `401` on invalid password

**WHAT**
In `src/routes/authRoutes.js`, the login handler used `req.status(401)` (a typo —
`req` has no `status` method). Changed to `res.status(401)`.

**WHY**
`req.status(...)` throws a `TypeError`, which was swallowed by the surrounding
`try/catch` and turned into a `503`. A wrong password should return `401`.

**IMPACT**
Invalid credentials now return `401 { "message": "password is invalid" }` instead
of `503`. No other behaviour changes.

---

## Step 6 — Frontend: the expense tracker UI

**WHAT**
`public/index.html`:

- Header shows the count **and** a running total.
- Expense cards render `title` and `$amount.toFixed(2)` with a Delete button.
- The add form has `titleInput` + `amountInput`.
- Removed the All / Open / Complete tabs and all todo-only JS (`selectedTab`,
  `changeTab`, `updateTodo`, `renderTodos`, ...).

`public/styles.css`:

- Renamed `.todo-item` / `.todo-buttons` to `.expense-item` / `.expense-buttons`.
- Removed the now-unused tab and "complete" styles.

**WHY**
The UI must reflect the expense model and the new API. Tabs and a "Done" action
are todo-specific. The total is a baseline expense-tracker expectation and is
computed client-side from the already-fetched list, so no extra endpoint is needed.

**IMPACT**
Users can add (title + amount), list and delete expenses; the header updates the
count and total on every render. The auth screen and flow are unchanged.

---

## Step 7 — Sample requests

**WHAT**
Renamed `todo-app.rest` to `expense-app.rest` and updated the requests to
`/expenses` with `{ "title", "amount" }`, plus a `DELETE` example.

**WHY**
Keep the runnable API samples in sync with the real endpoints so the file stays
useful for manual testing.

**IMPACT**
Documentation/samples only; no runtime effect.

---

## Step 8 — Legacy SQLite helper

**WHAT**
In `src/db.js`, the `todos` table became `expenses` (`title TEXT`, `amount REAL`).

**WHY**
This file is imported nowhere, but leaving a `todos` table in the repository
would be misleading. Updated purely for consistency with the new domain.

**IMPACT**
None at runtime (legacy/dead file). Keeps the codebase coherent.

---

## Step 9 — Prisma runtime: align the client to v7 + add the pg adapter

**WHAT**
- `package.json` / `package-lock.json`: `@prisma/client` `^6.19.3` → `^7.10.1`;
  added `@prisma/adapter-pg` `^7.10.1`; refreshed the `allowScripts` entry.
- `src/prismaClient.js` now imports `PrismaClient` from the generated client and
  constructs it with the driver adapter:

```js
import { PrismaClient } from './generated/prisma/client.ts'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })

const prisma = new PrismaClient({ adapter })
```

**WHY**
This was a **pre-existing defect**, not something the conversion introduced. The
schema uses Prisma 7's `prisma-client` generator (output `src/generated/prisma`),
but `@prisma/client` was pinned to v6. As a result `import { PrismaClient } from
'@prisma/client'` threw `@prisma/client did not initialize yet` and the server
could not boot at all. Prisma 7 also requires an explicit driver adapter to talk
to the database. Aligning the client to v7 and adding `@prisma/adapter-pg` fixes
the connection **without** changing the schema.

**IMPACT**
The server boots and can connect to PostgreSQL. Requires `npm install` (new
dependency) and `npx prisma generate`. The Docker setup is untouched.

---

## Step 10 — Documentation

**WHAT**
Added `README.md` (overview, stack, structure, setup, environment variables, data
model, full API reference, auth flow, frontend notes, known quirks) and this
`docs/conversion-log.md`.

**WHY**
The project had no documentation. A learning project should explain what it is,
how to run it, and how it evolved.

**IMPACT**
Documentation only; no runtime effect.

---

## Summary of the final state

- **Models:** `User`, `Expense`
- **Routes:** `POST /auth/register`, `POST /auth/login`, `GET/POST/DELETE /expenses`
- **Frontend:** auth screen + expense dashboard (add / list / total / delete)
- **Database:** PostgreSQL, schema synced with `npx prisma db push`
- **Runtime:** Node.js 22, Express 5, Prisma 7 + `@prisma/adapter-pg`
- **Unchanged:** auth flow, JWT middleware, Express config, Docker setup
