import { defineConfig } from 'tsup';

export default defineConfig({
  // server.ts is the long-running process (`pnpm start`); app.ts is imported by the
  // Vercel function in api/index.js, which must not start a listener.
  entry: ['src/server.ts', 'src/app.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  sourcemap: true,
  clean: true,
  // The shared workspace package ships TypeScript source, so it is bundled in.
  noExternal: ['@tsm/shared'],
});
