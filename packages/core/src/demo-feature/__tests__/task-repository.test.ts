import { beforeEach, expect, layer, vi } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { expectTypeOf } from "vitest";

import { Cache, CacheError } from "../../libs/cache";
import { Db, user } from "../../libs/db";
import type { task } from "../../libs/db";
import { dbMockLayer } from "../../libs/db/effect/layer";
import { Redis } from "../../libs/redis";
import { TaskNotCreated, TaskNotFound, TaskNotListed, TaskNotUpdated } from "../errors";
import { TaskRepository } from "../task-repository";
import { TaskId } from "../validation-schema";

// `dbMockLayer`'s `drizzle.mock()` instance queries through its `$client`, an empty object
// at runtime. Putting a spied `query` on it lets each test decide what the driver returns,
// with no Postgres. Drizzle queries with `rowMode: "array"`: rows are positional, in
// column order (id, done, title, owner_id, created_at), and hold raw wire values, so a
// timestamp is a string. An object row maps every column to `undefined`.
const query = vi.fn();
const spiedDb = Layer.effect(
  Db,
  Effect.gen(function* spied() {
    const db = yield* Db;
    Object.assign(db.$client, { query });
    return db;
  }),
).pipe(Layer.provide(dbMockLayer));

const driverRow = [7, true, "from the driver", "u1", "2026-01-02 03:04:05.678"];
const driverTask = {
  createdAt: new Date("2026-01-02T03:04:05.678Z"),
  done: true,
  id: 7,
  ownerId: "u1",
  title: "from the driver",
};

layer(TaskRepository.layerNoDeps.pipe(Layer.provide(spiedDb)))(
  "TaskRepository over a spied dbMockLayer",
  (it) => {
    beforeEach(() => {
      query.mockReset();
    });

    it.effect("lists the rows the driver returns", () =>
      Effect.gen(function* program() {
        query.mockResolvedValueOnce({ rows: [driverRow] });
        const repo = yield* TaskRepository;

        const all = yield* repo.list();

        expect(all).toEqual([driverTask]);
      }),
    );

    it.effect("queries the driver on every list when no Cache is provided", () =>
      Effect.gen(function* program() {
        query.mockResolvedValue({ rows: [] });
        const repo = yield* TaskRepository;

        yield* repo.list();
        yield* repo.list();

        expect(query).toHaveBeenCalledTimes(2);
      }),
    );

    it.effect("fails create with TaskNotCreated when the driver returns no row", () =>
      Effect.gen(function* program() {
        query.mockResolvedValueOnce({ rows: [] });
        const repo = yield* TaskRepository;

        const error = yield* repo.create({ ownerId: "u1", title: "t" }).pipe(Effect.flip);

        expect(error).toBeInstanceOf(TaskNotCreated);
      }),
    );

    it.effect("fails create with TaskNotCreated when the driver rejects", () =>
      Effect.gen(function* program() {
        query.mockRejectedValueOnce(new Error("connection lost"));
        const repo = yield* TaskRepository;

        const error = yield* repo.create({ ownerId: "u1", title: "t" }).pipe(Effect.flip);

        expect(error).toBeInstanceOf(TaskNotCreated);
      }),
    );

    it.effect("fails list with TaskNotListed when the driver rejects", () =>
      Effect.gen(function* program() {
        query.mockRejectedValueOnce(new Error("connection lost"));
        const repo = yield* TaskRepository;

        const error = yield* repo.list().pipe(Effect.flip);

        expect(error).toBeInstanceOf(TaskNotListed);
      }),
    );

    it.effect("fails update with TaskNotUpdated when the driver rejects", () =>
      Effect.gen(function* program() {
        query.mockRejectedValueOnce(new Error("connection lost"));
        const repo = yield* TaskRepository;

        const error = yield* repo.update(TaskId.make(1), "u1", { done: true }).pipe(Effect.flip);

        expect(error).toBeInstanceOf(TaskNotUpdated);
      }),
    );

    it.effect("scopes update to the id and owner it sends to the driver", () =>
      Effect.gen(function* program() {
        query.mockResolvedValueOnce({ rows: [] });
        const repo = yield* TaskRepository;

        const error = yield* repo.update(TaskId.make(1), "u1", { done: true }).pipe(Effect.flip);

        expect(error).toBeInstanceOf(TaskNotFound);
        expect(query).toHaveBeenCalledWith(expect.anything(), [true, 1, "u1"]);
      }),
    );
  },
);

// The cache must not change the interface: `list` succeeds with exactly the DB row type.
expectTypeOf<Effect.Success<ReturnType<TaskRepository["Service"]["list"]>>>().toEqualTypeOf<
  (typeof task.$inferSelect)[]
>();

// A fake `Cache`, merged beside the repository like the API runtime merges `Cache.layer`.
// Each method reads it from the test's context with `Effect.serviceOption`.
const cacheGet = vi.fn();
const cacheSet = vi.fn();
const cacheDel = vi.fn();
const fakeCache: Cache["Service"] = { del: cacheDel, get: cacheGet, set: cacheSet };
const cachedSpiedLayer = Layer.mergeAll(
  TaskRepository.layerNoDeps.pipe(Layer.provide(spiedDb)),
  Layer.succeed(Cache, fakeCache),
);
const cacheDown = () => Effect.fail(new CacheError({ cause: "redis down" }));

layer(cachedSpiedLayer)("TaskRepository with a fake Cache", (it) => {
  beforeEach(() => {
    query.mockReset();
    cacheGet.mockReset().mockReturnValue(Effect.succeedNone);
    cacheSet.mockReset().mockReturnValue(Effect.void);
    cacheDel.mockReset().mockReturnValue(Effect.void);
  });

  it.effect("serves list from the cache without querying the driver", () =>
    Effect.gen(function* program() {
      cacheGet.mockReturnValueOnce(
        Effect.succeedSome(
          JSON.stringify([
            {
              createdAt: "2026-03-04T05:06:07.890Z",
              done: false,
              id: 9,
              ownerId: "u2",
              title: "from the cache",
            },
          ]),
        ),
      );
      const repo = yield* TaskRepository;

      const all = yield* repo.list();

      expect(all).toEqual([
        {
          createdAt: new Date("2026-03-04T05:06:07.890Z"),
          done: false,
          id: 9,
          ownerId: "u2",
          title: "from the cache",
        },
      ]);
      expect(all[0]?.createdAt).toBeInstanceOf(Date);
      expect(query).not.toHaveBeenCalled();
    }),
  );

  it.effect("on a miss, lists from the driver and caches the rows with a 60s TTL", () =>
    Effect.gen(function* program() {
      query.mockResolvedValueOnce({ rows: [driverRow] });
      const repo = yield* TaskRepository;

      const all = yield* repo.list();

      expect(all).toEqual([driverTask]);
      expect(cacheSet).toHaveBeenCalledWith(
        "task:list",
        JSON.stringify([
          {
            id: 7,
            done: true,
            title: "from the driver",
            ownerId: "u1",
            createdAt: "2026-01-02T03:04:05.678Z",
          },
        ]),
        60,
      );
    }),
  );

  it.effect("lists from the driver when the cache read fails", () =>
    Effect.gen(function* program() {
      cacheGet.mockImplementationOnce(cacheDown);
      query.mockResolvedValueOnce({ rows: [driverRow] });
      const repo = yield* TaskRepository;

      const all = yield* repo.list();

      expect(all).toEqual([driverTask]);
    }),
  );

  it.effect("lists from the driver when the cached payload is corrupt", () =>
    Effect.gen(function* program() {
      cacheGet.mockReturnValueOnce(Effect.succeedSome(JSON.stringify([{ id: "not a task" }])));
      query.mockResolvedValueOnce({ rows: [driverRow] });
      const repo = yield* TaskRepository;

      const all = yield* repo.list();

      expect(all).toEqual([driverTask]);
    }),
  );

  it.effect("lists from the driver when the cache write fails", () =>
    Effect.gen(function* program() {
      cacheSet.mockImplementationOnce(cacheDown);
      query.mockResolvedValueOnce({ rows: [driverRow] });
      const repo = yield* TaskRepository;

      const all = yield* repo.list();

      expect(all).toEqual([driverTask]);
    }),
  );

  it.effect("still fails list with TaskNotListed on a miss when the driver rejects", () =>
    Effect.gen(function* program() {
      query.mockRejectedValueOnce(new Error("connection lost"));
      const repo = yield* TaskRepository;

      const error = yield* repo.list().pipe(Effect.flip);

      expect(error).toBeInstanceOf(TaskNotListed);
    }),
  );

  it.effect("create deletes the cached list after a successful write", () =>
    Effect.gen(function* program() {
      query.mockResolvedValueOnce({ rows: [driverRow] });
      const repo = yield* TaskRepository;

      yield* repo.create({ ownerId: "u1", title: "from the driver" });

      expect(cacheDel).toHaveBeenCalledWith("task:list");
    }),
  );

  it.effect("update deletes the cached list after a successful write", () =>
    Effect.gen(function* program() {
      query.mockResolvedValueOnce({ rows: [driverRow] });
      const repo = yield* TaskRepository;

      yield* repo.update(TaskId.make(7), "u1", { done: true });

      expect(cacheDel).toHaveBeenCalledWith("task:list");
    }),
  );

  it.effect("create and update still return their rows when invalidation fails", () =>
    Effect.gen(function* program() {
      cacheDel.mockImplementation(cacheDown);
      query.mockResolvedValue({ rows: [driverRow] });
      const repo = yield* TaskRepository;

      const created = yield* repo.create({
        ownerId: "u1",
        title: "from the driver",
      });
      const updated = yield* repo.update(TaskId.make(7), "u1", {
        done: true,
      });

      expect(created).toEqual(driverTask);
      expect(updated).toEqual(driverTask);
    }),
  );
});

// Wired like the API runtime: `Cache.layer` merged at the root beside `TaskRepository.layer`.
// If the methods did not see the cache there, `list` would never write the key and this suite
// fails. `Redis` is only here to inspect the key.
layer(Layer.mergeAll(TaskRepository.layer, Cache.layer, Db.layer, Redis.layer))(
  "TaskRepository with Cache merged at the root, over Postgres and Redis",
  (it) => {
    it.effect("caches list in Redis and drops the cache when a task is created", () =>
      Effect.gen(function* program() {
        const repo = yield* TaskRepository;
        const db = yield* Db;
        const redis = yield* Redis;
        const ownerId = crypto.randomUUID();
        yield* Effect.tryPromise(() =>
          db.insert(user).values({
            email: `${ownerId}@example.com`,
            id: ownerId,
            name: "Cache",
          }),
        );

        // No reset of `task:list` first: after `list` the key exists whether it was a miss or
        // a hit, and `create` must delete it either way.
        yield* repo.list();
        const cachedAfterList = yield* Effect.tryPromise(() => redis.exists("task:list"));
        const created = yield* repo.create({
          ownerId,
          title: "cache invalidation",
        });
        const cachedAfterCreate = yield* Effect.tryPromise(() => redis.exists("task:list"));
        const all = yield* repo.list();

        expect(cachedAfterList).toBe(1);
        expect(cachedAfterCreate).toBe(0);
        expect(all).toContainEqual(created);
      }),
    );
  },
);

layer(Layer.mergeAll(TaskRepository.layer, Db.layer))("TaskRepository", (it) => {
  const insertOwner = Effect.fn("insertOwner")(function* insertOwner() {
    const db = yield* Db;
    const ownerId = crypto.randomUUID();
    yield* Effect.tryPromise(() =>
      db.insert(user).values({
        email: `${ownerId}@example.com`,
        id: ownerId,
        name: "Task Owner",
      }),
    );
    return ownerId;
  });

  it.effect("creates a task and lists it back", () =>
    Effect.gen(function* program() {
      const repo = yield* TaskRepository;
      const ownerId = yield* insertOwner();

      const created = yield* repo.create({
        ownerId,
        title: "core repo test",
      });
      const all = yield* repo.list();

      expect(created).toMatchObject({ ownerId, title: "core repo test" });
      expect(all.length).toBeGreaterThan(0);
    }),
  );

  it.effect("updates a task", () =>
    Effect.gen(function* program() {
      const repo = yield* TaskRepository;
      const ownerId = yield* insertOwner();
      const created = yield* repo.create({ ownerId, title: "before" });

      const updated = yield* repo.update(created.id, ownerId, {
        done: true,
        title: "after",
      });

      expect(updated).toMatchObject({ done: true, ownerId, title: "after" });
    }),
  );

  it.effect("fails with TaskNotFound for a missing id", () =>
    Effect.gen(function* program() {
      const repo = yield* TaskRepository;

      const error = yield* repo
        .update(TaskId.make(-1), crypto.randomUUID(), { done: true })
        .pipe(Effect.flip);

      expect(error).toBeInstanceOf(TaskNotFound);
    }),
  );

  it.effect("fails with TaskNotCreated when the owner does not exist", () =>
    Effect.gen(function* program() {
      const repo = yield* TaskRepository;

      const error = yield* repo
        .create({ ownerId: crypto.randomUUID(), title: "orphan" })
        .pipe(Effect.flip);

      expect(error).toBeInstanceOf(TaskNotCreated);
    }),
  );

  it.effect("fails with TaskNotFound when updating another owner's task", () =>
    Effect.gen(function* program() {
      const repo = yield* TaskRepository;
      const ownerId = yield* insertOwner();
      const created = yield* repo.create({ ownerId, title: "mine" });

      const error = yield* repo
        .update(created.id, crypto.randomUUID(), { done: true })
        .pipe(Effect.flip);

      expect(error).toBeInstanceOf(TaskNotFound);
    }),
  );
});
