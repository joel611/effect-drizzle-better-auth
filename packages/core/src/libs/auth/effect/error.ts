import * as Data from "effect/Data";

export class AuthError extends Data.TaggedError("AuthError")<{
  readonly cause: unknown;
}> {}
