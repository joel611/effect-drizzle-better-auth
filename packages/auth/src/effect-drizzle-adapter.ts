import type { BetterAuthOptions } from "better-auth";
import { createAdapterFactory } from "better-auth/adapters";
import type { CustomAdapter } from "better-auth/adapters";
import { account, session, user, verification } from "db";
import type { Db } from "db";
import { count as countRows, asc, desc, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import * as Effect from "effect/Effect";

import { columnOf, whereClause } from "./where";

/** Runs an Effect from promise-land; the Promise boundary Better Auth sits behind. */
export type Run = <A, E>(effect: Effect.Effect<A, E>) => Promise<A>;

export type Executor = Pick<
  Db["Service"],
  "delete" | "insert" | "select" | "update"
>;

const tables: Record<string, unknown> = {
  account,
  session,
  user,
  verification,
};

const tableOf = (model: string): PgTable => {
  const table = tables[model];
  if (!is(table, PgTable)) {
    throw new Error(`Unknown auth model "${model}"`);
  }
  return table;
};

const columnsOf = (table: PgTable, fields: string[]) =>
  Object.fromEntries(
    fields.map((field) => [
      field,
      (table as unknown as Record<string, unknown>)[field],
    ])
  );

const customAdapter = (executor: Executor, run: Run) => (): CustomAdapter => ({
  async count({ model, where }) {
    const table = tableOf(model);
    const rows = await run(
      executor
        .select({ count: countRows() })
        .from(table)
        .where(whereClause(table, where))
    );
    return rows[0]?.count ?? 0;
  },
  async create({ model, data }) {
    const table = tableOf(model);
    const [row] = await run(executor.insert(table).values(data).returning());
    return row as typeof data;
  },
  async delete({ model, where }) {
    const table = tableOf(model);
    await run(executor.delete(table).where(whereClause(table, where)));
  },
  async deleteMany({ model, where }) {
    const table = tableOf(model);
    const rows = await run(
      executor.delete(table).where(whereClause(table, where)).returning()
    );
    return (rows as unknown[]).length;
  },
  async findMany({ model, where, limit, offset, select, sortBy }) {
    const table = tableOf(model);
    const base = select?.length
      ? executor.select(columnsOf(table, select) as never)
      : executor.select();
    let query = base
      .from(table)
      .where(whereClause(table, where))
      .limit(limit)
      .$dynamic();
    if (offset !== undefined) {
      query = query.offset(offset);
    }
    if (sortBy) {
      const column = columnOf(table, sortBy.field);
      query = query.orderBy(
        sortBy.direction === "desc" ? desc(column) : asc(column)
      );
    }
    return (await run(query)) as never;
  },
  async findOne({ model, where, select }) {
    const table = tableOf(model);
    const base = select?.length
      ? executor.select(columnsOf(table, select) as never)
      : executor.select();
    const rows = await run(
      base.from(table).where(whereClause(table, where)).limit(1)
    );
    return (rows[0] ?? null) as never;
  },
  async update({ model, where, update }) {
    const table = tableOf(model);
    const [row] = await run(
      executor
        .update(table)
        .set(update as Record<string, unknown>)
        .where(whereClause(table, where))
        .returning()
    );
    return (row ?? null) as never;
  },
  async updateMany({ model, where, update }) {
    const table = tableOf(model);
    const rows = await run(
      executor
        .update(table)
        .set(update)
        .where(whereClause(table, where))
        .returning()
    );
    return rows.length;
  },
});

type Database = (
  options: BetterAuthOptions
) => ReturnType<ReturnType<typeof createAdapterFactory>>;

/**
 * Builds Better Auth's `database` option on top of an Effect-flavoured Drizzle
 * executor. `run` is how promise-land re-enters Effect-land, always with the
 * services captured by whoever built this adapter.
 */
export const makeDatabase = (db: Db["Service"], run: Run): Database => {
  let lazyOptions: BetterAuthOptions | null = null;
  const factory = createAdapterFactory({
    adapter: customAdapter(db, run),
    config: {
      adapterId: "effect-drizzle",
      adapterName: "Effect Drizzle Adapter",
      customTransformOutput: ({ data, fieldAttributes }) =>
        fieldAttributes.type === "date" && data !== null && data !== undefined
          ? new Date(data)
          : data,
      supportsArrays: true,
      supportsJSON: true,
      supportsUUIDs: true,
      transaction: (body) =>
        run(
          db.transaction((tx) =>
            Effect.gen(function* inTransaction() {
              const services = yield* Effect.context<never>();
              const txRun: Run = (effect) =>
                Effect.runPromiseWith(services)(effect);
              const txFactory = createAdapterFactory({
                adapter: customAdapter(tx, txRun),
                config: {
                  adapterId: "effect-drizzle",
                  adapterName: "Effect Drizzle Adapter",
                  supportsArrays: true,
                  supportsJSON: true,
                  supportsUUIDs: true,
                  transaction: false,
                },
              });
              return yield* Effect.tryPromise({
                catch: (error) => error,
                try: () => body(txFactory(lazyOptions as BetterAuthOptions)),
              });
            })
          )
        ),
    },
  });
  return (options) => {
    lazyOptions = options;
    return factory(options);
  };
};
