import { Auth } from "auth";
import { TaskRepository } from "core";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";

export const runtime = ManagedRuntime.make(
  Layer.mergeAll(TaskRepository.layer, Auth.layer)
);
