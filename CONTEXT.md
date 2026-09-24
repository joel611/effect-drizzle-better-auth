# Effect-Drizzle-Better-Auth

Learning ground for Effect-ts's dependency-injection model, built around a small, real service on top of Drizzle ORM (Postgres) and, later, Better Auth.

## Language

**Task**: The demo entity (`id`, `title`, `done`, `createdAt`) used to prove the Effect Layer wiring round-trips through Drizzle to Postgres. Deliberately outside the auth domain — not to be confused with the auth tables below. _Avoid_: To-do, ticket — no functional distinction is implied, the name only needs to stay out of the auth namespace.

**Auth tables**: Better Auth's `user`, `session`, `account` and `verification` tables. Owned by this repo and defined next to **Task** in the database schema.

**Auth**: The Effect service that wraps a Better Auth instance and exposes its operations as Effects, each failing with its own tagged error (`SignUpError`, `SignInError`, `GetSessionError`).

**AuthAdapter**: The Effect service that gives Better Auth's official `drizzleAdapter` the same `Db` instance the rest of the repo uses, so Better Auth reads and writes through the one shared Postgres pool. Sits between **Db** and **Auth**, so it can be swapped alone (for example for an in-memory adapter in tests).
