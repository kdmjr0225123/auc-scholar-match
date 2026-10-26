import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initAnalytics } from "./lib/analytics";
import { initMonitoring } from "./lib/monitoring";

initMonitoring();
initAnalytics();

createRoot(document.getElementById("root")!).render(<App />);
