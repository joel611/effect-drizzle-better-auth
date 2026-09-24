import { Schema } from "effect";

export const TaskId = Schema.Number.pipe(Schema.brand("TaskId"));
export type TaskIdType = Schema.Schema.Type<typeof TaskId>;

export const Task = Schema.Struct({
  id: TaskId,
  title: Schema.String,
});
