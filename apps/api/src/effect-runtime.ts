import { Auth, TaskService, cacheRedisLayer } from "core";
import { Layer, ManagedRuntime } from "effect";
import type * as Effect from "effect/Effect";

// Cache is provided *to* TaskService (not merged beside it) so its optional
// Effect.serviceOption(Cache) lookup finds it.
export const runtime = ManagedRuntime.make(
  Layer.mergeAll(
    TaskService.layer.pipe(Layer.provide(cacheRedisLayer)),
    Auth.layer
  )
);

// Runs an effect for an HTTP handler. The error channel must be `never`, so a
// typed error left out of `catchTags` fails the typecheck instead of turning
// into a 500 at runtime.
export const run = <A>(
  effect: Effect.Effect<
    A,
    never,
    ManagedRuntime.ManagedRuntime.Services<typeof runtime>
  >
) => runtime.runPromise(effect);
