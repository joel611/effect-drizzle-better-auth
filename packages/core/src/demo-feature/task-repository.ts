import { eq } from "drizzle-orm";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import { Db, task } from "../libs/db";
import { TaskNotFound } from "./errors";
import { taskCreateSchema, taskUpdateSchema } from "./validation-schema";
import type { TaskCreateInput, TaskId, TaskUpdateInput } from "./validation-schema";

export class TaskRepository extends Context.Service<TaskRepository>()("TaskRepository", {
  make: Effect.gen(function* make() {
    const db = yield* Db;

    return {
      create: Effect.fn("TaskRepository.create")(function* create(data: TaskCreateInput) {
        const parsed = yield* Schema.decodeUnknownEffect(taskCreateSchema)(data);

        const [row] = yield* Effect.tryPromise(() => db.insert(task).values(parsed).returning());
        if (!row) {
          return yield* Effect.die("insert returned no rows");
        }
        return row;
      }),
      list: Effect.fn("TaskRepository.list")(function* list() {
        return yield* Effect.tryPromise(() => db.select().from(task));
      }),
      update: Effect.fn("TaskRepository.update")(function* update(
        id: TaskId,
        data: TaskUpdateInput,
      ) {
        const parsed = yield* Schema.decodeUnknownEffect(taskUpdateSchema)(data);

        const [row] = yield* Effect.tryPromise(() =>
          db.update(task).set(parsed).where(eq(task.id, id)).returning(),
        );
        if (!row) {
          return yield* new TaskNotFound({ id });
        }
        return row;
      }),
    };
  }),
}) {
  static readonly layerNoDeps = Layer.effect(this, this.make);
  static readonly layer = Layer.effect(this, this.make).pipe(Layer.provide(Db.layer));
}
