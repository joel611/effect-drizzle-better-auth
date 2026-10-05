import { beforeEach, describe, expect, it, vi } from "@effect/vitest";
import { Effect, Layer, Option } from "effect";

import { Cache, CacheNotRead } from "../../effects/cache/service";
import { Db } from "../../libs/db";
import { dbMockLayer } from "../../libs/db/effect/layer";
import { TaskRepository } from "../task-repository";
import { TaskService } from "../task-service";

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

const store = new Map<string, string>();
const memoryCacheLayer = Layer.succeed(Cache, {
  delete: (key) =>
    Effect.sync(() => {
      store.delete(key);
    }),
  get: (key) => Effect.sync(() => Option.fromUndefinedOr(store.get(key))),
  set: (key, value) =>
    Effect.sync(() => {
      store.set(key, value);
    }),
});
const failingCacheLayer = Layer.succeed(Cache, {
  delete: () => Effect.void,
  get: () => Effect.fail(new CacheNotRead({ cause: new Error("redis down") })),
  set: () => Effect.void,
});

const withoutCache = TaskService.layerNoDeps.pipe(Layer.provide(repoLayer));
// Cache must be provided *to* the service layer; a sibling in mergeAll is invisible to
// Effect.serviceOption.
const withCache = TaskService.layerNoDeps.pipe(
  Layer.provide(Layer.merge(repoLayer, memoryCacheLayer)),
);
const withFailingCache = TaskService.layerNoDeps.pipe(
  Layer.provide(Layer.merge(repoLayer, failingCacheLayer)),
);

const driverRow = [7, true, "from the driver", "u1", "2026-01-02 03:04:05.678"];
const expectedTask = {
  createdAt: new Date("2026-01-02T03:04:05.678Z"),
  done: true,
  id: 7,
  ownerId: "u1",
  title: "from the driver",
};

describe("TaskService", () => {
  beforeEach(() => {
    query.mockReset();
    query.mockResolvedValue({ rows: [driverRow] });
    store.clear();
  });

  it.effect("without a Cache, every list hits the repository", () =>
    Effect.gen(function* program() {
      const service = yield* TaskService;

      yield* service.list();
      const all = yield* service.list();

      expect(all).toEqual([expectedTask]);
      expect(query).toHaveBeenCalledTimes(2);
    }).pipe(Effect.provide(withoutCache)),
  );

  it.effect("with a Cache, a second list is served from the cache", () =>
    Effect.gen(function* program() {
      const service = yield* TaskService;

      yield* service.list();
      const cached = yield* service.list();

      expect(cached).toEqual([expectedTask]);
      expect(cached[0]?.createdAt).toBeInstanceOf(Date);
      expect(query).toHaveBeenCalledTimes(1);
    }).pipe(Effect.provide(withCache)),
  );

  it.effect("create invalidates the cached list", () =>
    Effect.gen(function* program() {
      const service = yield* TaskService;

      yield* service.list();
      yield* service.create({ ownerId: "u1", title: "from the driver" });
      yield* service.list();

      // list, create, list again
      expect(query).toHaveBeenCalledTimes(3);
    }).pipe(Effect.provide(withCache)),
  );

  it.effect("a failing cache read falls back to the repository", () =>
    Effect.gen(function* program() {
      const service = yield* TaskService;

      const all = yield* service.list();

      expect(all).toEqual([expectedTask]);
      expect(query).toHaveBeenCalledTimes(1);
    }).pipe(Effect.provide(withFailingCache)),
  );
});
