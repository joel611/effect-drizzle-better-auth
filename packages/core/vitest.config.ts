import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: {
      BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-00",
      BETTER_AUTH_URL: "http://localhost:3000",
    },
  },
});
