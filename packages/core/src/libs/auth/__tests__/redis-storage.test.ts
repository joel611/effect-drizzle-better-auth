import { expect, layer } from "@effect/vitest";
import { Effect, Layer, Option } from "effect";

import { cacheRedisLayer } from "../../../effects/cache/redis";
import { Cache } from "../../../effects/cache/service";
import { Db } from "../../db";
import { Auth } from "../effect/layer";

// The `auth` singleton's secondary storage is built on the `redis` singleton, so a session
// created through Auth must be readable through the Redis-backed Cache. Postgres has no `session`
// table: the Better Auth CLI omits it when secondary storage is configured.
layer(Layer.mergeAll(Auth.layer, Db.layer, cacheRedisLayer))(
  "Auth stores sessions in Redis",
  (it) => {
    it.effect("reads a session signed in through Auth back through the Redis-backed Cache", () =>
      Effect.gen(function* program() {
        const email = `redis-storage-${crypto.randomUUID()}@example.com`;
        const password = "correct-horse-battery";
        const auth = yield* Auth;
        const cache = yield* Cache;

        const signedUp = yield* Effect.tryPromise(() =>
          auth.api.signUpEmail({ body: { email, name: "Redis Storage User", password } }),
        );
        const signedIn = yield* Effect.tryPromise(() =>
          auth.api.signInEmail({ body: { email, password } }),
        );
        const stored = yield* cache.get(`better-auth:${signedIn.token}`);

        expect(Option.getOrThrow(stored)).toContain(signedUp.user.id);
      }),
    );
  },
);
