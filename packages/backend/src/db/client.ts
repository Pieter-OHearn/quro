import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL || "postgres://quro:quro@127.0.0.1:5432/quro";
const queryClient = postgres(connectionString);
export const db = drizzle(queryClient, { schema });
