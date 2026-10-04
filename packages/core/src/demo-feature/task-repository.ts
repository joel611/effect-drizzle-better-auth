import { and, eq } from "drizzle-orm";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { Db, task } from "../libs/db";
import { Redis } from "../libs/redis";
import { TaskNotCreated, TaskNotFound, TaskNotListed, TaskNotUpdated } from "./errors";
import { taskListJsonSchema } from "./validation-schema";
import type { TaskCreateInput, TaskId, TaskUpdateInput } from "./validation-schema";

// `task:` keeps the key apart from Better Auth's `better-auth:` keys on the same Redis.
const LIST_CACHE_KEY = "task:list";
// Backstop for a missed invalidation: a stale list lives at most this long.
const LIST_CACHE_TTL_SECONDS = 60;
// The shared client queues commands while offline, so a call can hang. Cap each one here.
const CACHE_TIMEOUT = "100 millis";

const decodeTaskList = Schema.decodeUnknownEffect(taskListJsonSchema);
const encodeTaskList = Schema.encodeEffect(taskListJsonSchema);

export class TaskRepository extends Context.Service<TaskRepository>()("TaskRepository", {
  make: Effect.gen(function* make() {
    const db = yield* Db;
    // Optional: `Redis` is not in `make`'s requirements. It is only `Some` when Redis is
    // provided to this layer with `Layer.provide` (see `layerCached`), not merged beside it.
    const redis = yield* Effect.serviceOption(Redis);

    // Runs one cache step with a timeout. Any failure is logged and comes back as `None`,
    // so the cache never reaches the error channel.
    const cacheStep = <A, E>(label: string, step: Effect.Effect<A, E>) =>
      step.pipe(
        Effect.timeout(CACHE_TIMEOUT),
        Effect.tapError((cause) =>
          Effect.logWarning(`TaskRepository cache ${label} failed`, cause),
        ),
        Effect.option,
      );

    const invalidateList = Option.match(redis, {
      onNone: () => Effect.void,
      onSome: (client) =>
        cacheStep(
          "invalidate",
          Effect.tryPromise(() => client.del(LIST_CACHE_KEY)),
        ),
    });

    const listFromDb = Effect.tryPromise({
      catch: (cause) => new TaskNotListed({ cause }),
      try: () => db.select().from(task),
    });

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
        yield* invalidateList;
        return row;
      }),
      list: Effect.fn("TaskRepository.list")(function* list() {
        if (Option.isNone(redis)) {
          return yield* listFromDb;
        }
        const client = redis.value;
        const cached = yield* cacheStep(
          "read",
          Effect.tryPromise(() => client.get(LIST_CACHE_KEY)).pipe(
            Effect.flatMap((raw) =>
              raw === null ? Effect.succeed(Option.none()) : Effect.asSome(decodeTaskList(raw)),
            ),
          ),
        ).pipe(Effect.map(Option.flatten));
        if (Option.isSome(cached)) {
          return cached.value;
        }
        const rows = yield* listFromDb;
        yield* cacheStep(
          "write",
          encodeTaskList(rows).pipe(
            Effect.flatMap((json) =>
              Effect.tryPromise(() =>
                client.set(LIST_CACHE_KEY, json, "EX", LIST_CACHE_TTL_SECONDS),
              ),
            ),
          ),
        );
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
        yield* invalidateList;
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
