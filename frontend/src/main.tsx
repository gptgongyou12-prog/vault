// ResizeObserver polyfill for Safari < 13.1 (e.g. iPhone 5c iOS 10)
if (typeof window !== "undefined" && !(window as any).ResizeObserver) {
  (window as any).ResizeObserver = class {
    constructor(_cb: unknown) {}
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import * as TanStackQueryProvider from "./integrations/tanstack-query/root-provider.tsx";
import { AuthProvider } from "./contexts/AuthContext";
import { AudioPlayerProvider } from "./contexts/AudioPlayerContext";
import { setupVaultCore } from "./lib/vaultCore";
import { ThemeProvider } from "./contexts/ThemeContext";
import { routeTree } from "./routeTree.gen";
import "./styles.css";

const TanStackQueryProviderContext = TanStackQueryProvider.getContext();
const router = createRouter({
  routeTree,
  context: {
    ...TanStackQueryProviderContext,
  },
  defaultPreload: "intent",
  scrollRestoration: true,
  defaultStructuralSharing: true,
  defaultPreloadStaleTime: 0,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById("app");
if (rootElement && !rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  setupVaultCore();

root.render(
    <StrictMode>
      <ThemeProvider>
      <TanStackQueryProvider.Provider {...TanStackQueryProviderContext}>
        <AuthProvider>
          <AudioPlayerProvider>
            <RouterProvider router={router} />
          </AudioPlayerProvider>
        </AuthProvider>
      </TanStackQueryProvider.Provider>
      </ThemeProvider>
    </StrictMode>,
  );
}

// Register service worker for push notifications
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {})
}
