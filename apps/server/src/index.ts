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
        const body = (await req.json()) as { title?: string };
        const { title } = body;
        if (!title) {
          return Response.json({ error: "title is required" }, { status: 400 });
        }
        const created = await runtime.runPromise(
          Effect.gen(function* created() {
            const auth = yield* Auth;
            const session = yield* Effect.promise(() =>
              auth.api.getSession({ headers: req.headers })
            );
            if (!session) {
              return null;
            }
            const repo = yield* TaskRepository;
            return yield* repo.create(title, session.user.id);
          })
        );
        if (!created) {
          return Response.json({ error: "unauthorized" }, { status: 401 });
        }
        return Response.json(created, { status: 201 });
      },
    },
  },
});

console.log(`server listening on ${server.url}`);
