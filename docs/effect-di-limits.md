# Effect DI limit findings

Where the Effect dependency-injection pattern stops holding up across Effect, Drizzle and Better Auth. One entry per finding: what broke, why, workaround, and the test that pins it down.

## 1. Drizzle's Effect builders are not promises, so Better Auth's stock adapter cannot use `Db`

- **What broke:** Better Auth's `drizzleAdapter` does `await db.select()...`. Against `Db` the `await` returns the un-run `Effect` object.
- **Why:** `drizzle-orm/effect-postgres` returns `Effect`s from every builder; nothing is thenable.
- **Workaround:** custom adapter (see ADR 0003), which runs each query through `Effect.runPromiseWith`.
- **Pinned by:** `auth.postgres.test.ts`.

## 2. Effect context does not cross the promise boundary on its own

- **What broke:** a service provided around a single `Auth` call (here a spy `Tracer`) is never seen by the adapter's queries. Only context that existed when the `AuthAdapter` layer was built reaches them.
- **Why:** Better Auth calls the adapter from plain promise code, outside any fiber of ours. The adapter has only the context it captured with `Effect.context()` at build time, so it sees a snapshot, not the caller's context.
- **Workaround:** provide request-scoped context before the layer is built, or carry it by hand. There is no per-call injection through Better Auth.
- **Pinned by:** `auth.context.test.ts` (both cases).

## 3. A database transaction's connection lives in Effect context, so it has to be hand-carried

- **What broke (nearly):** Better Auth calls `transaction(async trx => ...)`. In Drizzle's Effect driver the transaction takes an Effect callback and its connection is carried in context, so queries run with the outer context would silently run outside the transaction.
- **Why:** same root cause as finding 2, with correctness at stake instead of observability.
- **Workaround:** inside `db.transaction`, capture `Effect.context()`, build a fresh adapter bound to the transaction executor and to those services, and hand it to the promise callback. Rollback on a throw and commit on success are both verified.
- **Pinned by:** `auth.transaction.test.ts`.

## 4. Only the `AuthAdapter` tier is swappable in tests; `Db` has no in-memory stand-in

- **What we found:** `AuthAdapter.layerMemory` (Better Auth's `memoryAdapter`) swaps in cleanly and `Auth` never notices. But `Db` is a concrete Drizzle-over-Postgres service with no in-memory equivalent, so a test that wants the real adapter logic still needs Postgres.
- **Consequence:** the real adapter and where-clause translator can only be tested against Postgres.
- **Pinned by:** `auth.test.ts` (memory) and `auth.postgres.test.ts` (real).

## 5. The adapter's model lookup is a hand-listed map

- **What we found:** the adapter resolves a Better Auth model name to a Drizzle table through a small map of the four auth tables in the adapter file. Importing the whole `db` schema namespace would avoid that, but the repo's lint bans the barrel-style `import * as`, so adding an auth table means editing the map as well as the schema.
- **Consequence:** a model missing from the map fails loudly ("Unknown auth model"), not silently.

## Notes

- Version check: `better-auth` is pinned to `1.7.5`. It declares no peer range on `effect`, and its optional `drizzle-orm` peer (`^0.45.2 || >=1.0.0-rc.1 <2.0.0`) admits the pinned `drizzle-orm@1.0.0-rc.5-5935859` (ADR 0002). The stack runs against the pinned `effect@4.0.0-rc.115`, so no pin conflict was found.
- Deviations from the spec's probe list: probe 3 (rollback) drives `Auth.instance`'s Better Auth adapter transaction directly, because forcing a failure partway through `signUpEmail` would need a test-only database hook in `Auth`. `auth.context.test.ts` shows sign-up does run in a database transaction (a `sql.transaction` span appears). Probe 4 asserts span names, not a query count. `Db` is not swapped on its own (see finding 4).
- Where-clause connectors follow Better Auth's own Drizzle adapter: all AND conditions are grouped, all OR conditions are grouped, and the two groups are ANDed. An unknown operator throws.
- Effect v4 names differ from v3 and from the spec draft: `Effect.context()` (not `Effect.services()`), `Config.String` and `Config.Redacted` (capitalised), `Data.TaggedError`.
- Better Auth's `consumeOne` and `incrementOne` are optional on the adapter and the factory supplies fallbacks, so the adapter does not implement them.
