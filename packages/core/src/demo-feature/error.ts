import * as Data from "effect/Data";

export class TaskCreateValidationError extends Data.TaggedError(
  "TaskCreateValidationError"
)<{
  readonly message: string;
}> {}

export class TaskCreateError extends Data.TaggedError("TaskCreateError")<{
  readonly cause: unknown;
}> {}

export class TaskListError extends Data.TaggedError("TaskListError")<{
  readonly cause: unknown;
}> {}
