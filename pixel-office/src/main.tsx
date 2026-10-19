import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { reportError } from "./ui/ErrorBar";
import { App } from "./App";
import "./styles.css";
import { applySize, readSize } from "./ui/textSize";

// The saved text size, before the first paint.
applySize(readSize());

const queryClient = new QueryClient({
  // Any button that fails (hire, answer, connect…) shows a sticky error, not just a fading toast.
  mutationCache: new MutationCache({ onError: (e) => reportError((e as Error).message) }),
  defaultOptions: { queries: { staleTime: 5_000, retry: 1, refetchOnWindowFocus: true } },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
