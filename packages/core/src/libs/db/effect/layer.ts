import { drizzle } from "drizzle-orm/node-postgres";
import * as Context from "effect/Context";
import * as Layer from "effect/Layer";

import { authRelations } from "../../auth/auth-schema";
import { db } from "../client";
import type { Database } from "../client";

// Effect-facing handle for the module-level `db` singleton. The layer hands out the
// same instance non-Effect code imports directly, so both share one pg.Pool.
export class Db extends Context.Service<Db, Database>()("Db") {
  static readonly layer = Layer.succeed(this, db);
}

// Query-builder only: `.toSQL()` works, but executing a query throws and `$client` is a
// placeholder string, hence the `unknown` hop. Use for layers that never hit the DB.
// Standalone named export (not a static on `Db`) so bundlers can tree-shake it.
export const dbMockLayer = /* @__PURE__ */ Layer.sync(
  Db,
  () => drizzle.mock({ relations: authRelations }) as unknown as Database,
);
