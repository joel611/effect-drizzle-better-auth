import { beforeEach, describe, expect, it, layer, vi } from "@effect/vitest";
import { Effect, Fiber, Layer, Option } from "effect";
import { TestClock } from "effect/testing";

import { cacheRedisLayer } from "../../effects/cache/redis";
import { Cache, CacheNotDeleted, CacheNotRead } from "../../effects/cache/service";
import type { CacheNotWritten } from "../../effects/cache/service";
import { Db, user } from "../../libs/db";
import { dbMockLayer } from "../../libs/db/effect/layer";
import { TaskNotListed } from "../errors";
import { TaskRepository } from "../task-repository";
import { TASK_LIST_KEY, TASK_LIST_TTL_SECONDS, TaskService } from "../task-service";
import { TaskId } from "../validation-schema";

// Same spied `$client.query` as task-repository.test.ts: rows are positional
// (id, done, title, owner_id, created_at) raw wire values.
const query = vi.fn();
const repoLayer = TaskRepository.layerNoDeps.pipe(
  Layer.provide(
    Layer.effect(
      Db,
      Effect.gen(function* spied() {
        const db = yield* Db;
        Object.assign(db.$client, { query });
        return db;
      }),
    ).pipe(Layer.provide(dbMockLayer)),
  ),
);

// In-memory Cache. Each test can override one call with `mockImplementationOnce`.
const store = new Map<string, string>();
const cacheGet = vi.fn((key: string): Effect.Effect<Option.Option<string>, CacheNotRead> =>
  Effect.sync(() => Option.fromUndefinedOr(store.get(key))),
);
const cacheSet = vi.fn(
  (key: string, value: string, _ttlSeconds?: number): Effect.Effect<void, CacheNotWritten> =>
    Effect.sync(() => {
      store.set(key, value);
    }),
);
const cacheDelete = vi.fn((key: string): Effect.Effect<void, CacheNotDeleted> =>
  Effect.sync(() => {
    store.delete(key);
  }),
);
const failDelete = () => Effect.fail(new CacheNotDeleted({ cause: new Error("redis down") }));
const fakeCacheLayer = Layer.succeed(Cache, {
  delete: (key) => cacheDelete(key),
  get: (key) => cacheGet(key),
  set: (key, value, ttlSeconds) => cacheSet(key, value, ttlSeconds),
});

const withoutCache = TaskService.layerNoDeps.pipe(Layer.provide(repoLayer));
// Cache must be provided *to* the service layer; a sibling in mergeAll is invisible to
// Effect.serviceOption.
const withCache = TaskService.layerNoDeps.pipe(
  Layer.provide(Layer.merge(repoLayer, fakeCacheLayer)),
);

const driverRow = [7, true, "from the driver", "u1", "2026-01-02 03:04:05.678"];
const expectedTask = {
  createdAt: new Date("2026-01-02T03:04:05.678Z"),
  done: true,
  id: 7,
  ownerId: "u1",
  title: "from the driver",
};

describe("TaskService over a spied dbMockLayer", () => {
  beforeEach(() => {
    query.mockReset();
    query.mockResolvedValue({ rows: [driverRow] });
    cacheGet.mockClear();
    cacheSet.mockClear();
    cacheDelete.mockClear();
    store.clear();
  });

  it.effect("without a Cache, every list queries the driver", () =>
    Effect.gen(function* program() {
      const service = yield* TaskService;

      yield* service.list();
      const all = yield* service.list();

      expect(all).toEqual([expectedTask]);
      expect(query).toHaveBeenCalledTimes(2);
    }).pipe(Effect.provide(withoutCache)),
  );

  it.effect("on a miss, lists from the driver and caches the rows with the TTL", () =>
    Effect.gen(function* program() {
      const service = yield* TaskService;

      const all = yield* service.list();

      expect(all).toEqual([expectedTask]);
      expect(query).toHaveBeenCalledTimes(1);
      expect(cacheSet).toHaveBeenCalledWith(
        TASK_LIST_KEY,
        expect.any(String),
        TASK_LIST_TTL_SECONDS,
      );
    }).pipe(Effect.provide(withCache)),
  );

  it.effect("on a hit, returns the cached rows without querying the driver", () =>
    Effect.gen(function* program() {
      const service = yield* TaskService;
      yield* service.list();
      query.mockClear();

      const cached = yield* service.list();

      expect(cached).toEqual([expectedTask]);
      expect(cached[0]?.createdAt).toBeInstanceOf(Date);
      expect(query).not.toHaveBeenCalled();
    }).pipe(Effect.provide(withCache)),
  );

  it.effect("falls back to the driver when the cache read fails", () =>
    Effect.gen(function* program() {
      cacheGet.mockImplementationOnce(() =>
        Effect.fail(new CacheNotRead({ cause: new Error("redis down") })),
      );
      const service = yield* TaskService;

      const all = yield* service.list();

      expect(all).toEqual([expectedTask]);
      expect(query).toHaveBeenCalledTimes(1);
    }).pipe(Effect.provide(withCache)),
  );

  it.effect("falls back to the driver when the cache read hangs past the timeout", () =>
    Effect.gen(function* program() {
      cacheGet.mockImplementationOnce(() => Effect.never);
      const service = yield* TaskService;

      // it.effect runs on TestClock, so the timeout only fires when the clock moves.
      const fiber = yield* Effect.forkChild(service.list());
      yield* TestClock.adjust("100 millis");
      const all = yield* Fiber.join(fiber);

      expect(all).toEqual([expectedTask]);
      expect(query).toHaveBeenCalledTimes(1);
    }).pipe(Effect.provide(withCache)),
  );

  it.effect("treats a corrupt cached payload as a miss", () =>
    Effect.gen(function* program() {
      store.set(TASK_LIST_KEY, "not json");
      const service = yield* TaskService;

      const all = yield* service.list();

      expect(all).toEqual([expectedTask]);
      expect(query).toHaveBeenCalledTimes(1);
    }).pipe(Effect.provide(withCache)),
  );

  it.effect("create invalidates the cached list", () =>
    Effect.gen(function* program() {
      const service = yield* TaskService;
      yield* service.list();

      yield* service.create({ ownerId: "u1", title: "from the driver" });

      expect(cacheDelete).toHaveBeenCalledWith(TASK_LIST_KEY);
      expect(store.has(TASK_LIST_KEY)).toBe(false);
    }).pipe(Effect.provide(withCache)),
  );

  it.effect("update invalidates the cached list", () =>
    Effect.gen(function* program() {
      const service = yield* TaskService;
      yield* service.list();

      yield* service.update(TaskId.make(7), "u1", { done: true });

      expect(cacheDelete).toHaveBeenCalledWith(TASK_LIST_KEY);
      expect(store.has(TASK_LIST_KEY)).toBe(false);
    }).pipe(Effect.provide(withCache)),
  );

  it.effect("create and update still return their rows when invalidation fails", () =>
    Effect.gen(function* program() {
      cacheDelete.mockImplementationOnce(failDelete).mockImplementationOnce(failDelete);
      const service = yield* TaskService;

      const created = yield* service.create({ ownerId: "u1", title: "from the driver" });
      const updated = yield* service.update(TaskId.make(7), "u1", { done: true });

      expect(created).toEqual(expectedTask);
      expect(updated).toEqual(expectedTask);
    }).pipe(Effect.provide(withCache)),
  );

  it.effect("fails list with TaskNotListed when the cache misses and the driver rejects", () =>
    Effect.gen(function* program() {
      query.mockReset();
      query.mockRejectedValueOnce(new Error("connection lost"));
      const service = yield* TaskService;

      const error = yield* service.list().pipe(Effect.flip);

      expect(error).toBeInstanceOf(TaskNotListed);
    }).pipe(Effect.provide(withCache)),
  );
});

// Real Postgres and Redis, through `layerCached` exactly as the API runtime wires it. This
// fails if Cache never reaches `make` (the `Layer.mergeAll` trap).
layer(Layer.mergeAll(TaskService.layerCached, Db.layer, cacheRedisLayer))(
  "TaskService.layerCached",
  (live) => {
    live.effect("caches the list and drops it after a create", () =>
      Effect.gen(function* program() {
        const service = yield* TaskService;
        const cache = yield* Cache;
        const db = yield* Db;
        const ownerId = crypto.randomUUID();
        yield* Effect.tryPromise(() =>
          db
            .insert(user)
            .values({ email: `${ownerId}@example.com`, id: ownerId, name: "Task Owner" }),
        );
        yield* cache.delete(TASK_LIST_KEY);

        yield* service.list();
        const afterList = yield* cache.get(TASK_LIST_KEY);
        const created = yield* service.create({ ownerId, title: "cached service test" });
        const afterCreate = yield* cache.get(TASK_LIST_KEY);
        const all = yield* service.list();

        expect(Option.isSome(afterList)).toBe(true);
        expect(Option.isNone(afterCreate)).toBe(true);
        expect(all).toContainEqual(created);
      }),
    );
  },
);
