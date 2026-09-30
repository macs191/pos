import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from "@shared/const";
import { firebaseAuth } from "@/lib/firebase";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import "./index.css";

if ("serviceWorker" in navigator && (window.isSecureContext || window.location.hostname === "localhost")) {
  window.addEventListener("load", () => { void navigator.serviceWorker.register("/sw.js"); });
}

const queryClient = new QueryClient();
const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError) || typeof window === "undefined") return;
  if (error.message !== UNAUTHED_ERR_MSG) return;
};
queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    redirectToLoginIfUnauthorized(event.query.state.error);
    console.error("[API Query Error]", event.query.state.error);
  }
});
queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    redirectToLoginIfUnauthorized(event.mutation.state.error);
    console.error("[API Mutation Error]", event.mutation.state.error);
  }
});

const trpcClient = trpc.createClient({
  links: [httpBatchLink({
    url: "/api/trpc",
    transformer: superjson,
    async headers() {
      const token = firebaseAuth?.currentUser ? await firebaseAuth.currentUser.getIdToken() : null;
      return token ? { Authorization: `Bearer ${token}` } : {};
    },
    fetch(input, init) {
      return globalThis.fetch(input, { ...(init ?? {}), credentials: "include" });
    },
  })],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}><App /></QueryClientProvider>
  </trpc.Provider>,
);
