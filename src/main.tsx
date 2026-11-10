import "./index.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "sonner";
import { ConfirmProvider } from "@/components/ui/overlays";
import { ChemActionsProvider } from "@/components/chem/ChemActions";
import { App } from "./App";

if (import.meta.env.MODE === "static") (await import("./static/install")).installStaticApi();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15_000, refetchOnWindowFocus: false, retry: 1 },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ConfirmProvider>
          <ChemActionsProvider>
            <App />
          </ChemActionsProvider>
        </ConfirmProvider>
      </BrowserRouter>
      <Toaster
        position="top-center"
        offset={16}
        toastOptions={{
          classNames: {
            toast: "!rounded-[28px] !border-0 !bg-ink !text-white !shadow-[var(--shadow-4)] !font-sans !px-5 !py-3.5 !text-sm !font-semibold",
            description: "!text-white/65 !font-medium",
            actionButton: "!rounded-full !bg-transparent !text-lavender !font-bold !text-sm",
            cancelButton: "!rounded-full !bg-white/10 !text-white",
          },
        }}
      />
    </QueryClientProvider>
  </StrictMode>,
);
