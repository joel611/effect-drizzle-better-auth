import type { Session } from "core";
import { Hono } from "hono";

import { authRoutes } from "./routes/auth";
import { taskRoutes } from "./routes/task";

// Context variables shared by every route. `user` is set by `requireAuth`.
export interface AppEnv {
  Variables: {
    user: Session["user"];
  };
}

export const app = new Hono<AppEnv>()
  .basePath("/api")
  .route("/auth", authRoutes)
  .route("/tasks", taskRoutes);
