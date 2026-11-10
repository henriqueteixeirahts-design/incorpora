# Regras do projeto — Incorpora

## Migrations

**Uma migration já aplicada (em qualquer ambiente — local, CI, staging, produção) é imutável.** Correção de um problema achado numa migration existente sempre entra como uma migration **nova**, nunca como edição do arquivo já aplicado.

Exceção: só é permitido editar o conteúdo de uma migration já aplicada (e reconciliar o checksum em `_prisma_migrations` nos ambientes onde já rodou) com aprovação explícita do usuário **antes** de editar — nunca decidido sozinho e relatado depois do fato.

Motivo: um caso real aconteceu em 2026-09-16 (ver `docs/STATUS_IMPLANTACAO.md`, incidente de segurança da Etapa 3 do RLS) — uma migration com `ALTER DEFAULT PRIVILEGES FOR ROLE postgres` (nome fixo) quebrava replay do zero em qualquer Postgres onde a role de migration não se chama literalmente `postgres` (CI, instância local fresca). A correção certa (mudar pra `current_user`) exigiu editar um arquivo já aplicado em produção — decisão tomada sem pedir aprovação antes, só registrada no relatório final. O efeito prático acabou sendo idêntico nos ambientes onde já tinha rodado, mas o processo pulou a aprovação prévia que deveria ter acontecido.

## Provas e controle negativo

**Toda verificação que serve de prova precisa de controle negativo documentado: plantar a violação de propósito, mostrar a verificação falhando, desfazer. Teste que nunca falhou não conta como prova.** Vale para teste automatizado, trava de CI, checagem de auditoria e consulta de conferência em produção. O registro (o que foi plantado, o que falhou, a saída) vai no commit ou no `docs/STATUS_IMPLANTACAO.md`. Trava sem controle negativo registrado é tratada como inexistente.

Também vale o inverso: um teste que passa nos dois cenários (com e sem a proteção que ele diz provar) não prova a proteção. Ex.: com RLS ligado, um teste de isolamento passa mesmo sem o filtro da aplicação — por isso o job `test` (sem RLS) prova o Pilar 1 e o `test-rls` prova o Pilar 2, e nenhum dos dois pode ser removido como redundante.

Motivo: na fase de segurança (set–nov/2026) foram **quatro** testes verdes que não testavam nada, e **nenhum** foi achado lendo código — todos apareceram quando se plantou um erro de propósito:
1. CI conectando como superusuário (set/2026) — todo teste de RLS daria verde, porque superusuário ignora RLS.
2. Auditoria V3 comparando grandezas diferentes (valor corrigido sem multa/mora contra o valor final gravado).
3. Teste de ambiente que pulava em silêncio (no Postgres puro não havia as roles do Supabase; as travas "nenhuma role consegue X" passavam vazias).
4. Duas checagens de vazamento entre organizações vazias desde sempre (procuravam a linha errada; passavam mesmo com o filtro da aplicação removido) — 2026-11-10.
Detalhes em `docs/STATUS_IMPLANTACAO.md`.
