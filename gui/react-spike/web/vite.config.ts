// AI-ASSISTED EXPLORATION — the web-based C2 vision, a supporting exhibit for
// TECH_SPEC §9; the C++ core + WPF operator_gui are the primary submission.
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
    // Allow importing the mission fixtures from the sibling ../fixtures dir.
    fs: { allow: [".."] },
  },
});

