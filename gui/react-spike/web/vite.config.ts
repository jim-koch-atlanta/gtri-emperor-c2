// THROWAWAY AI-GENERATED EXPLORATION — proves the API seam; not the submission.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    // The repo lives on /mnt/c (Windows drvfs). inotify does NOT fire there under
    // WSL2, so Vite's watcher misses edits and serves stale transforms. Polling is
    // the standard fix for a project mounted on the Windows filesystem.
    watch: { usePolling: true, interval: 200 },
  },
});

