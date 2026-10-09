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
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(error => {
      console.warn("[PWA] تعذر تسجيل العمل دون اتصال:", error);
    });
  });
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
    async fetch(input, init) {
      const response = await globalThis.fetch(input, { ...(init ?? {}), credentials: "include" });
      const contentType = response.headers.get("content-type") ?? "";
      if (response.ok || contentType.includes("json")) return response;
      const text = await response.text();
      const message = response.status === 404 && text.includes("DEPLOYMENT_NOT_FOUND")
        ? "رابط Vercel الحالي غير موجود أو تم حذفه. افتح رابط الـ Deployment الجديد من Vercel."
        : `تعذر الاتصال بخادم الموقع (HTTP ${response.status}). ${text.slice(0, 180)}`;
      return new Response(JSON.stringify([{ error: { json: { message, code: response.status } } }]), {
        status: response.status,
        headers: { "content-type": "application/json" },
      });
    },
  })],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}><App /></QueryClientProvider>
  </trpc.Provider>,
);
