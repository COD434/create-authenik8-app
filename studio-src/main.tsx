import React from "react";
import { createRoot } from "react-dom/client";
import { Theme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";

import "@astryxdesign/core/reset.css";
import "@astryxdesign/core/astryx.css";
import "@astryxdesign/theme-neutral/theme.css";
import "./styles.css";

import { App } from "./App.js";

const root = document.querySelector<HTMLDivElement>("#root");
if (!root) throw new Error("Authenik8 Studio could not find its application root.");

createRoot(root).render(
  <React.StrictMode>
    <Theme theme={neutralTheme} mode="dark">
      <App />
    </Theme>
  </React.StrictMode>,
);
