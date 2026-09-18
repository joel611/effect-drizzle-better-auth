import { Db, DbLive, task } from "db";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

export class TaskRepository extends Context.Service<TaskRepository>()(
  "TaskRepository",
  {
    make: Effect.gen(function* make() {
      const db = yield* Db;

      return {
        create: (title: string) =>
          db
            .insert(task)
            .values({ title })
            .returning()
            .pipe(
              Effect.flatMap(([row]) =>
                row
                  ? Effect.succeed(row)
                  : Effect.die("insert returned no rows")
              )
            ),
        list: () => db.select().from(task),
      };
    }),
  }
) {}

export const TaskRepositoryLive = Layer.effect(
  TaskRepository,
  TaskRepository.make
).pipe(Layer.provide(DbLive));
