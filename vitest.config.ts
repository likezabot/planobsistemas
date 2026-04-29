import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    testTimeout: 20000,
    hookTimeout: 30000,
    // Bloco D: serializa execução para evitar contention no Supabase Auth Admin
    // (rate limits locais de createUser/signIn quando vários arquivos E2E rodam em paralelo).
    // Não é uma gambiarra: cada arquivo já compartilha fixtures/usuários em beforeAll.
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
