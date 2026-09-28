import type { TablesRelationalConfig } from "drizzle-orm";

type MergeTwo<A extends TablesRelationalConfig, B extends TablesRelationalConfig> = {
  [K in keyof A | keyof B]: K extends keyof A
    ? K extends keyof B
      ? {
          name: A[K]["name"];
          relations: A[K]["relations"] & B[K]["relations"];
          table: A[K]["table"];
        }
      : A[K]
    : K extends keyof B
      ? B[K]
      : never;
};

type MergeAll<T extends readonly TablesRelationalConfig[]> = T extends readonly [
  infer Head extends TablesRelationalConfig,
  ...infer Rest extends readonly TablesRelationalConfig[],
]
  ? MergeTwo<Head, MergeAll<Rest>>
  : Record<never, never>;

// Spreading `defineRelationsPart` results (`{ ...a, ...b }`) replaces a table's whole entry,
// so a feature adding `user.tasks` would wipe better-auth's generated `user.sessions`.
// This merges per table instead, letting features extend the generated auth schema.
export const mergeRelations = <const T extends readonly TablesRelationalConfig[]>(
  ...parts: T
): MergeAll<T> => {
  const merged: TablesRelationalConfig = {};
  for (const part of parts) {
    for (const [key, config] of Object.entries(part)) {
      const existing = merged[key];
      if (!existing) {
        merged[key] = config;
        continue;
      }
      for (const name of Object.keys(config.relations)) {
        if (name in existing.relations) {
          throw new Error(`Duplicate relation "${key}.${name}"`);
        }
      }
      merged[key] = { ...existing, relations: { ...existing.relations, ...config.relations } };
    }
  }
  return merged as MergeAll<T>;
};
