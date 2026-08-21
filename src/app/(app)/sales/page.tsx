import { requireAccessContext, hasPermission } from "@/server/auth-context";
import {
  listSalesPaged,
  walletStatusFromInstallments,
  type SaleSortField,
  type ContractStatusFilter,
  type WalletStatusFilter,
} from "@/server/sales";
import { listBrokers, listAgencies } from "@/server/crm";
import { SalesManager } from "./sales-manager";

const PAGE_SIZE = 20;

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const context = await requireAccessContext();

  const search = params.q ?? "";
  const sortBy = (params.sort as SaleSortField) ?? "saleDate";
  const sortDir = params.dir === "asc" ? "asc" : "desc";
  const page = Math.max(1, Number(params.page) || 1);
  const contractStatus = (params.contractStatus as ContractStatusFilter) || "";
  const brokerId = params.brokerId ?? "";
  const agencyId = params.agencyId ?? "";
  const dateFrom = params.dateFrom ?? "";
  const dateTo = params.dateTo ?? "";
  const walletStatus = (params.walletStatus as WalletStatusFilter) || "";

  const [{ items, total }, brokers, agencies] = await Promise.all([
    listSalesPaged(context, {
      search,
      sortBy,
      sortDir,
      page,
      pageSize: PAGE_SIZE,
      contractStatus: contractStatus || undefined,
      brokerId: brokerId || undefined,
      agencyId: agencyId || undefined,
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
      walletStatus: walletStatus || undefined,
    }),
    listBrokers(context.organizationId),
    listAgencies(context.organizationId),
  ]);

  const canEditCommission = hasPermission(context, "sale", "EDIT");
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <div className="inc-page-head">
        <div>
          <div className="inc-eyebrow">Comercial</div>
          <h1 className="inc-h1">Vendas</h1>
        </div>
      </div>

      <SalesManager
        sales={items.map((sale) => ({
          id: sale.id,
          saleNumber: sale.saleNumber,
          developmentName: sale.development.name,
          unitNumber: sale.unit.number,
          customerName: sale.customer.name,
          salePrice: Number(sale.salePrice),
          saleDate: sale.saleDate.toISOString(),
          contractStatus: sale.contract?.status ?? null,
          walletStatus: walletStatusFromInstallments(sale.contract?.portfolio?.installments),
          brokerName: sale.proposal.broker?.name ?? null,
          agencyName: sale.proposal.agency?.name ?? null,
          commissionSplits: sale.commissionSplits.map((split) => ({
            id: split.id,
            beneficiaryType: split.beneficiaryType,
            label: split.label,
            percent: Number(split.percent),
            value: Number(split.value),
            status: split.status,
          })),
        }))}
        brokers={brokers.map((b) => ({ id: b.id, label: b.name }))}
        agencies={agencies.map((a) => ({ id: a.id, label: a.name }))}
        total={total}
        page={page}
        totalPages={totalPages}
        search={search}
        sortBy={sortBy}
        sortDir={sortDir}
        contractStatus={contractStatus}
        brokerId={brokerId}
        agencyId={agencyId}
        dateFrom={dateFrom}
        dateTo={dateTo}
        walletStatus={walletStatus}
        canEditCommission={canEditCommission}
      />
    </>
  );
}
