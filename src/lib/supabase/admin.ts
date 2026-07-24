import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Client com service_role — só pode ser usado em código server-only
 * (server actions, route handlers). Ignora RLS e pode administrar usuários
 * (convites, exclusão). Nunca importar em componentes de cliente.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
