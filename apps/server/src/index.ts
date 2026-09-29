import {
  Auth,
  TaskId,
  TaskRepository,
  taskCreateSchema,
  taskUpdateSchema,
} from "core";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

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
        // Cast only; taskCreateSchema decode below validates.
        const body = (await req.json()) as { title?: unknown };

        return runtime.runPromise(
          Effect.gen(function* created() {
            const auth = yield* Auth;

            const session = yield* Effect.promise(() =>
              auth.api.getSession({ headers: req.headers })
            );
            if (!session) {
              return Response.json({ error: "unauthorized" }, { status: 401 });
            }

            // Parse untrusted input at the HTTP boundary: the handler owns the
            // 400 mapping, and TaskRepository.create receives typed data and
            // stays focused on persistence.
            const input = yield* Schema.decodeUnknownEffect(taskCreateSchema)({
              ownerId: session.user.id,
              title: body.title,
            });

            const repo = yield* TaskRepository;
            const task = yield* repo.create(input);
            return Response.json(task, { status: 201 });
          }).pipe(
            Effect.catchTags({
              SchemaError: (schemaError) =>
                Effect.succeed(
                  Response.json({ error: schemaError.message }, { status: 400 })
                ),
              TaskNotCreated: () =>
                Effect.succeed(
                  Response.json({ error: "task not created" }, { status: 500 })
                ),
            })
          )
        );
      },
    },
    "/tasks/:id": {
      PATCH: async (req) => {
        const body: unknown = await req.json();

        return runtime.runPromise(
          Effect.gen(function* updated() {
            const auth = yield* Auth;

            const session = yield* Effect.promise(() =>
              auth.api.getSession({ headers: req.headers })
            );
            if (!session) {
              return Response.json({ error: "unauthorized" }, { status: 401 });
            }

            // Parse untrusted input at the HTTP boundary, same as POST /tasks.
            const id = yield* Schema.decodeUnknownEffect(TaskId)(
              Number(req.params.id)
            );
            const input =
              yield* Schema.decodeUnknownEffect(taskUpdateSchema)(body);
            if (Object.keys(input).length === 0) {
              return Response.json(
                { error: "no fields to update" },
                { status: 400 }
              );
            }

            const repo = yield* TaskRepository;
            const task = yield* repo.update(id, session.user.id, input);
            return Response.json(task);
          }).pipe(
            Effect.catchTags({
              SchemaError: (schemaError) =>
                Effect.succeed(
                  Response.json({ error: schemaError.message }, { status: 400 })
                ),
              TaskNotFound: () =>
                Effect.succeed(
                  Response.json({ error: "task not found" }, { status: 404 })
                ),
            })
          )
        );
      },
    },
  },
});

console.log(`server listening on ${server.url}`);
