import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type UserConfig } from 'vite';

/** Refuse to serve or build when a privileged Supabase key is configured for the browser. */
function assertPublicKey(mode: string) {
  const key = loadEnv(mode, '../..', 'VITE_').VITE_SUPABASE_ANON_KEY ?? '';
  let role: unknown;
  try {
    role = JSON.parse(Buffer.from(key.split('.')[1] ?? '', 'base64url').toString()).role;
  } catch {
    role = undefined;
  }
  if (key.startsWith('sb_secret_') || role === 'service_role') {
    throw new Error(
      'VITE_SUPABASE_ANON_KEY holds the service_role/secret key, which would be published in the browser bundle. ' +
        'Use the anon/publishable key (Supabase → Project Settings → API Keys).',
    );
  }
}

export default defineConfig(({ mode }) => {
  assertPublicKey(mode);
  return config;
});

const config: UserConfig = {
  plugins: [react(), tailwindcss()],
  // One .env at the repo root serves both apps; only VITE_* variables reach the browser.
  envDir: '../..',
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    // The API runs separately in development; requests to /api are forwarded to it.
    proxy: { '/api': { target: 'http://localhost:4000', changeOrigin: true } },
  },
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        // Long-lived vendor chunks so application updates don't invalidate library caches.
        // Every chunk here may depend on `react`, and `react` on nothing: a chunk that
        // both imports and is imported by another builds a cycle, and circular ESM
        // chunks fail at run time with "Cannot access 'x' before initialization".
        // react-router therefore stays out of the react chunk — it pulls in `cookie`
        // and `set-cookie-parser`, which would make react depend on vendor.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          // Anchored on node_modules: a bare /react-dom/ also matches nested packages
          // such as @floating-ui/react-dom, whose own dependency stays in `vendor`.
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react';
          if (id.includes('@supabase')) return 'supabase';
          if (id.includes('@radix-ui')) return 'radix';
          if (/[\\/](zod|decimal\.js|react-hook-form|@hookform)[\\/]/.test(id)) return 'forms';
          if (id.includes('@tanstack')) return 'tanstack';
          // Heavy libraries only some pages use get chunks of their own, so they are not
          // part of `vendor`, which every page (the sign-in page included) loads up front.
          // They depend on react/vendor, never the other way round, so no cycle forms.
          if (/[\\/]node_modules[\\/](recharts|recharts-scale|react-smooth|victory-vendor|d3-[a-z-]+|internmap|decimal\.js-light)[\\/]/.test(id)) return 'charts';
          if (/[\\/]node_modules[\\/](pdf-lib|@pdf-lib[\\/][a-z-]+|pako)[\\/]/.test(id)) return 'pdf';
          if (/[\\/]node_modules[\\/](write-excel-file|read-excel-file|fflate|jszip|xlsx)[\\/]/.test(id)) return 'excel';
          return 'vendor';
        },
      },
    },
  },
};
