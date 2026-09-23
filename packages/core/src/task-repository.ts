import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { Db, task } from "./libs/db";

export class TaskRepository extends Context.Service<TaskRepository>()(
  "TaskRepository",
  {
    make: Effect.gen(function* make() {
      const db = yield* Db;

      return {
        create: (title: string) =>
          Effect.tryPromise(() =>
            db.insert(task).values({ title }).returning()
          ).pipe(
            Effect.flatMap(([row]) =>
              row ? Effect.succeed(row) : Effect.die("insert returned no rows")
            )
          ),
        list: () => Effect.tryPromise(() => db.select().from(task)),
      };
    }),
  }
) {
  static readonly layerNoDeps = Layer.effect(this, this.make);
  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide(Db.layer)
  );
}
