import { Context, Effect, Layer, Option, Schema } from "effect";

import { Cache } from "../effects/cache/service";
import { TaskRepository } from "./task-repository";
import { taskSelectSchema } from "./validation-schema";
import type { TaskCreateInput, TaskId, TaskUpdateInput } from "./validation-schema";

const LIST_KEY = "tasks:list";
const LIST_TTL_SECONDS = 60;

// JSON codec for the cached list, so `createdAt` comes back as a Date and `id` as a TaskId.
const TaskListJson = Schema.fromJsonString(Schema.toCodecJson(Schema.Array(taskSelectSchema)));
const decodeList = Schema.decodeUnknownEffect(TaskListJson);
const encodeList = Schema.encodeEffect(TaskListJson);

// Task use cases over TaskRepository. `Cache` is optional: when a Cache layer is provided
// to this layer, `list` reads through it. Cache failures never surface; they fall back to
// the repository, so the error channel is the repository's.
export class TaskService extends Context.Service<TaskService>()("TaskService", {
  make: Effect.gen(function* make() {
    const repo = yield* TaskRepository;
    const cache = yield* Effect.serviceOption(Cache);

    const invalidateList = Option.match(cache, {
      onNone: () => Effect.void,
      onSome: (c) => c.delete(LIST_KEY).pipe(Effect.ignore),
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
        const cached = yield* c
          .get(LIST_KEY)
          .pipe(Effect.flatMap(Effect.fromOption), Effect.flatMap(decodeList), Effect.option);
        if (Option.isSome(cached)) {
          return cached.value;
        }
        const rows = yield* repo.list();
        yield* encodeList(rows).pipe(
          Effect.flatMap((json) => c.set(LIST_KEY, json, LIST_TTL_SECONDS)),
          Effect.ignore,
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
  static readonly layer = this.layerNoDeps.pipe(Layer.provide(TaskRepository.layer));
}
