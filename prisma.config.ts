import "dotenv/config";
import { defineConfig } from "prisma/config";

// Migrations precisam de conexão direta (não pooled) com o Postgres do Supabase.
// Em runtime, o app usa a connection pooled (DATABASE_URL) via src/lib/prisma.ts.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"],
  },
});
