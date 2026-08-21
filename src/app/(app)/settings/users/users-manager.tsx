"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Modal } from "@/components/Modal";
import { EditIcon, TrashIcon, SortIcon } from "@/components/icons";
import { formatDateTimeBR } from "@/lib/format";
import {
  inviteUserAction,
  updateUserAccessAction,
  revokeUserAccessAction,
  type InviteUserState,
} from "./actions";
import type { UserSortField } from "@/server/users";

export type UserRow = {
  userId: string;
  fullName: string;
  email: string;
  roleId: string;
  roleName: string;
  developmentScope: "ALL" | string[];
  audit: { createdByName: string | null; createdAt: Date; updatedByName: string | null; updatedAt: Date };
};

export type RoleOption = { id: string; name: string };
export type DevelopmentOption = { id: string; name: string };

type ModalState = { mode: "create" } | { mode: "edit"; user: UserRow } | null;

const initialState: InviteUserState = {};

const SORTABLE_COLUMNS: { field: UserSortField; label: string }[] = [
  { field: "name", label: "Nome" },
  { field: "email", label: "E-mail" },
  { field: "role", label: "Papel" },
];

function scopeLabel(scope: "ALL" | string[], developments: DevelopmentOption[]) {
  if (scope === "ALL") return "Todos os empreendimentos";
  if (scope.length === 0) return "Nenhum empreendimento";
  const names = scope.map((id) => developments.find((d) => d.id === id)?.name ?? "?");
  return names.length <= 2 ? names.join(", ") : `${names[0]} e mais ${names.length - 1}`;
}

export function UsersManager({
  users,
  roles,
  developments,
  currentUserId,
  total,
  page,
  totalPages,
  search,
  sortBy,
  sortDir,
  canCreate,
  canEdit,
  canDelete,
}: {
  users: UserRow[];
  roles: RoleOption[];
  developments: DevelopmentOption[];
  currentUserId: string;
  total: number;
  page: number;
  totalPages: number;
  search: string;
  sortBy: UserSortField;
  sortDir: "asc" | "desc";
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [modal, setModal] = useState<ModalState>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function sortLink(field: UserSortField) {
    const nextDir = sortBy === field && sortDir === "asc" ? "desc" : "asc";
    const qs = new URLSearchParams();
    if (search) qs.set("q", search);
    qs.set("sort", field);
    qs.set("dir", nextDir);
    return `/settings/users?${qs.toString()}`;
  }

  function pageLink(targetPage: number) {
    const qs = new URLSearchParams();
    if (search) qs.set("q", search);
    qs.set("sort", sortBy);
    qs.set("dir", sortDir);
    qs.set("page", String(targetPage));
    return `/settings/users?${qs.toString()}`;
  }

  function handleRevoke(userId: string, name: string) {
    if (!confirm(`Revogar o acesso de "${name}" a esta organização?`)) return;
    setDeleteError(null);
    startTransition(async () => {
      const result = await revokeUserAccessAction(userId);
      if (result.error) setDeleteError(result.error);
    });
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "16px", flexWrap: "wrap" }}>
        <form className="inc-search" style={{ width: 320 }} action="/settings/users" method="get">
          <input type="hidden" name="sort" value={sortBy} />
          <input type="hidden" name="dir" value={sortDir} />
          <input type="search" name="q" placeholder="Buscar por nome ou e-mail" defaultValue={search} />
        </form>

        <span style={{ fontSize: "12.5px", color: "var(--inc-text-soft)" }}>
          {total} usuário{total === 1 ? "" : "s"}
        </span>

        {canCreate ? (
          <button
            type="button"
            className="inc-btn inc-btn--primary"
            style={{ marginLeft: "auto" }}
            onClick={() => setModal({ mode: "create" })}
          >
            + Convidar usuário
          </button>
        ) : null}
      </div>

      {deleteError ? <p className="error-text" style={{ marginBottom: "12px" }}>{deleteError}</p> : null}

      <div className="inc-card">
        <table className="inc-table" style={{ border: 0 }}>
          <thead>
            <tr>
              {SORTABLE_COLUMNS.map((col) => (
                <th key={col.field}>
                  <Link
                    href={sortLink(col.field)}
                    style={{ display: "inline-flex", alignItems: "center", gap: "4px", color: "inherit", textDecoration: "none" }}
                  >
                    {col.label}
                    <SortIcon direction={sortBy === col.field ? sortDir : null} />
                  </Link>
                </th>
              ))}
              <th>Empreendimentos</th>
              {canEdit || canDelete ? <th aria-label="Ações" /> : null}
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={5} className="is-empty">
                  {search ? "Nenhum usuário encontrado." : "Nenhum usuário com acesso à organização ainda."}
                </td>
              </tr>
            ) : null}
            {users.map((user) => (
              <tr key={user.userId}>
                <td className="is-key">{user.fullName}</td>
                <td className="is-muted">{user.email}</td>
                <td>{user.roleName}</td>
                <td className="is-muted">{scopeLabel(user.developmentScope, developments)}</td>
                {canEdit || canDelete ? (
                  <td>
                    <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                      {canEdit ? (
                        <button
                          type="button"
                          className="inc-btn-icon"
                          aria-label={`Editar ${user.fullName}`}
                          onClick={() => setModal({ mode: "edit", user })}
                        >
                          <EditIcon />
                        </button>
                      ) : null}
                      {canDelete ? (
                        <button
                          type="button"
                          className="inc-btn-icon"
                          aria-label={`Revogar acesso de ${user.fullName}`}
                          disabled={isPending || user.userId === currentUserId}
                          title={user.userId === currentUserId ? "Você não pode revogar o seu próprio acesso." : undefined}
                          onClick={() => handleRevoke(user.userId, user.fullName)}
                          style={{ color: "var(--inc-danger)" }}
                        >
                          <TrashIcon />
                        </button>
                      ) : null}
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>

        <div className="inc-table-foot">
          Página {page} de {totalPages}
          <div className="inc-pagination">
            {page > 1 ? (
              <Link href={pageLink(page - 1)}>← Anterior</Link>
            ) : (
              <span style={{ color: "var(--inc-text-placeholder)" }}>← Anterior</span>
            )}
            {page < totalPages ? (
              <Link href={pageLink(page + 1)}>Próxima →</Link>
            ) : (
              <span style={{ color: "var(--inc-text-placeholder)" }}>Próxima →</span>
            )}
          </div>
        </div>
      </div>

      {modal ? (
        <UserModal
          mode={modal.mode}
          user={modal.mode === "edit" ? modal.user : null}
          roles={roles}
          developments={developments}
          onClose={() => setModal(null)}
        />
      ) : null}
    </>
  );
}

function UserModal({
  mode,
  user,
  roles,
  developments,
  onClose,
}: {
  mode: "create" | "edit";
  user: UserRow | null;
  roles: RoleOption[];
  developments: DevelopmentOption[];
  onClose: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const formAction = mode === "create" ? inviteUserAction : updateUserAccessAction;
  const [state, dispatch, pending] = useActionState(formAction, initialState);

  const [allDevelopments, setAllDevelopments] = useState(mode === "create" ? true : user?.developmentScope === "ALL");
  const [selectedDevelopmentIds, setSelectedDevelopmentIds] = useState<Set<string>>(
    new Set(mode === "edit" && user?.developmentScope !== "ALL" ? (user?.developmentScope as string[]) : []),
  );

  useEffect(() => {
    if (state.success) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  function toggleDevelopment(id: string) {
    setSelectedDevelopmentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={mode === "edit" ? `Editar acesso — ${user!.fullName}` : "Convidar usuário"}
      width={520}
      footer={
        <>
          <button type="button" className="inc-btn inc-btn--secondary" onClick={onClose}>
            Fechar
          </button>
          <button
            type="button"
            className="inc-btn inc-btn--primary"
            disabled={pending}
            onClick={() => formRef.current?.requestSubmit()}
          >
            {pending ? "Salvando..." : mode === "create" ? "Enviar convite" : "Salvar"}
          </button>
        </>
      }
    >
      <form ref={formRef} action={dispatch}>
        {mode === "edit" && user ? (
          <>
            <input type="hidden" name="userId" value={user.userId} />
            <p style={{ marginTop: 0, marginBottom: "12px", fontSize: "12px", color: "var(--inc-text-soft)" }}>
              Cadastrado por {user.audit.createdByName ?? "—"} em {formatDateTimeBR(user.audit.createdAt)}
              {" · "}Última alteração por {user.audit.updatedByName ?? "—"} em {formatDateTimeBR(user.audit.updatedAt)}
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "14px" }}>
              <label className="inc-field">
                <span className="inc-label">Nome</span>
                <input className="inc-input" value={user.fullName} disabled />
              </label>
              <label className="inc-field">
                <span className="inc-label">E-mail</span>
                <input className="inc-input" value={user.email} disabled />
              </label>
            </div>
          </>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "14px" }}>
            <label className="inc-field">
              <span className="inc-label">Nome *</span>
              <input id="fullName" name="fullName" className="inc-input" required />
            </label>
            <label className="inc-field">
              <span className="inc-label">E-mail *</span>
              <input id="email" name="email" type="email" className="inc-input" required />
            </label>
          </div>
        )}

        <label className="inc-field" style={{ marginBottom: "14px" }}>
          <span className="inc-label">Papel *</span>
          <select id="roleId" name="roleId" className="inc-select" required defaultValue={user?.roleId ?? ""}>
            <option value="" disabled>
              Selecione...
            </option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
        </label>

        <div className="inc-field">
          <span className="inc-label">Empreendimentos *</span>
          <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", marginBottom: "8px" }}>
            <input
              type="checkbox"
              name="allDevelopments"
              checked={allDevelopments}
              onChange={(e) => setAllDevelopments(e.target.checked)}
            />
            Todos os empreendimentos
          </label>
          {!allDevelopments ? (
            <div
              style={{
                maxHeight: "180px",
                overflow: "auto",
                border: "1px solid var(--inc-border)",
                borderRadius: "8px",
                padding: "8px 10px",
              }}
            >
              {developments.length === 0 ? (
                <p style={{ fontSize: "12.5px", color: "var(--inc-text-soft)", margin: 0 }}>Nenhum empreendimento cadastrado.</p>
              ) : (
                developments.map((dev) => (
                  <label key={dev.id} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", padding: "3px 0" }}>
                    <input
                      type="checkbox"
                      name="developmentIds"
                      value={dev.id}
                      checked={selectedDevelopmentIds.has(dev.id)}
                      onChange={() => toggleDevelopment(dev.id)}
                    />
                    {dev.name}
                  </label>
                ))
              )}
            </div>
          ) : null}
        </div>

        {state.error ? <p className="error-text" style={{ marginTop: "14px" }}>{state.error}</p> : null}
      </form>
    </Modal>
  );
}
