import { expect, layer } from "@effect/vitest";
import { eq } from "drizzle-orm";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { Db, session } from "../../db";
import { Redis } from "../../redis";
import { Auth } from "../effect/layer";

// The `auth` singleton's secondary storage is built on the `redis` singleton, so a session
// created through Auth must be readable through Redis, and must not reach Postgres.
layer(Layer.mergeAll(Auth.layer, Db.layer, Redis.layer))("Auth stores sessions in Redis", (it) => {
  it.effect("reads a session signed in through Auth back through Redis", () =>
    Effect.gen(function* program() {
      const email = `redis-storage-${crypto.randomUUID()}@example.com`;
      const password = "correct-horse-battery";
      const auth = yield* Auth;
      const db = yield* Db;
      const redis = yield* Redis;

      const signedUp = yield* Effect.tryPromise(() =>
        auth.api.signUpEmail({ body: { email, name: "Redis Storage User", password } }),
      );
      const signedIn = yield* Effect.tryPromise(() =>
        auth.api.signInEmail({ body: { email, password } }),
      );
      const stored = yield* Effect.tryPromise(() => redis.get(`better-auth:${signedIn.token}`));
      const rows = yield* Effect.tryPromise(() =>
        db.select().from(session).where(eq(session.userId, signedUp.user.id)),
      );

      expect(stored).toContain(signedUp.user.id);
      expect(rows).toHaveLength(0);
    }),
  );
});
