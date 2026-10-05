import { Data } from "effect";

import type { TaskId } from "./validation-schema";

export class TaskNotFound extends Data.TaggedError("TaskNotFound")<{
  readonly id: TaskId;
}> {}

export class TaskNotCreated extends Data.TaggedError("TaskNotCreated")<{
  readonly cause?: unknown;
}> {}

export class TaskNotListed extends Data.TaggedError("TaskNotListed")<{
  readonly cause: unknown;
}> {}

export class TaskNotUpdated extends Data.TaggedError("TaskNotUpdated")<{
  readonly cause: unknown;
}> {}
