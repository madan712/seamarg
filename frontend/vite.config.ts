import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

const port = process.env.PORT ? Number(process.env.PORT) : 5173;

// Repo root (one level up) holds shared/, consumed by both frontend and mobile.
const repoRoot = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
  define: {
    global: 'globalThis',
  },
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('../shared', import.meta.url)),
    },
  },
  server: {
    port,
    fs: {
      // Allow importing files from the repo root (the shared/ module).
      allow: [repoRoot],
    },
  },
});
