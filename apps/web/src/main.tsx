import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./auth";
import { ToastProvider } from "./components/Toast";
import { LocaleProvider } from "./i18n";
import "@fontsource/open-sans/latin-400.css";
import "@fontsource/open-sans/vietnamese-400.css";
import "@fontsource/open-sans/latin-500.css";
import "@fontsource/open-sans/vietnamese-500.css";
import "@fontsource/open-sans/latin-600.css";
import "@fontsource/open-sans/vietnamese-600.css";
import "@fontsource/open-sans/latin-700.css";
import "@fontsource/open-sans/vietnamese-700.css";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <LocaleProvider>
        <ToastProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastProvider>
      </LocaleProvider>
    </BrowserRouter>
  </StrictMode>
);
