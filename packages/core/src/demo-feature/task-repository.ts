import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { Db, task } from "../libs/db";
import { TaskCreateError, TaskListError } from "./error";

export class TaskRepository extends Context.Service<TaskRepository>()(
  "TaskRepository",
  {
    make: Effect.gen(function* make() {
      const db = yield* Db;

      return {
        create: Effect.fn("TaskRepository.create")(function* create(
          title: string
        ) {
          const [row] = yield* Effect.tryPromise({
            catch: (cause) => new TaskCreateError({ cause }),
            try: () => db.insert(task).values({ title }).returning(),
          });
          if (!row) {
            return yield* Effect.die("insert returned no rows");
          }
          return row;
        }),
        list: Effect.fn("TaskRepository.list")(function* list() {
          return yield* Effect.tryPromise({
            catch: (cause) => new TaskListError({ cause }),
            try: () => db.select().from(task),
          });
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
