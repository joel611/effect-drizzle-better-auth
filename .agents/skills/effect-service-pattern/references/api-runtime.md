# Running effects in API handlers

## Always run handler effects through `run`, never `runtime.runPromise`

`apps/api/src/effect-runtime.ts` exports `run` next to `runtime`:

```ts
export const run = <A>(
  effect: Effect.Effect<
    A,
    never,
    ManagedRuntime.ManagedRuntime.Services<typeof runtime>
  >
) => runtime.runPromise(effect);
```

`runtime.runPromise` accepts `Effect<A, E, R>` for any `E`. An error left out of `catchTags` still compiles. At runtime it rejects the promise, and Hono turns it into a default 500. `run` only accepts `E = never`, so every typed error must be handled before the handler returns. A missing tag becomes a compile error that names the tag:

```
TS2345: Argument of type 'Effect<Response, TaskNotCreated, TaskRepository>' is not
assignable to parameter of type 'Effect<Response, never, Auth | TaskRepository>'.
  Type 'TaskNotCreated' is not assignable to type 'never'.
```

`R` is `ManagedRuntime.Services<typeof runtime>`, so a service that is missing from the `Layer.mergeAll(...)` in `effect-runtime.ts` also fails the typecheck.

## Handler shape

Map every error tag to a `Response` inside the effect. Return the `Response` from the effect, not after `run`:

```ts
taskRoutes.post("/", requireAuth, async (c) => {
  const body = (await c.req.json()) as { title?: unknown };
  return run(
    Effect.gen(function* created() {
      const input = yield* Schema.decodeUnknownEffect(taskCreateSchema)({ ... });
      const repo = yield* TaskRepository;
      return Response.json(yield* repo.create(input), { status: 201 });
    }).pipe(
      Effect.catchTags({
        SchemaError: (e) => Effect.succeed(Response.json({ error: e.message }, { status: 400 })),
        TaskNotCreated: () => Effect.succeed(Response.json({ error: "task not created" }, { status: 500 })),
      })
    )
  );
});
```

## `Effect.tryPromise` without `catch` produces `UnknownError`

The bare form `Effect.tryPromise(() => promise)` fails with `UnknownError` (tag `"UnknownError"`). `run` makes this visible: a route that calls a repository method built on the bare form must handle `UnknownError`. There are two fixes:

- Handle `UnknownError` in the route's `catchTags` and map it to a 500.
- Give the repository call a `catch` that returns a domain `Data.TaggedError`. `TaskRepository` does this for every method (`TaskNotCreated`, `TaskNotListed`, `TaskNotUpdated`), so its routes never see `UnknownError`.

## What `run` does not cover

The type system tracks only typed failures. Defects (thrown exceptions, rejections inside `Effect.promise`) and interruption still reject the promise. To turn them into a controlled response, build `run` on `runtime.runPromiseExit`. It resolves to an `Exit` and never rejects. After `run` has forced all typed errors to be handled, an `Exit.Failure` can only hold a defect or an interruption. Map it to a 500. A Hono `app.onError` also works.
