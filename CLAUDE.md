Node.js is the only runtime. Bun is the package manager and bundler, for developer experience only. Never run app or test code on the Bun runtime.

## Bun: package manager and bundler only

- Use `bun install` / `bun add` instead of `npm install`, `yarn` or `pnpm`.
- Use `bun run <script>` to run package scripts, and `bunx <package>` instead of `npx`.
- Use `bun build --target=node` to bundle apps. Run the output with `node`.
- Don't use Bun runtime APIs: no `Bun.serve`, `Bun.file`, `Bun.sql`, `Bun.redis`, `Bun.$`, `bun:sqlite` or `bun:test`. Use Node built-ins (`node:fs`, `node:child_process`, ...) or npm packages.
- Don't run code with `bun <file>` or `bun --hot`. Use `node`.
- Types come from `@types/node`, not `@types/bun`.

## Runtime: Node.js

- `.env` is not loaded automatically. Pass it with `node --env-file-if-exists=<path>`.
- Postgres goes through `pg` (see `docs/adr/`).

## API: Hono

`apps/api` is a Hono app served on Node by `@hono/node-server`. Don't use `express`.

- In `apps/api`, `bun run build` bundles `src/index.ts` (including workspace packages such as `core`) to `dist/` with `bun build --target=node`.
- `bun run start` runs `node dist/index.js`.
- `bun run dev` rebuilds with `bun build --watch` and restarts with `node --watch`.

```ts
import { serve } from "@hono/node-server";
import { Hono } from "hono";

const app = new Hono();
app.get("/tasks", (c) => c.json([]));

serve({ fetch: app.fetch, port: 3000 });
```

## Testing

Use `vitest` for tests (it runs on Node). Don't use `bun test`.
