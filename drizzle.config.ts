import { defineConfig } from "drizzle-kit";

const connectionString = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("POSTGRES_URL_NON_POOLING or POSTGRES_URL is required to run drizzle commands");
}

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle-pg",
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
  },
});
