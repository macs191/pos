import "dotenv/config";
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { createContext } from "../server/_core/context.js";
import { appRouter } from "../server/routers.js";
import { runWithFirebaseToken } from "../server/firebase.js";

const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use((req, _res, next) => {
  const header = req.headers.authorization;
  const token = typeof header === "string" && header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return next();
  return runWithFirebaseToken(token, next);
});
app.use(
  "/",
  createExpressMiddleware({
    router: appRouter,
    createContext,
  }),
);

export default app;
