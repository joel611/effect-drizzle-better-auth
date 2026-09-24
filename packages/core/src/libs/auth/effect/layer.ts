import * as Context from "effect/Context";
import * as Layer from "effect/Layer";

import { auth } from "../auth";
import type { AuthInstance } from "../auth";

// Effect-facing handle for the module-level `auth` singleton, which is itself built on the
// `db` singleton, so Effect and non-Effect callers share one Better Auth instance and pg.Pool.
export class Auth extends Context.Service<Auth, AuthInstance>()("Auth") {
  static readonly layer = Layer.succeed(this, auth);
}
