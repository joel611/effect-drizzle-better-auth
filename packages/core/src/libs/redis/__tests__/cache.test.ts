import { beforeEach, expect, layer, vi } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as TestClock from "effect/testing/TestClock";

import { Cache, CacheError } from "../../cache";
import { Redis } from "../effect/layer";
import type { RedisClient } from "../client";

// A fake ioredis client provided by the `Redis` tag, so each test decides what Redis returns.
const redisGet = vi.fn();
const redisSet = vi.fn();
const redisDel = vi.fn();
const fakeRedis = { del: redisDel, get: redisGet, set: redisSet } as unknown as RedisClient;

layer(Redis.cacheLayerNoDeps.pipe(Layer.provide(Layer.succeed(Redis, fakeRedis))))(
  "Cache over a fake Redis client",
  (it) => {
    beforeEach(() => {
      redisGet.mockReset();
      redisSet.mockReset().mockResolvedValue("OK");
      redisDel.mockReset().mockResolvedValue(1);
    });

    it.effect("gets None on a miss and Some on a hit", () =>
      Effect.gen(function* program() {
        redisGet.mockResolvedValueOnce(null).mockResolvedValueOnce("value");
        const cache = yield* Cache;

        const miss = yield* cache.get("k");
        const hit = yield* cache.get("k");

        expect(miss).toEqual(Option.none());
        expect(hit).toEqual(Option.some("value"));
      }),
    );

    it.effect("sets with an EX TTL and deletes by key", () =>
      Effect.gen(function* program() {
        const cache = yield* Cache;

        yield* cache.set("k", "v", 60);
        yield* cache.del("k");

        expect(redisSet).toHaveBeenCalledWith("k", "v", "EX", 60);
        expect(redisDel).toHaveBeenCalledWith("k");
      }),
    );

    it.effect("fails with CacheError when Redis rejects", () =>
      Effect.gen(function* program() {
        redisGet.mockRejectedValueOnce(new Error("redis down"));
        const cache = yield* Cache;

        const error = yield* cache.get("k").pipe(Effect.flip);

        expect(error).toBeInstanceOf(CacheError);
      }),
    );

    it.effect("fails with CacheError when Redis hangs past the timeout", () =>
      Effect.gen(function* program() {
        redisGet.mockImplementationOnce(() => Effect.runPromise(Effect.never));
        const cache = yield* Cache;

        const fiber = yield* cache.get("k").pipe(Effect.flip, Effect.forkChild);
        yield* TestClock.adjust("100 millis");
        const error = yield* Fiber.join(fiber);

        expect(error).toBeInstanceOf(CacheError);
      }),
    );
  },
);

layer(Redis.cacheLayer)("Cache over Redis", (it) => {
  it.effect("round-trips a value and deletes it", () =>
    Effect.gen(function* program() {
      const key = `vitest:${crypto.randomUUID()}`;
      const cache = yield* Cache;

      yield* cache.set(key, "vitest value", 60);
      const stored = yield* cache.get(key);
      yield* cache.del(key);
      const deleted = yield* cache.get(key);

      expect(stored).toEqual(Option.some("vitest value"));
      expect(deleted).toEqual(Option.none());
    }),
  );
});
