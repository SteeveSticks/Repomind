import { defineConfig } from "drizzle-kit";

const url =
  process.env.DATABASE_URL_DIRECT ??
  "postgresql://repomind:repomind@127.0.0.1:5432/repomind";

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: { url },
});
