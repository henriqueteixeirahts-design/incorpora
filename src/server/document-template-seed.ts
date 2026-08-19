import "server-only";

import { prisma } from "@/lib/prisma";
import { createDocumentTemplate } from "@/server/document-templates";
import { draftTemplateName } from "@/lib/document-template-draft";
import type { AccessContext } from "@/server/auth-context";
import type { DocumentTemplateType } from "@/generated/prisma/client";

/**
 * Biblioteca-padrão de modelos de documento por organização
 * (docs/RELATORIO_TESTDRIVE.md, achado 21; docs/ESPEC_MULTITENANT_FUNDACOES.md,
 * Pilar 4 — "toda organização nasce com uma biblioteca-padrão clonável").
 *
 * Contrato de compra e venda: clonado do modelo real que a TSH validou em
 * produção (gerou o CT-2026-0001) — passado explicitamente por quem chama
 * (`salesContractContent`), não hardcoded aqui, porque este arquivo não tem
 * acesso ao banco de produção pra buscar o texto real.
 *
 * Cessão/Distrato/Extrato: a TSH não tinha modelo real cadastrado pra esses
 * três — os rascunhos abaixo nascem ATIVOS (decisão do PO), usando só as
 * variáveis garantidas pelo próprio fluxo que os gera (nunca ficam com
 * lacuna por dado ausente), mas o nome carrega a marca de rascunho
 * (`draftTemplateName`) — a tela de geração de documento mostra um aviso
 * visível quando o modelo selecionado é um desses, não só o nome na
 * biblioteca.
 *
 * Idempotente: só cria o que ainda não existe (por tipo) — seguro rodar de
 * novo numa organização que já tem alguns modelos só seus.
 */

const ASSIGNMENT_DRAFT_CONTENT = `CESSÃO DE DIREITOS Nº {{cessao.numero}}

Empreendimento {{empreendimento.nome}}, unidade {{unidade.identificacao}}, incorporado pela {{spe.razao_social}}, CNPJ {{spe.cnpj}}.

CEDENTE: {{cedente.nome}}, CPF/CNPJ {{cedente.cpf_cnpj}}.

CESSIONÁRIO: {{cessionario.nome}}, CPF/CNPJ {{cessionario.cpf_cnpj}}.

O CEDENTE cede e transfere ao CESSIONÁRIO, em caráter irrevogável e irretratável, todos os direitos e obrigações decorrentes do contrato de compra e venda da unidade acima identificada, nos termos e condições ali estabelecidos, permanecendo o CESSIONÁRIO sub-rogado em todos os direitos e obrigações do CEDENTE a partir desta data.

Taxa de cessão: {{cessao.taxa}}.

Data da cessão: {{cessao.data}}.

E, por estarem assim justas e contratadas, as partes firmam o presente instrumento.`;

const RESCISSION_DRAFT_CONTENT = `DISTRATO Nº {{distrato.numero}}

Empreendimento {{empreendimento.nome}}, unidade {{unidade.identificacao}}, incorporado pela {{spe.razao_social}}, CNPJ {{spe.cnpj}}.

COMPRADOR: {{cliente.nome}}, CPF/CNPJ {{cliente.cpf_cnpj}}.

As partes resolvem, de comum acordo, rescindir o contrato de compra e venda da unidade acima identificada, nos seguintes termos:

Total pago pelo COMPRADOR até a presente data: {{distrato.total_pago}}.
Percentual de retenção da incorporadora: {{distrato.percentual_retencao}}.
Valor retido pela incorporadora: {{distrato.valor_retencao}}.
Dedução referente a comissão de corretagem: {{distrato.deducao_corretagem}}.
Dedução referente a taxa de fruição/ocupação: {{distrato.deducao_fruicao}}.
Valor a devolver ao COMPRADOR: {{distrato.valor_devolucao}}.
Prazo e forma de devolução: {{distrato.prazo_devolucao}}.

Com a quitação do valor de devolução acima, as partes se dão mutuamente plena, geral e irrevogável quitação, nada mais tendo a reclamar uma da outra, a qualquer título, relativamente ao contrato ora distratado.

E, por estarem assim justas e contratadas, as partes firmam o presente instrumento.`;

const STATEMENT_DRAFT_CONTENT = `EXTRATO — POSIÇÃO FINANCEIRA

Empreendimento {{empreendimento.nome}}, unidade {{unidade.identificacao}}, incorporado pela {{spe.razao_social}}, CNPJ {{spe.cnpj}}.

CLIENTE: {{cliente.nome}}, CPF/CNPJ {{cliente.cpf_cnpj}}.

Posição em: {{extrato.data_referencia}}.
Situação do contrato: {{extrato.situacao}}.

Valor contratado: {{extrato.valor_contratado}}.
Total pago até a data de referência: {{extrato.total_pago}}.
Saldo devedor atual: {{extrato.saldo_devedor}}.
Percentual quitado: {{extrato.percentual_quitado}}.

Este extrato é meramente informativo e reflete a posição financeira do contrato na data de referência acima, sujeita a atualização conforme os índices e encargos contratuais.`;

export type SeedDefaultDocumentTemplatesResult = { type: DocumentTemplateType; created: boolean; name: string }[];

export async function seedDefaultDocumentTemplates(
  context: AccessContext,
  options?: { salesContractContent?: string },
): Promise<SeedDefaultDocumentTemplatesResult> {
  const existingTypes = new Set(
    (
      await prisma.documentTemplate.findMany({
        where: { organizationId: context.organizationId },
        select: { type: true },
        distinct: ["type"],
      })
    ).map((t) => t.type),
  );

  const candidates: { type: DocumentTemplateType; name: string; content: string | undefined }[] = [
    { type: "SALES_CONTRACT", name: "Contrato de compra e venda", content: options?.salesContractContent },
    { type: "ASSIGNMENT", name: draftTemplateName("Cessão de direitos"), content: ASSIGNMENT_DRAFT_CONTENT },
    { type: "RESCISSION", name: draftTemplateName("Distrato"), content: RESCISSION_DRAFT_CONTENT },
    { type: "STATEMENT", name: draftTemplateName("Extrato"), content: STATEMENT_DRAFT_CONTENT },
  ];

  const result: SeedDefaultDocumentTemplatesResult = [];
  for (const candidate of candidates) {
    if (existingTypes.has(candidate.type) || !candidate.content) {
      result.push({ type: candidate.type, created: false, name: candidate.name });
      continue;
    }
    await createDocumentTemplate(context, {
      name: candidate.name,
      type: candidate.type,
      content: candidate.content,
      developmentIds: [],
    });
    result.push({ type: candidate.type, created: true, name: candidate.name });
  }

  return result;
}
