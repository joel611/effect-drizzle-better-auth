import { Hono } from "hono";

import { authRoutes } from "./auth";
import { taskRoutes } from "./routes/task";

export const app = new Hono()
  .route("/api/auth", authRoutes)
  .route("/tasks", taskRoutes);
