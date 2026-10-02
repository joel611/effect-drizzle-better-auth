import {
  TaskId,
  TaskRepository,
  taskCreateSchema,
  taskUpdateSchema,
} from "core";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { Hono } from "hono";

import type { AppEnv } from "../app";
import { run } from "../effect-runtime";
import { requireAuth } from "../middleware/auth-middleware";

export const taskRoutes = new Hono<AppEnv>();

taskRoutes.get("/", () =>
  run(
    Effect.gen(function* tasks() {
      const repo = yield* TaskRepository;
      return Response.json(yield* repo.list());
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
      // 400 mapping, and TaskRepository.create receives typed data and
      // stays focused on persistence.
      const input = yield* Schema.decodeUnknownEffect(taskCreateSchema)({
        ownerId: user.id,
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

      const repo = yield* TaskRepository;
      const task = yield* repo.update(id, user.id, input);
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
