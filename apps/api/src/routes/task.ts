import { TaskId, TaskService, taskCreateSchema, taskUpdateSchema } from "core";
import { Effect, Schema } from "effect";
import { Hono } from "hono";

import type { AppEnv } from "../app";
import { run } from "../effect-runtime";
import { requireAuth } from "../middleware/auth-middleware";

export const taskRoutes = new Hono<AppEnv>();

taskRoutes.get("/", () =>
  run(
    Effect.gen(function* tasks() {
      const service = yield* TaskService;
      return Response.json(yield* service.list());
    }).pipe(
      Effect.catchTags({
        TaskNotListed: () =>
          Effect.succeed(
            Response.json({ error: "tasks not listed" }, { status: 500 })
          ),
      })
    )
  )
);

taskRoutes.post("/", requireAuth, async (c) => {
  // Cast only; taskCreateSchema decode below validates.
  const body = (await c.req.json()) as { title?: unknown };
  const user = c.get("user");

  return run(
    Effect.gen(function* created() {
      // Parse untrusted input at the HTTP boundary: the handler owns the
      // 400 mapping, and TaskService.create receives typed data and
      // stays focused on persistence.
      const input = yield* Schema.decodeUnknownEffect(taskCreateSchema)({
        ownerId: user.id,
        title: body.title,
      });

      const service = yield* TaskService;
      const task = yield* service.create(input);
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
});

taskRoutes.patch("/:id", requireAuth, async (c) => {
  const body: unknown = await c.req.json();
  const user = c.get("user");

  return run(
    Effect.gen(function* updated() {
      // Parse untrusted input at the HTTP boundary, same as POST /api/tasks.
      const id = yield* Schema.decodeUnknownEffect(TaskId)(
        Number(c.req.param("id"))
      );
      const input = yield* Schema.decodeUnknownEffect(taskUpdateSchema)(body);

      const service = yield* TaskService;
      const task = yield* service.update(id, user.id, input);
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
        TaskNotUpdated: () =>
          Effect.succeed(
            Response.json({ error: "task not updated" }, { status: 500 })
          ),
      })
    )
  );
});
