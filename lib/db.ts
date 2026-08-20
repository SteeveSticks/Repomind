import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/db/schema";

declare global {
  var _repomindPool: Pool | undefined;
}

const connectionString =
  process.env.DATABASE_URL ||
  process.env.DATABASE_URL_DIRECT ||
  "postgresql://repomind:repomind@127.0.0.1:5432/repomind";

const pool =
  global._repomindPool ||
  new Pool({
    connectionString,
    max: 10,
  });

if (process.env.NODE_ENV !== "production") {
  global._repomindPool = pool;
}

export const db = drizzle(pool, { schema });
export { pool };
