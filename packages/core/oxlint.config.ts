import { strict } from "@effect/tsgo/oxlint-presets";
import { defineConfig } from "oxlint";

import baseConfig from "../../oxlint.config.ts";

export default defineConfig({
  extends: [baseConfig, strict],
  ignorePatterns: ["src/libs/auth/auth-schema.ts", "drizzle/**"],
  rules: {
    "no-inline-comments": [
      "error",
      {
        ignorePattern: "@__PURE__",
      },
    ],
  },
});
