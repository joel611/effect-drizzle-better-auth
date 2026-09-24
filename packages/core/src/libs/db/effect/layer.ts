import * as Context from "effect/Context";
import * as Layer from "effect/Layer";

import { db } from "../client";
import type { Database } from "../client";

// Effect-facing handle for the module-level `db` singleton. The layer hands out the
// same instance non-Effect code imports directly, so both share one pg.Pool.
export class Db extends Context.Service<Db, Database>()("Db") {
  static readonly layer = Layer.succeed(this, db);
}
