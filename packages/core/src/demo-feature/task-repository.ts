import { and, eq } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/effect-schema";
import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Struct from "effect/Struct";

import { Db, task } from "../libs/db";
import { Redis } from "../libs/redis";
import type { RedisClient } from "../libs/redis";
import { TaskNotCreated, TaskNotFound, TaskNotListed, TaskNotUpdated } from "./errors";
import { TaskId } from "./validation-schema";
import type { TaskCreateInput, TaskUpdateInput } from "./validation-schema";

type Task = typeof task.$inferSelect;

// `task:` keeps the key apart from Better Auth's `better-auth:` keys on the same Redis.
const LIST_CACHE_KEY = "task:list";
// Backstop for a missed invalidation: a stale list lives at most this long.
const LIST_CACHE_TTL_SECONDS = 60;
// The shared client queues commands while offline, so a call can hang. Cap each one here.
const CACHE_TIMEOUT = "100 millis";

// The cached list as a JSON string. `createdAt` is an ISO string on the wire and a `Date`
// after decoding, so a cached list deep-equals the rows `db.select()` returns.
const taskListJson = Schema.fromJsonString(
  Schema.mutable(
    Schema.Array(
      createSelectSchema(task, { id: TaskId }).mapFields(
        Struct.assign({ createdAt: Schema.DateFromString }),
      ),
    ),
  ),
);
const decodeTaskList = Schema.decodeUnknownEffect(taskListJson);
const encodeTaskList = Schema.encodeEffect(taskListJson);

// Runs one cache step in a named span with a timeout. A failure is logged (a plain miss is
// not) and becomes `None`, so the cache never reaches the error channel.
const cacheStep =
  (name: string) =>
  <A, E>(step: Effect.Effect<A, E>): Effect.Effect<Option.Option<A>> =>
    step.pipe(
      Effect.timeout(CACHE_TIMEOUT),
      Effect.tapError((cause) =>
        Cause.isNoSuchElementError(cause)
          ? Effect.void
          : Effect.logWarning(`${name} failed`, cause),
      ),
      Effect.option,
      Effect.withSpan(name),
    );

// `read` is typed as the DB row array so a cache hit and a DB read give `list` one type.
interface ListCache {
  readonly invalidate: Effect.Effect<void>;
  readonly read: Effect.Effect<Option.Option<Task[]>>;
  readonly write: (rows: Task[]) => Effect.Effect<void>;
}

// The list cache over an optional Redis client. With no client every step is a no-op miss.
const makeListCache = (client: Option.Option<RedisClient>): ListCache =>
  Option.match(client, {
    onNone: () => ({
      invalidate: Effect.void,
      read: Effect.succeedNone,
      write: (_rows: Task[]) => Effect.void,
    }),
    onSome: (redis) => ({
      invalidate: Effect.asVoid(
        cacheStep("TaskRepository.cache.invalidate")(
          Effect.tryPromise(() => redis.del(LIST_CACHE_KEY)),
        ),
      ),
      read: cacheStep("TaskRepository.cache.read")(
        Effect.tryPromise(() => redis.get(LIST_CACHE_KEY)).pipe(
          // A miss fails with NoSuchElementError, so it ends as `None` without a warning.
          Effect.flatMap(Effect.fromNullishOr),
          Effect.flatMap(decodeTaskList),
        ),
      ),
      write: (rows: Task[]) =>
        Effect.asVoid(
          cacheStep("TaskRepository.cache.write")(
            encodeTaskList(rows).pipe(
              Effect.flatMap((json) =>
                Effect.tryPromise(() =>
                  redis.set(LIST_CACHE_KEY, json, "EX", LIST_CACHE_TTL_SECONDS),
                ),
              ),
            ),
          ),
        ),
    }),
  });

export class TaskRepository extends Context.Service<TaskRepository>()("TaskRepository", {
  make: Effect.gen(function* make() {
    const db = yield* Db;
    // Optional: `Redis` is not in `make`'s requirements. It is only `Some` when Redis is
    // provided to this layer with `Layer.provide` (see `layerCached`), not merged beside it.
    const listCache = makeListCache(yield* Effect.serviceOption(Redis));

    return {
      // Callers must decode with taskCreateSchema first; no validation here.
      create: Effect.fn("TaskRepository.create")(function* create(data: TaskCreateInput) {
        const [row] = yield* Effect.tryPromise({
          catch: (cause) => new TaskNotCreated({ cause }),
          try: () => db.insert(task).values(data).returning(),
        });
        if (!row) {
          return yield* new TaskNotCreated({});
        }
        yield* listCache.invalidate;
        return row;
      }),
      list: Effect.fn("TaskRepository.list")(function* list() {
        const cached = yield* listCache.read;
        if (Option.isSome(cached)) {
          return cached.value;
        }
        const rows = yield* Effect.tryPromise({
          catch: (cause) => new TaskNotListed({ cause }),
          try: () => db.select().from(task),
        });
        yield* listCache.write(rows);
        return rows;
      }),
      // Callers must decode with taskUpdateSchema first; no validation here.
      // Scoped to ownerId so a non-owner gets TaskNotFound, same as a missing id.
      update: Effect.fn("TaskRepository.update")(function* update(
        id: TaskId,
        ownerId: string,
        data: TaskUpdateInput,
      ) {
        const [row] = yield* Effect.tryPromise({
          catch: (cause) => new TaskNotUpdated({ cause }),
          try: () =>
            db
              .update(task)
              .set(data)
              .where(and(eq(task.id, id), eq(task.ownerId, ownerId)))
              .returning(),
        });
        if (!row) {
          return yield* new TaskNotFound({ id });
        }
        yield* listCache.invalidate;
        return row;
      }),
    };
  }),
}) {
  static readonly layerNoDeps = Layer.effect(this, this.make);
  // Db only, no cache.
  static readonly layer = this.layerNoDeps.pipe(Layer.provide(Db.layer));
  // Db + Redis read-through cache for `list`. Redis must be provided to the repository
  // layer: `Layer.mergeAll(TaskRepository.layer, Redis.layer)` would leave the option `None`.
  static readonly layerCached = this.layerNoDeps.pipe(
    Layer.provide(Layer.mergeAll(Db.layer, Redis.layer)),
  );
}
