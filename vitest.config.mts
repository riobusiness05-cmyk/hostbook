import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Signing helpers refuse to run without a secret (no dev fallback), so
    // tests get a throwaway one.
    env: { ADMIN_SESSION_SECRET: "test-only-secret-not-used-anywhere-real" },
  },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
