import { eq } from "drizzle-orm";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import { Db } from "../libs/db";
import { task, taskInsertSchema, taskUpdateSchema } from "./db-schema.ts";
import type { TaskInsert, TaskUpdate } from "./db-schema.ts";
import {
  TaskCreateError,
  TaskCreateValidationError,
  TaskDeleteError,
  TaskFindError,
  TaskListError,
  TaskNotFoundError,
  TaskUpdateError,
  TaskUpdateValidationError,
} from "./error";

const decodeTaskInsert = Schema.decodeUnknownEffect(taskInsertSchema);
const decodeTaskUpdate = Schema.decodeUnknownEffect(taskUpdateSchema);

export class TaskRepository extends Context.Service<TaskRepository>()(
  "TaskRepository",
  {
    make: Effect.gen(function* make() {
      const db = yield* Db;

      return {
        create: Effect.fn("TaskRepository.create")(function* create(
          data: TaskInsert
        ) {
          const input = yield* decodeTaskInsert(data).pipe(
            Effect.mapError(
              (error) =>
                new TaskCreateValidationError({ message: error.message })
            )
          );
          const [row] = yield* Effect.tryPromise({
            catch: (cause) => new TaskCreateError({ cause }),
            try: () => db.insert(task).values(input).returning(),
          });
          if (!row) {
            return yield* Effect.die("insert returned no rows");
          }
          return row;
        }),
        findById: Effect.fn("TaskRepository.findById")(function* findById(
          id: number
        ) {
          const [row] = yield* Effect.tryPromise({
            catch: (cause) => new TaskFindError({ cause }),
            try: () => db.select().from(task).where(eq(task.id, id)),
          });
          if (!row) {
            return yield* new TaskNotFoundError({ id });
          }
          return row;
        }),
        list: Effect.fn("TaskRepository.list")(function* list() {
          return yield* Effect.tryPromise({
            catch: (cause) => new TaskListError({ cause }),
            try: () => db.select().from(task),
          });
        }),
        remove: Effect.fn("TaskRepository.remove")(function* remove(
          id: number
        ) {
          const [row] = yield* Effect.tryPromise({
            catch: (cause) => new TaskDeleteError({ cause }),
            try: () => db.delete(task).where(eq(task.id, id)).returning(),
          });
          if (!row) {
            return yield* new TaskNotFoundError({ id });
          }
          return row;
        }),
        update: Effect.fn("TaskRepository.update")(function* update(
          id: number,
          data: TaskUpdate
        ) {
          const input = yield* decodeTaskUpdate(data).pipe(
            Effect.mapError(
              (error) =>
                new TaskUpdateValidationError({ message: error.message })
            )
          );
          const [row] = yield* Effect.tryPromise({
            catch: (cause) => new TaskUpdateError({ cause }),
            try: () =>
              db.update(task).set(input).where(eq(task.id, id)).returning(),
          });
          if (!row) {
            return yield* new TaskNotFoundError({ id });
          }
          return row;
        }),
      };
    }),
  }
) {
  static readonly layerNoDeps = Layer.effect(this, this.make);
  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide(Db.layer)
  );
}
