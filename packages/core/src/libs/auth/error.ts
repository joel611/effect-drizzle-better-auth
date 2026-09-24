import * as Data from "effect/Data";

export class SignUpError extends Data.TaggedError("SignUpError")<{
  readonly cause: unknown;
}> {}

export class SignInError extends Data.TaggedError("SignInError")<{
  readonly cause: unknown;
}> {}

export class GetSessionError extends Data.TaggedError("GetSessionError")<{
  readonly cause: unknown;
}> {}
