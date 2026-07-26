"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Modal } from "@/components/Modal";
import { EditIcon, TrashIcon, SortIcon } from "@/components/icons";
import {
  inviteUserAction,
  updateUserRoleAction,
  revokeUserAccessAction,
  type InviteUserState,
} from "./actions";
import type { UserSortField } from "@/server/users";

export type UserGrantRow = {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  roleId: string;
  roleName: string;
};

export type RoleOption = { id: string; name: string };

type ModalState = { mode: "create" } | { mode: "edit"; grant: UserGrantRow } | null;

const initialState: InviteUserState = {};

const SORTABLE_COLUMNS: { field: UserSortField; label: string }[] = [
  { field: "name", label: "Nome" },
  { field: "email", label: "E-mail" },
  { field: "role", label: "Papel" },
];

export function UsersManager({
  grants,
  roles,
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
  grants: UserGrantRow[];
  roles: RoleOption[];
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
    return `/users?${qs.toString()}`;
  }

  function pageLink(targetPage: number) {
    const qs = new URLSearchParams();
    if (search) qs.set("q", search);
    qs.set("sort", sortBy);
    qs.set("dir", sortDir);
    qs.set("page", String(targetPage));
    return `/users?${qs.toString()}`;
  }

  function handleRevoke(grantId: string, name: string) {
    if (!confirm(`Revogar o acesso de "${name}" a esta organização?`)) return;
    setDeleteError(null);
    startTransition(async () => {
      const result = await revokeUserAccessAction(grantId);
      if (result.error) setDeleteError(result.error);
    });
  }

  return (
    <>
      <div className="list-toolbar">
        <form className="list-search" action="/users" method="get">
          <input type="hidden" name="sort" value={sortBy} />
          <input type="hidden" name="dir" value={sortDir} />
          <input type="search" name="q" placeholder="Buscar por nome ou e-mail" defaultValue={search} />
          <button type="submit" className="secondary">
            Buscar
          </button>
        </form>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <p style={{ fontSize: "0.85rem", opacity: 0.75 }}>
            {total} usuário{total === 1 ? "" : "s"}
          </p>
          {canCreate ? (
            <button type="button" onClick={() => setModal({ mode: "create" })}>
              + Convidar usuário
            </button>
          ) : null}
        </div>
      </div>

      {deleteError ? <p className="error-text" style={{ marginBottom: "0.75rem" }}>{deleteError}</p> : null}

      <table className="data-table">
        <thead>
          <tr>
            {SORTABLE_COLUMNS.map((col) => (
              <th key={col.field} className="sortable-th">
                <Link href={sortLink(col.field)}>
                  <button type="button" tabIndex={-1}>
                    {col.label}
                    <SortIcon direction={sortBy === col.field ? sortDir : null} />
                  </button>
                </Link>
              </th>
            ))}
            {canEdit || canDelete ? <th aria-label="Ações" /> : null}
          </tr>
        </thead>
        <tbody>
          {grants.length === 0 ? (
            <tr>
              <td colSpan={4} style={{ opacity: 0.7 }}>
                {search ? "Nenhum usuário encontrado." : "Nenhum usuário com acesso à organização ainda."}
              </td>
            </tr>
          ) : null}
          {grants.map((grant) => (
            <tr key={grant.id}>
              <td>{grant.fullName}</td>
              <td>{grant.email}</td>
              <td>{grant.roleName}</td>
              {canEdit || canDelete ? (
                <td>
                  <div className="row-actions">
                    {canEdit ? (
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`Editar ${grant.fullName}`}
                        onClick={() => setModal({ mode: "edit", grant })}
                      >
                        <EditIcon />
                      </button>
                    ) : null}
                    {canDelete ? (
                      <button
                        type="button"
                        className="icon-btn danger"
                        aria-label={`Revogar acesso de ${grant.fullName}`}
                        disabled={isPending || grant.userId === currentUserId}
                        title={grant.userId === currentUserId ? "Você não pode revogar o seu próprio acesso." : undefined}
                        onClick={() => handleRevoke(grant.id, grant.fullName)}
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

      <div className="pagination">
        {page > 1 ? <Link href={pageLink(page - 1)}>← Anterior</Link> : <span className="disabled">← Anterior</span>}
        <span>
          Página {page} de {totalPages}
        </span>
        {page < totalPages ? (
          <Link href={pageLink(page + 1)}>Próxima →</Link>
        ) : (
          <span className="disabled">Próxima →</span>
        )}
      </div>

      {modal ? (
        <UserModal
          mode={modal.mode}
          grant={modal.mode === "edit" ? modal.grant : null}
          roles={roles}
          onClose={() => setModal(null)}
        />
      ) : null}
    </>
  );
}

function UserModal({
  mode,
  grant,
  roles,
  onClose,
}: {
  mode: "create" | "edit";
  grant: UserGrantRow | null;
  roles: RoleOption[];
  onClose: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const formAction = mode === "create" ? inviteUserAction : updateUserRoleAction;
  const [state, dispatch, pending] = useActionState(formAction, initialState);

  useEffect(() => {
    if (state.success) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  return (
    <Modal
      open
      onClose={onClose}
      title={mode === "edit" ? `Editar papel — ${grant!.fullName}` : "Convidar usuário"}
      width={440}
      footer={
        <>
          <button type="button" className="secondary" onClick={onClose}>
            Fechar
          </button>
          <button type="button" disabled={pending} onClick={() => formRef.current?.requestSubmit()}>
            {pending ? "Salvando..." : mode === "create" ? "Enviar convite" : "Salvar"}
          </button>
        </>
      }
    >
      <form ref={formRef} action={dispatch}>
        {mode === "edit" && grant ? (
          <>
            <input type="hidden" name="grantId" value={grant.id} />
            <div className="field-section">
              <div className="field-grid">
                <div className="field">
                  <label>Nome</label>
                  <input value={grant.fullName} disabled />
                </div>
                <div className="field">
                  <label>E-mail</label>
                  <input value={grant.email} disabled />
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="field-section">
            <div className="field-grid">
              <div className="field">
                <label htmlFor="fullName">Nome *</label>
                <input id="fullName" name="fullName" required />
              </div>
              <div className="field">
                <label htmlFor="email">E-mail *</label>
                <input id="email" name="email" type="email" required />
              </div>
            </div>
          </div>
        )}

        <div className="field-section">
          <div className="field-grid">
            <div className="field">
              <label htmlFor="roleId">Papel *</label>
              <select id="roleId" name="roleId" required defaultValue={grant?.roleId ?? ""}>
                <option value="" disabled>
                  Selecione...
                </option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {state.error ? <p className="error-text">{state.error}</p> : null}
      </form>
    </Modal>
  );
}
