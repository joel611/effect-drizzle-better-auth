# Effect-Drizzle-Better-Auth

Learning ground for Effect-ts's dependency-injection model, built around a small, real service on top of Drizzle ORM (Postgres) and, later, Better Auth.

## Language

**Task**: The demo entity (`id`, `title`, `done`, `createdAt`) used to prove the Effect Layer wiring round-trips through Drizzle to Postgres. Deliberately outside the auth domain — not to be confused with Better Auth's reserved tables (`user`, `session`, `account`, `verification`, `jwks`), which this repo doesn't own yet. _Avoid_: To-do, ticket — no functional distinction is implied, the name only needs to stay out of the auth namespace.
