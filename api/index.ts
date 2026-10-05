import "dotenv/config";
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { createContext } from "../server/_core/context.js";
import { appRouter } from "../server/routers.js";
import { firebaseIdTokenFromAuthorization, runWithFirebaseIdToken } from "../server/firebase.js";

const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
const trpcHandler = createExpressMiddleware({ router: appRouter, createContext });
app.use("/", (req, res, next) => runWithFirebaseIdToken(
  firebaseIdTokenFromAuthorization(req.headers.authorization),
  () => trpcHandler(req, res, next),
));

export default app;
