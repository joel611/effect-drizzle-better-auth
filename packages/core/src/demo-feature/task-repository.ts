import { and, eq } from "drizzle-orm";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { Db, task } from "../libs/db";
import { TaskNotCreated, TaskNotFound } from "./errors";
import type { TaskCreateInput, TaskId, TaskUpdateInput } from "./validation-schema";

export class TaskRepository extends Context.Service<TaskRepository>()("TaskRepository", {
  make: Effect.gen(function* make() {
    const db = yield* Db;

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
        return row;
      }),
      list: Effect.fn("TaskRepository.list")(function* list() {
        return yield* Effect.tryPromise(() => db.select().from(task));
      }),
      // Callers must decode with taskUpdateSchema first; no validation here.
      // Scoped to ownerId so a non-owner gets TaskNotFound, same as a missing id.
      update: Effect.fn("TaskRepository.update")(function* update(
        id: TaskId,
        ownerId: string,
        data: TaskUpdateInput,
      ) {
        const [row] = yield* Effect.tryPromise(() =>
          db
            .update(task)
            .set(data)
            .where(and(eq(task.id, id), eq(task.ownerId, ownerId)))
            .returning(),
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
