# Effect-Drizzle-Better-Auth

Learning ground for Effect-ts's dependency-injection model, built around a small, real service on top of Drizzle ORM (Postgres) and, later, Better Auth.

## Language

**Task**: The demo entity (`id`, `title`, `done`, `createdAt`) used to prove the Effect Layer wiring round-trips through Drizzle to Postgres. Deliberately outside the auth domain — not to be confused with the auth tables below. _Avoid_: To-do, ticket — no functional distinction is implied, the name only needs to stay out of the auth namespace.

**Task list cache**: The optional Redis copy of the full **Task** list, under the `task:list` key with a 60-second TTL. `TaskRepository.list` reads it first, and a **Task** create or update deletes it. It is only on when the entrypoint's runtime merges `Redis.layer`. When Redis is missing, slow or failing, the list comes from Postgres and callers cannot tell the difference. _Avoid_: session cache — Better Auth's `better-auth:` keys on the same Redis are a separate thing.

**Auth tables**: Better Auth's `user`, `session`, `account` and `verification` tables. Owned by this repo and defined next to **Task** in the database schema.

**Auth**: The Effect service that hands out the Better Auth instance. Its operations return promises; callers wrap them in Effects themselves.

**AuthAdapter**: The Effect service that gives Better Auth's official `drizzleAdapter` the same `Db` instance the rest of the repo uses, so Better Auth reads and writes through the one shared Postgres pool. Sits between **Db** and **Auth**, so it can be swapped alone (for example for an in-memory adapter in tests).
