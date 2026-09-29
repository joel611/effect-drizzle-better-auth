import { Hono } from "hono";

import { authRoutes } from "./routes/auth";
import { taskRoutes } from "./routes/task";

export const app = new Hono()
  .basePath("/api")
  .route("/auth", authRoutes)
  .route("/tasks", taskRoutes);
