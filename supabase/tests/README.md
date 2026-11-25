# supabase/tests — RLS verification harness

`rls-verify.sql` is a readable, dependency-free SQL harness that verifies Row
Level Security for every client-accessible table in schema `public`.
Spec 004 / T055 (code part).

It is a **harness, not a migration** — it changes no schema, and everything it
runs inside transactions is rolled back.

## What it verifies

| Section | What | Behavior |
|---|---|---|
| 0 | Context + preflight | Fails if the connected role cannot `SET ROLE authenticated`. |
| 1 | Generic sweep over `pg_catalog`: **every** base/partitioned table in `public` must have RLS; the table count itself is asserted (zero tables fails) | `RAISE EXCEPTION` naming any offender; no hand-maintained list, so any migration that forgets RLS fails (incl. `quiz_attempts` / `trw_access_codes`) |
| 1-negative | Self-test: a deliberately un-RLS'd table is created inside a `BEGIN ... ROLLBACK` block | Fails loudly if the sweep does **not** flag it |
| 1c | `review_details` / `lectures_with_ratings` views are `security_invoker` | Owner-rights views would bypass base-table RLS |
| 2 | Policy inventory (`tablename, policyname, cmd, roles`), ordered | Documentation output |
| 3 | Positive/negative behavior tests as `authenticated` / `service_role` | See below; every block runs in `BEGIN ... ROLLBACK` |

Section 3 coverage: profiles, summaries, quizzes, enrollments, reviews,
notifications, admins, password_reset_tokens (authenticated blackout +
service_role read), audit_logs/system_logs/rate_limits (invisible to
authenticated), `quiz_attempts` (baseline table: RLS + owner-scoped read) and
`trw_access_codes` (baseline table: deny-by-default for authenticated).

## Requirements

1. The full migration chain applied (`supabase/migrations/` — baseline
   `20261031000000_baseline.sql` onward; on vanilla PostgreSQL apply the roles +
   `extensions` schema + `prelude.sql` first, see "Running it" below).
2. A connection role that can assume test roles — the Supabase `postgres`
   role (granted `anon`/`authenticated`/`service_role` membership on managed
   projects) or any superuser.
3. **For Section 3 only:** the seed fixtures below (two auth users + one
   course). Sections 1 and 2 run anywhere without them.

### Seed (run ONCE on the target database, SQL editor or psql)

On a REAL Supabase project the `auth.users` insert also creates empty
`profiles` rows via the `on_auth_user_created` trigger. The migration chain
(baseline, spec 031) does NOT recreate that trigger on rebuilt clusters, so
the seed creates the two profiles itself — `ON CONFLICT DO NOTHING` keeps it
safe on real Supabase where the trigger already made them. Profiles are
inserted BEFORE the course because `courses.instructor_id` references
`profiles(id)`:

```sql
insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000',
   '00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated',
   'rls-user-a@example.com', crypt('rls-harness-only', gen_random_uuid()::text),
   now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000',
   '00000000-0000-0000-0000-0000000000a2', 'authenticated', 'authenticated',
   'rls-user-b@example.com', crypt('rls-harness-only', gen_random_uuid()::text),
   now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.profiles (id, full_name) values
  ('00000000-0000-0000-0000-0000000000a1', 'RLS harness user A'),
  ('00000000-0000-0000-0000-0000000000a2', 'RLS harness user B')
on conflict (id) do nothing;

insert into public.courses (id, title, instructor_id)
values ('00000000-0000-0000-0000-0000000000c1', 'RLS harness course',
        '00000000-0000-0000-0000-0000000000a1');
```

For real sign-in flows use the
Supabase Auth admin API instead of direct inserts; the harness only needs the
rows to exist so RLS verdicts are exact (RLS is checked before foreign keys on
INSERT, so an unsatisfied foreign key would make a negative test
inconclusive — that is why the seed matters).

## How to run

### psql (authoritative, CI-friendly)

```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls-verify.sql
```

`ON_ERROR_STOP=1` is **required**: any failed assertion aborts the run and
psql exits non-zero, which is exactly what CI should key on.

### Supabase Dashboard

Project -> SQL Editor -> paste the whole file -> Run. Each statement runs in
order; the first `RAISE EXCEPTION` stops the run and shows the failing
message. (Use psql for exit codes.)

### CI

CI (the `db-verify` job in `.github/workflows/ci.yml`) runs this against a
**disposable PostgreSQL 17** container rebuilt from the migration chain —
never production. It creates the Supabase roles, applies the prelude, replays
all migrations, seeds the fixtures above, then runs the harness with psql and
lets the non-zero exit code fail the job. TODO(LIVE-JWT) markers in the file
denote the spots where a real signed JWT / admin fixture is required; the
seed supplies those fixtures.

## What PASS looks like

`NOTICE` lines per section, then completion:

```text
NOTICE:  PREFLIGHT PASS: postgres can assume authenticated and service_role
NOTICE:  SECTION 1 PASS: all <N> public tables verified with RLS enabled
NOTICE:  SECTION 1-negative PASS: the sweep flags a public table without RLS as expected
NOTICE:  SECTION 1c PASS: user-data views use security_invoker
NOTICE:  3.1 profiles PASS: cross-user insert rejected as expected
NOTICE:  3.8a password_reset_tokens PASS: invisible to authenticated
...
NOTICE:  3.4f trw_access_codes PASS: not enumerable by authenticated
NOTICE:  3.10 quiz_attempts PASS: RLS enabled and rows owner-scoped
NOTICE:  RLS VERIFY COMPLETE: Sections 1-2 asserted, Section 3 behavioral blocks passed (or explicitly SKIPped).
```

Exit code 0.

## What FAIL looks like

A hard stop with the offending table named, for example:

```text
ERROR:  RLS VERIFY FAILED: tables without row level security: news appeals
```

`RLS VERIFY INCONCLUSIVE: ...` messages mean the verdict could not be made
because seed fixtures are missing — apply the seed and re-run (Sections 1-2
assertions are never inconclusive).

## Conventions used by the harness

* Every Section 3 block: `BEGIN; SET LOCAL ROLE <role>; set_config('request.jwt.claims', ...)` —
  Supabase `auth.uid()` / `auth.role()` read exactly that setting — followed
  by assertions, then `ROLLBACK;`.
* Positive test = the query executes without a permission error.
* Negative test = a write that must be rejected; if it succeeds, RLS is
  broken and the harness raises with the table named.
* `profiles` are public-read **by design** (baseline policy "Public profiles
  are viewable by everyone"); only profile writes are user-scoped. Same for
  summaries/quizzes/videos/files reads (public read, admin-managed writes).
---

# rpc-verify.sql — RPC behavior harness (spec 040)

Companion to `rls-verify.sql`: that file covers WHO may touch WHAT (policies);
`rpc-verify.sql` covers WHAT the server-authoritative functions DO.

| Section | Function(s) | What it pins |
|---|---|---|
| 1 | `norm_subject_name(v text)` | spec 038 normalizer vectors (the JS twin in sync-reconcile must stay in lockstep) |
| 2 | `check_rate_limit(...)` | fixed-window math, exact `max_requests` boundary, no-increment-when-blocked, stale-window purge, per-endpoint independence |
| 3 | `finish_quiz_attempt` + `guard_quiz_attempt_grading` trigger | auth/ownership/unknown-id refusals (42501), client-side tampering blocked, authoritative re-grade overwrites dirty client score, answers payload ordered, time fallback, idempotent `already_finished` retry |
| 4 | `trw_redeem_access_code` | auth guard (structured error, not exception), unknown/expired/inactive rejection, duplicate rejection, membership upsert (revoke reset), redemption ledger, used_count + atomic auto-deactivation at exhaustion, audit row, NULL-duration permanent membership |

Every mutating scenario runs inside `BEGIN ... ROLLBACK` — nothing survives a
run. 53 assertions total; a violation raises `RPC-VERIFY FAILED: ...` and
aborts under `-v ON_ERROR_STOP=1`.

## Running it

The harness needs a PostgreSQL 17 built from this repo's migration chain
(`supabase/migrations/README.md`). On vanilla PG the chain requires the
`auth`-schema prelude first, plus the `extensions` schema — the
audit-retention migration installs `pg_cron` into it, so a vanilla server
needs the `postgresql-17-cron` package loaded via
`shared_preload_libraries=pg_cron`, and pg_cron must be pre-installed
(`create extension pg_cron;` — the vanilla package pins pg_catalog, while
the audit-retention migration says `WITH SCHEMA extensions`; pre-installing
makes that migration's `IF NOT EXISTS` skip the schema clause, exactly what
the CI `db-verify` job does) — and the RLS seed above for the
`rls-verify.sql` Section 3 blocks:

```bash
psql "$DB_URL" -v ON_ERROR_STOP=1 \
  -c "create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; create role authenticator nologin noinherit; create role supabase_storage_admin nologin bypassrls; create role dashboard_user nologin;" \
  -c "create schema if not exists extensions;" \
  -c "create extension pg_cron;" \
    -c "alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role; alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;;"
psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/prelude.sql
for f in supabase/migrations/*.sql; do psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$f"; done
psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls-verify.sql   # seed first (Sections 1-2 run without it)
psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rpc-verify.sql
```

`prelude.sql` (spec 040) recreates the lost spec 031 `tools/prelude.sql`: the
`auth` schema (`users` table + `auth.uid()`/`auth.role()`/`auth.jwt()` driven
by `request.jwt.claims`). It is idempotent and guarded — a no-op on a real
Supabase project. The harness impersonates users via `request.jwt.claims`
(`SET LOCAL`-style per scenario), not via role switching: the RPCs are
SECURITY DEFINER, so claim-setting is the caller context.

Verified end-to-end 2026-11-08 on a disposable portable PostgreSQL 17.6.1
(theseus-rs binaries) rebuilt from the full migration chain.
