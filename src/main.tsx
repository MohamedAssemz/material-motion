import { createRoot } from "react-dom/client";
import { LanguageProvider } from "@/contexts/LanguageContext";
import App from "@/App";
import "./index.css";

const root = document.getElementById("root")!;

createRoot(root).render(
  <LanguageProvider>
    <App />
  </LanguageProvider>
);
