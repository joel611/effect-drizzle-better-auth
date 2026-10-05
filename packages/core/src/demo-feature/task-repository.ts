import { and, eq } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/effect-schema";
import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Struct from "effect/Struct";

import { Cache } from "../libs/cache";
import { Db, task } from "../libs/db";
import { TaskNotCreated, TaskNotFound, TaskNotListed, TaskNotUpdated } from "./errors";
import { TaskId } from "./validation-schema";
import type { TaskCreateInput, TaskUpdateInput } from "./validation-schema";

type Task = typeof task.$inferSelect;

// `task:` keeps the key apart from Better Auth's `better-auth:` keys on the same Redis
// behind `Cache`.
const LIST_CACHE_KEY = "task:list";
// Backstop for a missed invalidation: a stale list lives at most this long.
const LIST_CACHE_TTL_SECONDS = 60;

// The cached list as a JSON string. `createdAt` is an ISO string on the wire and a `Date`
// after decoding, so a cached list deep-equals the rows `db.select()` returns.
const taskListJson = Schema.fromJsonString(
  Schema.mutable(
    Schema.Array(
      createSelectSchema(task, { id: TaskId }).mapFields(
        Struct.assign({ createdAt: Schema.DateFromString }),
      ),
    ),
  ),
);
const decodeTaskList = Schema.decodeUnknownEffect(taskListJson);
const encodeTaskList = Schema.encodeEffect(taskListJson);

// Runs one cache step in a named span. A failure is logged (a plain miss is not) and becomes
// `None`, so the cache never reaches the error channel.
const cacheStep =
  (name: string) =>
  <A, E>(step: Effect.Effect<A, E>): Effect.Effect<Option.Option<A>> =>
    step.pipe(
      Effect.tapError((cause) =>
        Cause.isNoSuchElementError(cause)
          ? Effect.void
          : Effect.logWarning(`${name} failed`, cause),
      ),
      Effect.option,
      Effect.withSpan(name),
    );

// `read` is typed as the DB row array so a cache hit and a DB read give `list` one type.
interface ListCache {
  readonly invalidate: Effect.Effect<void>;
  readonly read: Effect.Effect<Option.Option<Task[]>>;
  readonly write: (rows: Task[]) => Effect.Effect<void>;
}

// The list cache over an optional `Cache`. With no cache every step is a no-op miss.
const makeListCache = (cache: Option.Option<Cache["Service"]>): ListCache =>
  Option.match(cache, {
    onNone: () => ({
      invalidate: Effect.void,
      read: Effect.succeedNone,
      write: (_rows: Task[]) => Effect.void,
    }),
    onSome: (c) => ({
      invalidate: Effect.asVoid(
        cacheStep("TaskRepository.cache.invalidate")(c.del(LIST_CACHE_KEY)),
      ),
      read: cacheStep("TaskRepository.cache.read")(
        c.get(LIST_CACHE_KEY).pipe(
          // A miss fails with NoSuchElementError, so it ends as `None` without a warning.
          Effect.flatMap((hit) => Effect.fromOption(hit)),
          Effect.flatMap(decodeTaskList),
        ),
      ),
      write: (rows: Task[]) =>
        Effect.asVoid(
          cacheStep("TaskRepository.cache.write")(
            encodeTaskList(rows).pipe(
              Effect.flatMap((json) => c.set(LIST_CACHE_KEY, json, LIST_CACHE_TTL_SECONDS)),
            ),
          ),
        ),
    }),
  });

// Optional: `Cache` is in no requirements type. It is read from the caller's context on each
// call, so the cache is on whenever the runtime's root layer merges `Redis.cacheLayer`.
const currentListCache = Effect.map(Effect.serviceOption(Cache), makeListCache);

export class TaskRepository extends Context.Service<TaskRepository>()("TaskRepository", {
  make: Effect.gen(function* make() {
    const db = yield* Db;

    return {
      // Callers must decode with taskCreateSchema first; no validation here.
      create: Effect.fn("TaskRepository.create")(function* create(data: TaskCreateInput) {
        const [row] = yield* Effect.tryPromise({
          catch: (cause) => new TaskNotCreated({ cause }),
          try: () => db.insert(task).values(data).returning(),
        });
        if (!row) {
          return yield* new TaskNotCreated({});
        }
        yield* (yield* currentListCache).invalidate;
        return row;
      }),
      list: Effect.fn("TaskRepository.list")(function* list() {
        const listCache = yield* currentListCache;
        const cached = yield* listCache.read;
        if (Option.isSome(cached)) {
          return cached.value;
        }
        const rows = yield* Effect.tryPromise({
          catch: (cause) => new TaskNotListed({ cause }),
          try: () => db.select().from(task),
        });
        yield* listCache.write(rows);
        return rows;
      }),
      // Callers must decode with taskUpdateSchema first; no validation here.
      // Scoped to ownerId so a non-owner gets TaskNotFound, same as a missing id.
      update: Effect.fn("TaskRepository.update")(function* update(
        id: TaskId,
        ownerId: string,
        data: TaskUpdateInput,
      ) {
        const [row] = yield* Effect.tryPromise({
          catch: (cause) => new TaskNotUpdated({ cause }),
          try: () =>
            db
              .update(task)
              .set(data)
              .where(and(eq(task.id, id), eq(task.ownerId, ownerId)))
              .returning(),
        });
        if (!row) {
          return yield* new TaskNotFound({ id });
        }
        yield* (yield* currentListCache).invalidate;
        return row;
      }),
    };
  }),
}) {
  static readonly layerNoDeps = Layer.effect(this, this.make);
  static readonly layer = this.layerNoDeps.pipe(Layer.provide(Db.layer));
}
