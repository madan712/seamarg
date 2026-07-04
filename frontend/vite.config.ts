import { defineConfig } from 'vite';

const port = process.env.PORT ? Number(process.env.PORT) : 5173;

export default defineConfig({
  define: {
    global: 'globalThis',
  },
  server: {
    port,
  },
});
