import { Auth, TaskRepository } from "core";
import * as Effect from "effect/Effect";

import { runtime } from "./effect-runtime";

const port = Number(process.env.PORT ?? 3000);

const server = Bun.serve({
  port,
  routes: {
    "/api/auth/*": (req) =>
      runtime.runPromise(
        Effect.gen(function* handle() {
          const auth = yield* Auth;
          return yield* Effect.promise(() => auth.handler(req));
        })
      ),
    "/tasks": {
      GET: async () => {
        const tasks = await runtime.runPromise(
          Effect.gen(function* tasks() {
            const repo = yield* TaskRepository;
            return yield* repo.list();
          })
        );
        return Response.json(tasks);
      },
      POST: async (req) => {
        // Cast only; TaskRepository.create decodes against TaskCreate.
        const body = (await req.json()) as { title: string };
        return runtime.runPromise(
          Effect.gen(function* created() {
            const auth = yield* Auth;
            const session = yield* Effect.promise(() =>
              auth.api.getSession({ headers: req.headers })
            );
            if (!session) {
              return Response.json({ error: "unauthorized" }, { status: 401 });
            }
            const repo = yield* TaskRepository;
            const task = yield* repo.create({
              ownerId: session.user.id,
              title: body.title,
            });
            return Response.json(task, { status: 201 });
          }).pipe(
            Effect.catchTag("SchemaError", (schemaError) =>
              Effect.succeed(
                Response.json({ error: schemaError.message }, { status: 400 })
              )
            )
          )
        );
      },
    },
  },
});

console.log(`server listening on ${server.url}`);
