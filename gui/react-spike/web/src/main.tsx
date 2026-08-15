// THROWAWAY AI-GENERATED EXPLORATION — proves the API seam; not the submission.
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

// StrictMode intentionally omitted: its dev-only double-mount creates + removes +
// recreates the imperative MapLibre map instance, which races the async style
// load. The effect cleanup handles it, but for a throwaway demo the simpler,
// quieter single-mount is worth more than the extra dev check.
createRoot(document.getElementById("root")!).render(<App />);
