import * as Data from "effect/Data";

export class TaskNotFoundError extends Data.TaggedError("TaskNotFoundError")<{
  readonly id: number;
}> {}

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

export class TaskFindError extends Data.TaggedError("TaskFindError")<{
  readonly cause: unknown;
}> {}

export class TaskUpdateValidationError extends Data.TaggedError(
  "TaskUpdateValidationError"
)<{
  readonly message: string;
}> {}

export class TaskUpdateError extends Data.TaggedError("TaskUpdateError")<{
  readonly cause: unknown;
}> {}

export class TaskDeleteError extends Data.TaggedError("TaskDeleteError")<{
  readonly cause: unknown;
}> {}
