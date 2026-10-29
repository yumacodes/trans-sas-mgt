import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  sourcemap: true,
  clean: true,
  // The shared workspace package ships TypeScript source, so it is bundled in.
  noExternal: ['@tsm/shared'],
});
