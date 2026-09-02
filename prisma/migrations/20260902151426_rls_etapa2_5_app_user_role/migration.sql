-- RLS Pilar 2, Etapa 2.5 — Passo A.
--
-- Cria a role de conexão da aplicação (`app_user`) SEM o atributo BYPASSRLS
-- que a role `postgres` (usada hoje em DATABASE_URL/DIRECT_URL) tem. Sem
-- isso, qualquer policy de RLS das Etapas 4-6 seria letra morta pra
-- aplicação — BYPASSRLS ignora toda policy, sem exceção.
--
-- Esta migration SOZINHA não muda nenhum comportamento em produção: cria a
-- role e concede os grants, mas a aplicação continua conectando como
-- `postgres` até o `DATABASE_URL` da Vercel ser trocado à parte (Passo B,
-- deploy separado, com checagem funcional própria).
--
-- Validado antes desta migration: mesmo bloco aplicado localmente (Docker)
-- e num projeto Supabase de staging (schema idêntico, 90 tabelas, pooler em
-- modo transação) — suíte de integração completa (374 testes) verde nos
-- dois ambientes como `app_user`, sem nenhum "permission denied".

-- Senha real NÃO fica neste arquivo (nunca comitar credencial de produção
-- com acesso de escrita a toda tabela) — criada sem login utilizável aqui;
-- a senha de verdade é setada à parte, fora do controle de versão, e vive
-- só na variável de ambiente da Vercel (Passo B).
CREATE ROLE app_user NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;

GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;

-- Cobre tabelas/sequences de migrations FUTURAS sem precisar de um grant
-- manual a cada uma — todas as migrations de produção rodam como `postgres`
-- (via DIRECT_URL), então é a role de referência aqui.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_user;
