# Naming and layer-placement conventions

## Avoid `*Live` layer naming

This repo doesn't export a bare `XLive` layer constant. Every service is a `Context.Service` class carrying its own static layer fields, so the layer is always reached as `X.layer` / `X.layerNoDeps`, never a free-floating `XLive`.

```ts
// DON'T
const DatabaseLive = Layer.succeed(Database, ...);
```

```ts
// DO
class Database extends Context.Service<Database>()("app/Database", {
  make: Effect.gen(function* () { ... }),
}) {
  static readonly layerNoDeps = Layer.effect(this, this.make);
  static readonly layer = this.layerNoDeps.pipe(Layer.provide(Config.layer));
}
```

## Keep test-only layers out of the service class

Mock/in-memory layers are not static fields on the service class — they live next to the test file that uses them, or in a shared `effect-test-runtime.ts` file if more than one test file needs the same one. See `packages/core/src/libs/auth/__tests__/auth.test.ts`'s locally-built memory layer.

## One `effect-runtime.ts` per consumer app

Each consumer app (e.g. `apps/server`) defines its own `effect-runtime.ts` that owns runtime orchestration — merging every service layer it needs (`Layer.mergeAll(...)`) and providing shared dependency layers. Services themselves never assemble a full app runtime; they only expose `layer`/`layerNoDeps`.
