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
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/](react|react-dom|scheduler|react-router)[\\/]/.test(id)) return 'react';
          if (id.includes('@supabase')) return 'supabase';
          if (id.includes('@radix-ui')) return 'radix';
          if (/[\\/](zod|decimal\.js|react-hook-form|@hookform)[\\/]/.test(id)) return 'forms';
          if (id.includes('@tanstack')) return 'tanstack';
          return 'vendor';
        },
      },
    },
  },
};
