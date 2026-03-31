import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AppStateProvider } from "./providers/AppStateProvider";
import { WalletProvider } from "./providers/WalletProvider";
import "./styles/index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppStateProvider>
        <WalletProvider>
          <App />
        </WalletProvider>
      </AppStateProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
