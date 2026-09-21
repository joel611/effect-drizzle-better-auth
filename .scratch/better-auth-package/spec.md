Status: ready-for-agent

# Better Auth package following the Effect v4 service pattern

## Problem Statement

This repo exists to probe the limits of Effect's dependency-injection model across three libraries: Effect, Drizzle ORM and Better Auth. Today only Effect and Drizzle are wired together (`Db`, `TaskRepository`). Better Auth is the third library, and it is the hard one: it is promise-based, it owns its own set of tables, and it calls back into application code from outside the Effect runtime. Without it in the repo, the central question ("where does Effect DI stop holding up?") stays unanswered, and there is no recorded evidence either way.

## Solution

Add a new auth package that wraps Better Auth as Effect services built the same way as `Db` and `TaskRepository` (`Context.Service` with `make`, `layer` and `layerNoDeps`). The wrapping is split into three swappable tiers: `Db` → `AuthAdapter` → `Auth`. Better Auth reads and writes the **Auth tables** through a custom adapter over the repo's effect-flavoured Drizzle instance, not through a second plain Drizzle instance. Every place where the Effect context fails to survive the **Promise boundary** is recorded as a **Limit finding** in a findings log. The server mounts the Better Auth HTTP handler so the stack can be exercised end to end.

## User Stories

1. As a repo learner, I want `Auth` to be an Effect service with `make`, `layer` and `layerNoDeps`, so that it follows the same pattern as `Db` and `TaskRepository`.
2. As a repo learner, I want `AuthAdapter` to be its own service between `Db` and `Auth`, so that I can see Layer composition across three tiers.
3. As a repo learner, I want to swap `AuthAdapter` alone for Better Auth's in-memory adapter, so that I can test `Auth` without Postgres and see DI substitution work.
4. As a repo learner, I want to swap `Db` alone, so that I can see how far substitution reaches down the stack.
5. As a repo learner, I want each place where Effect context fails to cross the **Promise boundary** documented, so that I learn where the DI pattern's limits are.
6. As a repo learner, I want a findings log with a short entry per **Limit finding** (what broke, why, workaround), so that the repo's real output is readable in one place.
7. As a repo learner, I want ADRs only for real trade-offs (for example the custom adapter over a second plain Drizzle instance), so that the decision history stays short and meaningful.
8. As an application developer, I want `Auth.signUpEmail` to create a user with email and password and return an Effect, so that sign-up composes with other Effects.
9. As an application developer, I want `Auth.signInEmail` to return a session on valid credentials, so that I can authenticate users inside Effect programs.
10. As an application developer, I want `Auth.signInEmail` to fail with a typed error on wrong credentials, so that I can handle it with `Effect.catchTag`.
11. As an application developer, I want `Auth.getSession(headers)` to return the session or none, so that future routes can guard on it.
12. As an application developer, I want every Effect-wrapped method to fail with a tagged `AuthError`, so that failures are values in the Effect error channel, not thrown exceptions.
13. As an application developer, I want the raw Better Auth instance exposed on `Auth`, so that I can mount its HTTP handler and use features I have not wrapped.
14. As an application developer, I want `Auth` configured from `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` via Effect `Config`, so that configuration follows the v4 idiom.
15. As an application developer, I want the secret held as `Redacted`, so that it cannot leak into logs.
16. As an application developer, I want a missing secret to fail layer construction with a clear config error, so that a misconfigured server does not start.
17. As an application developer, I want the server to mount the Better Auth handler under `/api/auth/*`, so that a client can sign up and sign in over HTTP.
18. As an application developer, I want the server to build `Auth` from a Layer, so that no auth singleton exists.
19. As an application developer, I want Better Auth's four tables (`user`, `session`, `account`, `verification`) in the shared database schema, so that there is one migration history.
20. As an application developer, I want `bun run db:generate` and `db:migrate` to cover the auth tables, so that setup stays the documented one-liner.
21. As an application developer, I want the adapter to support the full `where` operator set (`eq`, `ne`, `lt`, `lte`, `gt`, `gte`, `in`, `not_in`, `contains`, `starts_with`, `ends_with`) and AND/OR connectors, so that Better Auth never hits an unsupported query at runtime.
22. As an application developer, I want the adapter to resolve tables by model name from the schema exported by the database package, so that adding a table does not require adapter edits.
23. As an application developer, I want the adapter to fail loudly on an unknown model or operator, so that a mismatch surfaces in tests and not in production.
24. As an application developer, I want Better Auth transactions to be real database transactions, so that sign-up either writes all its rows or none.
25. As an application developer, I want each transaction to get its own adapter carrying that transaction's services, so that queries inside it join the transaction.
26. As an application developer, I want a failure partway through sign-up to leave no `user` row behind, so that atomicity is proven and not assumed.
27. As an application developer, I want bridged queries to run with the services captured when the layer was built, so that tracing, logging and config still apply inside Better Auth's callbacks.
28. As an application developer, I want a test-only service provided to the stack to be visible inside adapter queries, so that context propagation across the **Promise boundary** is verified.
29. As a test author, I want to sign up and sign in against an in-memory stack with no Postgres running, so that unit tests are fast and hermetic.
30. As a test author, I want to run the same sign-up and sign-in flow against real Postgres, so that the custom adapter is proven against the real driver.
31. As a test author, I want all probes to go through the `Auth` service's Effect API, so that there is a single test seam.
32. As a maintainer, I want the glossary to define **Auth**, **AuthAdapter**, **Auth tables**, **Promise boundary** and **Limit finding**, so that issues and code use the same words.
33. As a maintainer, I want the test runner for the new package documented next to the existing exception in `CLAUDE.md`, so that `bun test` versus `vitest` stays unambiguous.
34. As a maintainer, I want the README layout section to list the new package, so that a newcomer can find it.
35. As a maintainer, I want the new package to typecheck and test through the existing turborepo scripts, so that CI and hooks pick it up without changes.

## Implementation Decisions

- **New package** for auth, private and workspace-linked like `core` and `db`. It depends on the database package and `effect`, and it uses `vitest` (same explicit exception as `core` and `db`).
- **Three service tiers**, each a `Context.Service` with `make`, `layer` (dependencies provided) and `layerNoDeps` (dependencies left open):
  - `Db` (existing, unchanged).
  - `AuthAdapter`: built from `Db`; produces the adapter object handed to Better Auth.
  - `Auth`: built from `AuthAdapter` plus config; owns the Better Auth instance.
- **Adapter strategy:** a custom adapter built with Better Auth's adapter factory over `Db`. Rejected alternatives: (a) a second plain node-postgres Drizzle instance next to `Db`, and (b) a proxy that makes Drizzle builders thenable. The chosen one is more code but keeps `Db` as the single database dependency. This is a real trade-off and gets an ADR. Note: in Drizzle's effect driver every query builder is an Effect, not a promise, which is why Better Auth's stock Drizzle adapter cannot be used directly.
- **Adapter behaviour:** implements create, find one, find many, update, update many, delete, delete many and count. `where` supports the full operator set and AND/OR connectors. Tables are looked up by model name from the schema exported by the database package. Unknown model or operator is a hard error.
- **Promise boundary rule:** every bridged query runs with services captured at layer build time (`Effect.services()` then `Effect.runPromiseWith`), never a bare `runPromise`.
- **Transactions are enabled.** Better Auth's transaction hook maps to `Db`'s Effect-callback transaction. Inside the transaction, the adapter captures the transaction's services and builds a fresh adapter bound to them, so promise-land queries join the transaction. This is the sharpest probe of the DI limit and its outcome (works, works with caveats, or does not work) goes into the findings log.
- **Auth API:** exposes the raw Better Auth instance (for the HTTP handler and unwrapped features) plus Effect-wrapped `signUpEmail`, `signInEmail` and `getSession`, which convert promise rejections into a tagged `AuthError` via `Effect.tryPromise`.
- **Scope of auth features:** email and password with database sessions. No social login, no plugins (so no jwks table).
- **Config:** `BETTER_AUTH_SECRET` (as `Redacted`) and `BETTER_AUTH_URL` read through Effect `Config`. `Db`'s existing `process.env` read is not refactored here. `.env.example` gains the two new variables.
- **Schema:** the four Better Auth tables are added to the shared database package schema (generated with Better Auth's CLI, then owned by hand), exported from its index, and covered by a new drizzle-kit migration.
- **Server:** the Bun server builds `Auth` from a Layer and mounts the Better Auth handler on `/api/auth/*`. No protected routes in this change.
- **Documentation:**
  - Glossary (`CONTEXT.md`) updated with the five new terms (already done in the working branch).
  - New findings log for **Limit findings**.
  - ADR for the adapter strategy.
  - `CLAUDE.md` testing note and README layout list mention the new package.
- **Version pins:** Better Auth's Effect-related and Drizzle peer ranges must be checked against the repo's pinned Effect and Drizzle release candidates (ADR 0002). If the pins conflict, record it as a **Limit finding** and an ADR update, do not silently change pins.

## Testing Decisions

- A good test drives external behaviour only: sign up, sign in, read a session, observe rows. No assertions on adapter internals or on how queries are built.
- **One seam:** the `Auth` service's Effect API (`signUpEmail`, `signInEmail`, `getSession`), driven under different Layer stacks. The HTTP mount and the adapter's `where` translation are covered only through this seam.
- Four probes, each a claim about Effect DI that could turn out false:
  1. Swap `AuthAdapter` for Better Auth's in-memory adapter: sign up and sign in with no Postgres.
  2. Real stack (`Db` → `AuthAdapter` → `Auth`) round-trips through Postgres.
  3. Transaction rollback: force a failure partway through sign-up and assert no `user` row remains.
  4. Context propagation: provide a test-only service (for example a query-counting logger) to the stack and assert adapter queries observe it.
- Prior art: the existing `TaskRepository` test (drives a service through its `layer`, Postgres-backed) and the `Db` client test. Tests run with `vitest`, matching the other packages.
- Tests that need Postgres assume the compose stack from the README is up, as the existing ones do.
- Every probe whose result surprises us (fails, or passes only with a workaround) produces an entry in the findings log.

## Out of Scope

- Social login, magic links, two-factor, organizations, jwt or any other Better Auth plugin.
- Protected HTTP routes, authorization rules, and any web UI.
- Refactoring `Db` or `TaskRepository` to `Config`.
- Refactoring Better Auth's config beyond secret and base URL.
- Email sending (verification and password-reset mail).
- Production concerns: rate limiting, session cleanup jobs, secret rotation.
- Fixing upstream library limitations; we record them, we do not patch the libraries.

## Further Notes

- The findings log is the actual product of this repo: a probe that fails and is recorded well is a success.
- If the custom adapter proves unworkable, the documented fallback is a second plain node-postgres Drizzle instance inside the auth layer. Switching to it requires a new ADR superseding the adapter ADR.
- Better Auth's adapter factory API and its drizzle adapter's expectations should be verified against current docs at implementation time, since training data may be stale.
