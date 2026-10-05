import { Context, Effect, Layer, Option, Schema } from "effect";

import { cacheRedisLayer } from "../effects/cache/redis";
import { Cache } from "../effects/cache/service";
import { TaskRepository } from "./task-repository";
import { taskSelectSchema } from "./validation-schema";
import type { TaskCreateInput, TaskId, TaskUpdateInput } from "./validation-schema";

// `task:` prefix keeps the key apart from Better Auth's `better-auth:` keys on the same Redis.
export const TASK_LIST_KEY = "task:list";
export const TASK_LIST_TTL_SECONDS = 60;
// Every cache call gets this budget, so a hung cache cannot stall a request.
export const CACHE_TIMEOUT = "100 millis";

// JSON codec for the cached list, so `createdAt` comes back as a Date and `id` as a TaskId.
const TaskListJson = Schema.fromJsonString(Schema.toCodecJson(Schema.Array(taskSelectSchema)));
const decodeList = Schema.decodeUnknownEffect(TaskListJson);
const encodeList = Schema.encodeEffect(TaskListJson);

// Task use cases over TaskRepository, which only talks to the database. `Cache` is optional:
// when a Cache layer is provided *to* this layer, `list` reads through it. Cache failures are
// logged and fall back to the repository, so the error channel is the repository's.
export class TaskService extends Context.Service<TaskService>()("TaskService", {
  make: Effect.gen(function* make() {
    const repo = yield* TaskRepository;
    const cache = yield* Effect.serviceOption(Cache);

    const invalidateList = Option.match(cache, {
      onNone: () => Effect.void,
      onSome: (c) =>
        c
          .delete(TASK_LIST_KEY)
          .pipe(
            Effect.timeout(CACHE_TIMEOUT),
            Effect.ignore({ log: "Warn", message: "TaskService: task list invalidation failed" }),
          ),
    });

    return {
      create: Effect.fn("TaskService.create")(function* create(data: TaskCreateInput) {
        const row = yield* repo.create(data);
        yield* invalidateList;
        return row;
      }),
      list: Effect.fn("TaskService.list")(function* list() {
        if (Option.isNone(cache)) {
          return yield* repo.list();
        }
        const c = cache.value;
        // A miss, a failed read, a timeout or a payload that no longer decodes all become None.
        const cached = yield* c.get(TASK_LIST_KEY).pipe(
          Effect.timeout(CACHE_TIMEOUT),
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.succeedNone,
              onSome: (json) => Effect.asSome(decodeList(json)),
            }),
          ),
          Effect.tapError((error) =>
            Effect.logWarning("TaskService: task list cache read failed", error),
          ),
          Effect.orElseSucceed(Option.none),
        );
        if (Option.isSome(cached)) {
          return cached.value;
        }
        const rows = yield* repo.list();
        yield* encodeList(rows).pipe(
          Effect.flatMap((json) => c.set(TASK_LIST_KEY, json, TASK_LIST_TTL_SECONDS)),
          Effect.timeout(CACHE_TIMEOUT),
          Effect.ignore({ log: "Warn", message: "TaskService: task list cache write failed" }),
        );
        return rows;
      }),
      update: Effect.fn("TaskService.update")(function* update(
        id: TaskId,
        ownerId: string,
        data: TaskUpdateInput,
      ) {
        const row = yield* repo.update(id, ownerId, data);
        yield* invalidateList;
        return row;
      }),
    };
  }),
}) {
  static readonly layerNoDeps = Layer.effect(this, this.make);
  // No cache: every `list` queries Postgres.
  static readonly layer = this.layerNoDeps.pipe(Layer.provide(TaskRepository.layer));
  // Redis-backed cache. Cache is provided to the layer, not merged beside it, so
  // `Effect.serviceOption(Cache)` sees it while `make` runs.
  static readonly layerCached = this.layerNoDeps.pipe(
    Layer.provide(Layer.merge(TaskRepository.layer, cacheRedisLayer)),
  );
}
