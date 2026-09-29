# Validating input with Drizzle-derived Effect schemas

Derive request schemas from the Drizzle table, with `drizzle-orm/effect-schema`, and decode untrusted input at the entrypoint. The repository receives typed data.

## Derive, don't hand-write

```ts
// <feature>/validation-schema.ts
import { Schema, Struct } from "effect";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/effect-schema";

import { task } from "./schema.ts";

export const TaskId = Schema.Int.pipe(Schema.brand("TaskId"));
export type TaskId = typeof TaskId.Type;

// id and createdAt are DB-generated, so callers never supply them.
export const taskCreateSchema = createInsertSchema(task, {
  title: (s) => s.check(Schema.isNonEmpty()),
}).mapFields(Struct.omit(["id", "createdAt"]));
export type TaskCreateInput = typeof taskCreateSchema.Type;

// id, ownerId and createdAt are fixed after insert.
export const taskUpdateSchema = createUpdateSchema(task, {
  title: (s) => s.check(Schema.isNonEmpty()),
}).mapFields(Struct.omit(["id", "ownerId", "createdAt"]));
export type TaskUpdateInput = typeof taskUpdateSchema.Type;

export const taskSelectSchema = createSelectSchema(task, { id: TaskId });
```

- Why derive: column types, nullability and defaults come from the table. So a migration that changes a column also changes the schema, and nothing drifts apart.
- Refinements go in the second argument (`title: (s) => s.check(...)`). Rules the database doesn't express, such as "non-empty", live here.
- Use `.mapFields(Struct.omit([...]))` to remove fields the caller must not set. That means generated columns on create, and immutable columns (`id`, `ownerId`, `createdAt`) on update. Why: without it, a client could set `ownerId` or `id` in the request body.
- Brand the id. Give the table column `$type<TaskId>()` (`serial("id").$type<TaskId>().primaryKey()`) and override it in `createSelectSchema`. Why: repository signatures like `update(id: TaskId, ...)` then refuse a raw `number` that was never decoded. `schema.ts` imports only the `TaskId` type, so there is no runtime import cycle.

## Decode at the boundary

```ts
const id = yield* Schema.decodeUnknownEffect(TaskId)(Number(c.req.param("id")));
const input = yield* Schema.decodeUnknownEffect(taskUpdateSchema)(body);
if (Object.keys(input).length === 0) {
  return Response.json({ error: "no fields to update" }, { status: 400 });
}
```

- Decode in the entrypoint effect, and map `SchemaError` to 400 (or dead-letter in a worker). Why: the entrypoint knows the transport and owns the status code. The repository stays about persistence, and its input type says "already validated".
- Server-owned values, such as `ownerId: user.id` from the session, go into the object being decoded. They never come from the body.
- Every field in an update schema is optional, so `{}` decodes successfully. Reject an empty update explicitly.
- Leave a comment on each repository method that takes decoded input: `// Callers must decode with taskCreateSchema first; no validation here.`

## Test the schemas

Unit-test each schema without a database: a valid create input is accepted, an empty title is rejected, DB-generated fields (`id`, `createdAt`) are dropped from create input, fields fixed after insert (`ownerId`) are dropped from update input, and a non-integer id is rejected. Testing the schema directly is faster and clearer than testing it through an HTTP round-trip.
