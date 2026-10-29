# CRM-RACRL

Customer Relationship Management for the full customer lifecycle: **Reach, Acquire, Convert, Retain and Loyalty**.
Software Engineering mini-project, PES University (RR campus, section B).

Team: Balla Santhosh, Dhriti Kamani, Disha Lokesh, Diya Agarwal.

| Part | Tech                                                    | Folder      |
| ---- | ------------------------------------------------------- | ----------- |
| Web  | React 18, Vite, TypeScript, Tailwind CSS, React Query   | `apps/web`  |
| API  | Node.js 20, Express, TypeScript, Zod, Prisma            | `apps/api`  |
| DB   | PostgreSQL 16                                           | (Docker)    |

Design documents (SRS, SAD, Test Plan) are in `docs/`.

---

## 1. First-time setup

You need **Node.js 20 or newer**, **Git**, and **either Docker Desktop or PostgreSQL 16** installed.

```bash
git clone <repo-url>
cd crm-racrl
npm install                 # installs web + API and generates the Prisma client
cp .env.example .env        # Windows: copy .env.example .env
cp .env.example apps/api/.env
```

### Start the database

**Option A, Docker (easiest):**

```bash
docker compose up -d db
```

**Option B, PostgreSQL installed on your laptop:** create a user `crm` with password `crm` and a database `crm`
(or change `DATABASE_URL` in both `.env` files to match your setup).

### Create the tables and load demo data

```bash
cd apps/api
npx prisma migrate deploy   # creates all tables
npm run seed                # 6 users, 200 contacts, 50 leads, 30 deals, orders, points, tickets
cd ../..
```

### Run it

```bash
npm run dev
```

- Web: http://localhost:5173 (the Dashboard shows "API status: ok" when everything is connected)
- API health check: http://localhost:4000/api/v1/health

To run all three parts in Docker instead: `docker compose up --build`.

### Demo accounts (local only)

All use the password `Password@123`.

| Email                | Role                 |
| -------------------- | -------------------- |
| `admin@crm.test`     | Admin                |
| `marketing@crm.test` | Marketing Executive  |
| `manager@crm.test`   | Sales Manager        |
| `rep@crm.test`       | Sales Representative |
| `rep2@crm.test`      | Sales Representative |
| `support@crm.test`   | Support Agent        |

Login itself arrives with CRM-4 and CRM-7.

---

## 2. Where your code goes

The API has one folder per module in `apps/api/src/modules/`. Each `index.ts` lists the stories, owner and
endpoints for that module. Inside a module, keep the same layers (SAD section 4.1):

```
modules/convert/
  convert.router.ts       routes + authenticate/authorize middleware
  convert.controller.ts   reads the request (validate with Zod), sends the response
  convert.service.ts      business rules and transactions; the only file other modules may call
  convert.repository.ts   Prisma queries only
  convert.schema.ts       Zod schemas for request bodies and queries
```

Shared helpers in `apps/api/src/common/`:

- `AppError(status, code, message)`: throw it for any expected error; the error handler formats it.
- `validate(schema)`: middleware that checks `req.body` (or `query`/`params`) with Zod.
- `paginationQuery`, `toSkipTake`, `paged`: use on every list endpoint (max 100 per page).
- `prisma`: the one database client.

On the web side, pages go in `apps/web/src/pages/` and every API call uses `api()` from
`apps/web/src/api/client.ts`. Replace the placeholder page for your module when you start its story.

### Changing the database

Edit `apps/api/prisma/schema.prisma`, then:

```bash
cd apps/api
npx prisma migrate dev --name describe-your-change
```

Commit the new folder in `prisma/migrations/` together with the schema change.

---

## 3. How we work (keeps Jira and the burndown accurate)

1. In Jira, drag your story to **In Progress** when you start it.
2. Create a branch named with the Jira key: `git checkout -b CRM-11-contacts-accounts`
3. Put the key in your commit messages: `CRM-11 add contacts list API`
4. Before pushing, run `npm run lint`, `npm run typecheck` and `npm test`.
5. Push and open a pull request titled `CRM-11 ...`. The repo owner reviews and merges it.
6. Move the Jira story to **Done** only after the PR is merged into `main`.
7. Never push directly to `main`.

Name tests after the Test Plan IDs, e.g. `it('TC-CONV-05 converts a qualified lead', ...)`.

---

## 4. Useful commands

| Command                                     | What it does                          |
| ------------------------------------------- | ------------------------------------- |
| `npm run dev`                               | Run web and API with live reload      |
| `npm test`                                  | Run all tests                         |
| `npm run test:coverage --workspace apps/api` | API tests with coverage (min 70%)    |
| `npm run lint` / `npm run format`           | Check / fix code style                |
| `npm run typecheck`                         | TypeScript checks                     |
| `npm run build`                             | Production build of web and API       |
| `npm run seed --workspace apps/api`         | Reset the database to the demo data   |
| `npx prisma studio` (in `apps/api`)         | Browse the database in your browser   |
