# Running effects at a promise-based entrypoint

An entrypoint is anything that calls Effect code and expects a promise back: an HTTP handler (Hono, Express, Next.js route), a queue or cron worker, a CLI command. Each entrypoint app has one `effect-runtime.ts` with a `runtime` and a `run` helper. Every effect goes through `run`.

## `run` requires `E = never`

```ts
// apps/<entrypoint>/src/effect-runtime.ts
export const runtime = ManagedRuntime.make(
  Layer.mergeAll(TaskRepository.layer, Auth.layer, Cache.layer)
);

// The error channel must be `never`, so a typed error left unmapped fails the
// typecheck instead of becoming a rejected promise at runtime.
export const run = <A>(
  effect: Effect.Effect<
    A,
    never,
    ManagedRuntime.ManagedRuntime.Services<typeof runtime>
  >
) => runtime.runPromise(effect);
```

`runtime.runPromise` accepts `Effect<A, E, R>` for any `E`. An error tag left out of `catchTags` still compiles. At runtime it rejects the promise, and the framework turns it into a generic failure (a 500, or a retried job). `run` accepts only `E = never`, so the compiler names the missing tag:

```
TS2345: Argument of type 'Effect<Response, TaskNotCreated, TaskRepository>' is not
assignable to parameter of type 'Effect<Response, never, Auth | TaskRepository>'.
  Type 'TaskNotCreated' is not assignable to type 'never'.
```

`R` is `ManagedRuntime.Services<typeof runtime>`. So a service missing from `Layer.mergeAll(...)` also fails the typecheck. This does not cover an optional service read with `Effect.serviceOption`: it is not in any requirements type, so leaving it out of `Layer.mergeAll(...)` compiles and silently gives `None`. Only a test against the runtime's exact layer catches that.

## Rule: map every tag to the entrypoint's result type, inside the effect

The effect returns the entrypoint's own result: a `Response` for HTTP, an outcome value for a worker. Do the mapping in `catchTags` before `run`. Why: a `try { await run(...) } catch (e)` after it gets `unknown`, so the tags are lost and nothing checks that every tag is covered.

### HTTP handler

```ts
app.post("/tasks", requireAuth, async (c) => {
  const body = (await c.req.json()) as { title?: unknown }; // cast only; decode validates
  const user = c.get("user");
  return run(
    Effect.gen(function* created() {
      const input = yield* Schema.decodeUnknownEffect(taskCreateSchema)({
        ownerId: user.id,
        title: body.title,
      });
      const repo = yield* TaskRepository;
      return Response.json(yield* repo.create(input), { status: 201 });
    }).pipe(
      Effect.catchTags({
        SchemaError: (e) =>
          Effect.succeed(Response.json({ error: e.message }, { status: 400 })),
        TaskNotCreated: () =>
          Effect.succeed(
            Response.json({ error: "task not created" }, { status: 500 })
          ),
      })
    )
  );
});
```

Session lookup follows the same rule. Middleware gets the session through `run(Effect.gen(... yield* Auth ...))` and stores `user`/`session` (or `null`) for the handlers. A guard rejects anonymous requests with 401.

### Queue or cron worker

```ts
type Outcome = "ack" | "retry" | "dead-letter";

export const handleTaskJob = (payload: unknown): Promise<Outcome> =>
  run(
    Effect.gen(function* job() {
      const input =
        yield* Schema.decodeUnknownEffect(taskCreateSchema)(payload);
      const repo = yield* TaskRepository;
      yield* repo.create(input);
      return "ack" as const;
    }).pipe(
      Effect.catchTags({
        SchemaError: () => Effect.succeed("dead-letter" as const),
        // TaskNotCreated wraps every insert failure: a transient DB error, but also an
        // FK violation that fails again on each retry. Split the tag if the difference matters.
        TaskNotCreated: () => Effect.succeed("retry" as const),
      })
    )
  );
```

The adapter for the queue library turns `Outcome` into its own ack, nack or retry call. As a guide: a validation or domain error will fail again on retry, so dead-letter it. An infrastructure error (`UnknownError`, a DB failure) is often transient, so retry it. The exact retry rules belong to the queue library, not to this pattern.

## `Effect.tryPromise` without `catch` produces `UnknownError`

`Effect.tryPromise(() => promise)` fails with `UnknownError` (tag `"UnknownError"`). Because `run` requires `E = never`, every entrypoint that reaches such a call must handle it. Choose one:

- Map `UnknownError` in the entrypoint's `catchTags` to a 500 or `retry`. This is enough when the caller treats every failure the same way.
- Give the repository call a `catch` that returns a domain `Data.TaggedError`. `TaskRepository` does this for every method, so its entrypoints never see `UnknownError`.

## What `run` does not cover

The type system tracks only typed failures. Defects (thrown exceptions, rejections inside `Effect.promise`) and interruption still reject the promise. Let them reach the entrypoint's own error hook: Hono `app.onError`, Express error middleware, or the worker's top-level catch, which marks the job as retry. Don't handle defects inside `run` as well. Why: every framework already has one crash handler, and a second one in `run` gives two places to change for the same behaviour. If you have no framework hook, build `run` on `runtime.runPromiseExit`. After `run` has forced all typed errors to be handled, an `Exit.Failure` holds only a defect or an interruption.
