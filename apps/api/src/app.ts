import type { AuthType } from "core";
import { Hono } from "hono";

import { authMiddleware } from "./middleware/auth-middleware";
import { authRoutes } from "./routes/auth";
import { taskRoutes } from "./routes/task";

// Context variables shared by every route. `authMiddleware` sets `user` and
// `session` on every request (`null` when anonymous).
export interface AppEnv {
  Variables: AuthType;
}

export const app = new Hono<AppEnv>()
  .basePath("/api")
  .use("*", authMiddleware)
  .route("/auth", authRoutes)
  .route("/tasks", taskRoutes);
