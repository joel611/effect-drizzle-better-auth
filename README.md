# Effect-ts tutorial

## Goal
Learn Effect-ts's dependency-injection model by building small, real service around Drizzle ORM (Postgres) and Better Auth.

- Effect-ts Dependency Injection — model app dependencies (DB client, auth client, config) as `Context.Tag`s instead of manual wiring or singletons.
- Service and Layer — define services as Effect `Service`s and compose their dependencies with `Layer` (e.g. a `Database` layer wrapping `@effect/sql-pg` + Drizzle, an `Auth` layer wrapping Better Auth).
- Test mock — swap real Layers (Postgres, Better Auth) for in-memory/test Layers in tests, without touching business logic, to see how Effect's DI makes services testable in isolation.

## Component
- effect@v4 (https://effect.website/docs/v4/)
- @effect/sql-pg
- drizzle

## Reference
- Drizzle Effect Postgres (https://orm.drizzle.team/docs/connect-effect-postgres)
-
