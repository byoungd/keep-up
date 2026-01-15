import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { applyTheme, resolveInitialTheme } from "./app/theme";
import "./styles/globals.css";

applyTheme(resolveInitialTheme());

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root container missing in index.html");
}

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
