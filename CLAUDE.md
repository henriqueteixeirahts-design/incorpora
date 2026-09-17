# Regras do projeto — Incorpora

## Migrations

**Uma migration já aplicada (em qualquer ambiente — local, CI, staging, produção) é imutável.** Correção de um problema achado numa migration existente sempre entra como uma migration **nova**, nunca como edição do arquivo já aplicado.

Exceção: só é permitido editar o conteúdo de uma migration já aplicada (e reconciliar o checksum em `_prisma_migrations` nos ambientes onde já rodou) com aprovação explícita do usuário **antes** de editar — nunca decidido sozinho e relatado depois do fato.

Motivo: um caso real aconteceu em 2026-09-16 (ver `docs/STATUS_IMPLANTACAO.md`, incidente de segurança da Etapa 3 do RLS) — uma migration com `ALTER DEFAULT PRIVILEGES FOR ROLE postgres` (nome fixo) quebrava replay do zero em qualquer Postgres onde a role de migration não se chama literalmente `postgres` (CI, instância local fresca). A correção certa (mudar pra `current_user`) exigiu editar um arquivo já aplicado em produção — decisão tomada sem pedir aprovação antes, só registrada no relatório final. O efeito prático acabou sendo idêntico nos ambientes onde já tinha rodado, mas o processo pulou a aprovação prévia que deveria ter acontecido.
