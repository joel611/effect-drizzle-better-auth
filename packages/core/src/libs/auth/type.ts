import type { AuthInstance } from "./auth";

// `{ session, user }` as returned by `auth.api.getSession`, inferred from this
// instance's options so plugin fields show up automatically.
export type Session = AuthInstance["$Infer"]["Session"];
