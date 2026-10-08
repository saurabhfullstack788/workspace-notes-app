# Workspace Notes App

A multi-tenant notes application with PostgreSQL Row-Level Security, role-based access control, and LLM-powered project summarization.

## Quick Start

### Prerequisites

- Node.js 18+
- Docker (for PostgreSQL)

### Setup

```bash
# 1. Clone and install
git clone <repo-url>
cd workspace-notes-app
npm install

# 2. Start PostgreSQL
docker compose up -d

# 3. Copy environment config
cp .env.example .env

# 4. Run database migrations (creates roles, tables, RLS policies, seed data)
npm run db:migrate

# 5. Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Test Accounts (from seed data)

| Email | Password | Acme Corp (WS A) | Globex Inc (WS B) |
|---|---|---|---|
| alice@test.com | password123 | Owner | Viewer |
| bob@test.com | password123 | Editor | — |
| charlie@test.com | password123 | Viewer | Owner |

### Run Tests

```bash
npm test
```

169 tests across 7 suites: isolation, RBAC, CRUD authorization, auth, LLM summarization, security attacks.

### Other Commands

```bash
npm run db:reset    # Drop all tables (run db:migrate after)
npm run build       # Production build
npm run start       # Production server
```

## Screen Recording

<!-- TODO: Add screen recording link here (5-8 minutes showing the app working and both edge cases) -->

## Design Decisions

### Multi-tenant isolation via PostgreSQL RLS

Every tenant table (workspaces, memberships, projects, notes) has Row-Level Security with `FORCE ROW LEVEL SECURITY` enabled. The runtime connects as `app_user` (NOSUPERUSER, NOBYPASSRLS) and `verifyRuntimeRole()` asserts this at startup. A missing or misconfigured policy denies access by default.

The `withTenantContext()` pattern sets a PostgreSQL GUC (`app.current_user_id`) from the authenticated session at the start of each transaction. All RLS policies reference this GUC through a `SECURITY DEFINER` helper function. On error, the connection is destroyed (not returned to the pool) to prevent GUC leakage.

### Per-command RLS policies (no FOR ALL)

Each table has separate SELECT, INSERT, UPDATE, and DELETE policies. This prevents accidental writes through a read-only policy. Write policies use `my_writable_workspace_ids()` (editor + owner) while read policies use `my_workspace_ids()` (all members). The membership INSERT policy additionally requires owner role and prevents self-invitation.

### Defense in depth

Access is enforced at three layers:
1. **Application layer**: `requireSession()` → Zod input validation → `withTenantContext()` → membership check → role check
2. **Database layer**: RLS policies filter all queries
3. **Structural layer**: Immutability triggers prevent reassigning `workspace_id` on projects, `project_id` on notes, and `workspace_id`/`user_id` on memberships

Every server action gets its user ID from the session (never from client input). Non-members receive 404 (not 403) to avoid revealing whether a resource exists.

### Authentication

Session-based auth with bcrypt password hashing. Login uses a `DUMMY_HASH` constant-time comparison to prevent email enumeration via timing side-channels. The same error message is returned for invalid passwords and nonexistent emails. Session tokens are UUIDs validated at the application layer before DB queries. Expired sessions are cleaned up on each login.

### LLM Summarization

The `SummaryProvider` interface accepts an array of notes and returns a typed `SummaryResponse`. The `MockSummaryProvider` generates deterministic summaries without API keys. To swap in a real provider (OpenAI, Anthropic), implement the interface and inject it.

Note text is treated as untrusted input:
- **Prompt injection detection**: 11 regex patterns flag suspicious content (e.g., "ignore previous instructions", "reveal system prompt")
- **Sanitization**: strips HTML chars, backticks, and truncates to 5000 chars
- **Schema validation**: Zod validates LLM output before storage (summary max 2000 chars, max 10 topics, integer noteCount)

Flagged notes are still included (sanitized) but reported to the caller.

### Next.js 16 App Router

All dynamic pages use `export const instant = false` for compatibility with `cookies()` under Partial Prerender. Each route has a `loading.tsx` skeleton for instant navigation, a root `error.tsx` boundary with `retry`, and `not-found.tsx` boundaries at root and workspace levels.

## Trade-offs

1. **RLS over application-only enforcement**: More complex SQL setup, but provides a security guarantee that survives application bugs. Even a completely broken server action cannot leak cross-tenant data.

2. **No workspace creation UI**: The workspace INSERT policy is intentionally absent (default deny). Workspaces are created via seed data or a privileged migration. This simplifies the RLS model at the cost of runtime workspace creation.

3. **Session-based auth over JWT**: Sessions require a DB lookup on every request, but allow immediate revocation and avoid the complexity of token refresh flows. The middleware only checks cookie presence (no DB call in edge runtime); actual validation happens in `requireSession()`.

4. **Mock LLM provider echoes note content**: The mock builds summaries from actual note text rather than generating realistic prose. This means end-to-end tests validate the real sanitization pipeline, but the summaries look mechanical.

5. **Editors can delete projects and notes**: The requirement states editors can "create and edit." Delete could be argued either way — we allow it since the RLS policies treat delete as a write operation. A stricter reading would restrict delete to owners only.

6. **Prompt injection detection is flag-only**: Suspicious notes are flagged and sanitized but not excluded from summarization. This avoids false-positive censorship while still alerting the user.

## What I Would Do Next

1. **Rate limiting on login**: Add sliding-window rate limiting to prevent brute-force attacks (e.g., `pg-ratelimiter` or Redis-based).
2. **Workspace creation flow**: Add a SECURITY DEFINER function and UI for creating workspaces at runtime, with the creator automatically becoming owner.
3. **Pagination**: Notes and projects lists currently load all records. Add cursor-based pagination for large datasets.
4. **Real LLM provider**: Implement an OpenAI/Anthropic provider behind a feature flag, with token budget limits and streaming.
5. **Audit logging**: Record who did what and when, especially for membership changes and deletions.
6. **CSRF protection**: Add CSRF tokens to forms (Next.js server actions provide some protection via the `Origin` header check, but explicit tokens are stronger).
7. **Session rotation**: Rotate the session token on privilege changes (e.g., role updates) to prevent session fixation.
8. **E2E tests**: Add Playwright tests that exercise the full HTTP flow including middleware redirects and server action responses.
