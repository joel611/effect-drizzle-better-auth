import { expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { Redis } from "../effect/layer";

layer(Redis.layer)("Redis layer", (it) => {
  it.effect("round-trips a value through the DI-provided ioredis client", () =>
    Effect.gen(function* program() {
      const key = `vitest:${crypto.randomUUID()}`;
      const redis = yield* Redis;

      yield* Effect.tryPromise(() => redis.set(key, "vitest value", "EX", 60));
      const stored = yield* Effect.tryPromise(() => redis.get(key));
      const deleted = yield* Effect.tryPromise(() => redis.del(key));

      expect(stored).toBe("vitest value");
      expect(deleted).toBe(1);
    }),
  );
});
