export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  firebaseDatabaseUrl: process.env.FIREBASE_DATABASE_URL ?? process.env.VITE_FIREBASE_DATABASE_URL ?? "",
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID ?? process.env.VITE_FIREBASE_PROJECT_ID ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
};
