import { Auth } from "auth";
import { TaskRepository } from "core";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";

const runtime = ManagedRuntime.make(
  Layer.mergeAll(TaskRepository.layer, Auth.layer)
);
const port = Number(process.env.PORT ?? 3000);

const server = Bun.serve({
  port,
  routes: {
    "/api/auth/*": (req) =>
      runtime.runPromise(
        Effect.gen(function* handle() {
          const auth = yield* Auth;
          return yield* Effect.promise(() => auth.instance.handler(req));
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
        const body = (await req.json()) as { title?: string };
        const { title } = body;
        if (!title) {
          return Response.json({ error: "title is required" }, { status: 400 });
        }
        const created = await runtime.runPromise(
          Effect.gen(function* created() {
            const repo = yield* TaskRepository;
            return yield* repo.create(title);
          })
        );
        return Response.json(created, { status: 201 });
      },
    },
  },
});

console.log(`server listening on ${server.url}`);
