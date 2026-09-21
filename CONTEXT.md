# Effect-Drizzle-Better-Auth

Learning ground for probing the limits of Effect-ts's dependency-injection model, using three libraries: Effect, Drizzle ORM (Postgres) and Better Auth.

## Language

**Task**: The demo entity (`id`, `title`, `done`, `createdAt`) used to prove the Effect Layer wiring round-trips through Drizzle to Postgres. Deliberately outside the auth domain — not to be confused with the auth tables below. _Avoid_: To-do, ticket — no functional distinction is implied, the name only needs to stay out of the auth namespace.

**Auth tables**: Better Auth's `user`, `session`, `account` and `verification` tables. Owned by this repo and defined next to **Task** in the database schema.

**Auth**: The Effect service that wraps a Better Auth instance and exposes its operations as Effects with a tagged error.

**AuthAdapter**: The Effect service that lets Better Auth read and write the **Auth tables** through the repo's database service. Sits between the database service and **Auth**, so it can be swapped alone.

**Promise boundary**: The point where Better Auth (promise-based) calls back into Effect code. Effect context does not cross it on its own and must be carried by hand.

**Limit finding**: A recorded case where the Effect DI pattern does not hold up across the three libraries: what broke, why, and the workaround.
