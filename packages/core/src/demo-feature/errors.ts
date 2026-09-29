import * as Data from "effect/Data";

import type { TaskId } from "./validation-schema";

export class TaskNotFound extends Data.TaggedError("TaskNotFound")<{
  readonly id: TaskId;
}> {}

export class TaskNotCreated extends Data.TaggedError("TaskNotCreated")<{
  readonly cause?: unknown;
}> {}
