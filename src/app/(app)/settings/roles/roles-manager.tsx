"use client";

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Modal } from "@/components/Modal";
import { EditIcon, TrashIcon, CopyIcon } from "@/components/icons";
import { resourceLabel, actionLabel } from "@/lib/permission-labels";
import {
  createRoleAction,
  updateRoleAction,
  duplicateRoleAction,
  deleteRoleAction,
  type RoleFormState,
} from "./actions";

export type RoleRow = {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  userCount: number;
  permissionIds: string[];
};

export type PermissionOption = { id: string; resource: string; action: string };

const ACTION_ORDER = ["VIEW", "CREATE", "EDIT", "DELETE", "APPROVE", "CANCEL", "EXPORT", "VIEW_SENSITIVE"];

type ModalState =
  | { mode: "view"; role: RoleRow }
  | { mode: "create" }
  | { mode: "edit"; role: RoleRow }
  | { mode: "duplicate"; role: RoleRow }
  | null;

const initialState: RoleFormState = {};

export function RolesManager({
  roles,
  permissions,
  canCreate,
  canEdit,
  canDelete,
}: {
  roles: RoleRow[];
  permissions: PermissionOption[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [modal, setModal] = useState<ModalState>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDelete(role: RoleRow) {
    if (!confirm(`Excluir o perfil "${role.name}"?`)) return;
    setRowError(null);
    startTransition(async () => {
      const result = await deleteRoleAction(role.id);
      if (result.error) setRowError(result.error);
    });
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "16px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "12.5px", color: "var(--inc-text-soft)" }}>
          {roles.length} perfil{roles.length === 1 ? "" : "is"}
        </span>
        {canCreate ? (
          <button
            type="button"
            className="inc-btn inc-btn--primary"
            style={{ marginLeft: "auto" }}
            onClick={() => setModal({ mode: "create" })}
          >
            + Novo perfil
          </button>
        ) : null}
      </div>

      {rowError ? <p className="error-text" style={{ marginBottom: "12px" }}>{rowError}</p> : null}

      <div className="inc-card">
        <table className="inc-table" style={{ border: 0 }}>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Tipo</th>
              <th>Usuários</th>
              <th aria-label="Ações" />
            </tr>
          </thead>
          <tbody>
            {roles.map((role) => (
              <tr key={role.id}>
                <td className="is-key">
                  {role.name}
                  {role.description ? (
                    <div style={{ fontSize: "12px", color: "var(--inc-text-soft)", fontWeight: 400 }}>{role.description}</div>
                  ) : null}
                </td>
                <td className="is-muted">{role.isSystem ? "Sistema" : "Customizado"}</td>
                <td className="is-muted">{role.userCount}</td>
                <td>
                  <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      className="inc-btn-icon"
                      aria-label={`Ver perfil ${role.name}`}
                      onClick={() => setModal(role.isSystem || !canEdit ? { mode: "view", role } : { mode: "edit", role })}
                    >
                      <EditIcon />
                    </button>
                    {canCreate ? (
                      <button
                        type="button"
                        className="inc-btn-icon"
                        aria-label={`Duplicar perfil ${role.name}`}
                        onClick={() => setModal({ mode: "duplicate", role })}
                      >
                        <CopyIcon />
                      </button>
                    ) : null}
                    {canDelete && !role.isSystem ? (
                      <button
                        type="button"
                        className="inc-btn-icon"
                        aria-label={`Excluir perfil ${role.name}`}
                        disabled={isPending || role.userCount > 0}
                        title={role.userCount > 0 ? "Perfil atribuído a usuários — remova o acesso deles primeiro." : undefined}
                        onClick={() => handleDelete(role)}
                        style={{ color: "var(--inc-danger)" }}
                      >
                        <TrashIcon />
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal ? (
        <RoleMatrixModal
          state={modal}
          permissions={permissions}
          onClose={() => setModal(null)}
          onRequestDuplicate={(role) => setModal({ mode: "duplicate", role })}
        />
      ) : null}
    </>
  );
}

function RoleMatrixModal({
  state,
  permissions,
  onClose,
  onRequestDuplicate,
}: {
  state: Exclude<ModalState, null>;
  permissions: PermissionOption[];
  onClose: () => void;
  onRequestDuplicate: (role: RoleRow) => void;
}) {
  const mode = state.mode;
  const role = mode === "create" ? null : state.role;
  const readOnly = mode === "view";

  const formAction = mode === "create" ? createRoleAction : mode === "edit" ? updateRoleAction : duplicateRoleAction;
  const [formState, dispatch, pending] = useActionState(formAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set(role?.permissionIds ?? []));

  useEffect(() => {
    if (formState.success) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formState.success]);

  const byResource = useMemo(() => {
    const map = new Map<string, PermissionOption[]>();
    for (const p of permissions) {
      const list = map.get(p.resource) ?? [];
      list.push(p);
      map.set(p.resource, list);
    }
    return [...map.entries()]
      .map(([resource, perms]) => ({
        resource,
        perms: [...perms].sort((a, b) => ACTION_ORDER.indexOf(a.action) - ACTION_ORDER.indexOf(b.action)),
      }))
      .sort((a, b) => resourceLabel(a.resource).localeCompare(resourceLabel(b.resource), "pt-BR"));
  }, [permissions]);

  function toggle(id: string) {
    if (readOnly) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleRow(perms: PermissionOption[]) {
    if (readOnly) return;
    const ids = perms.map((p) => p.id);
    const allSelected = ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (allSelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  function toggleColumn(action: string) {
    if (readOnly) return;
    const ids = permissions.filter((p) => p.action === action).map((p) => p.id);
    const allSelected = ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (allSelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  const title =
    mode === "view"
      ? `Perfil — ${role!.name}`
      : mode === "edit"
        ? `Editar perfil — ${role!.name}`
        : mode === "duplicate"
          ? `Duplicar perfil "${role!.name}" para customizar`
          : "Novo perfil";

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      width={880}
      footer={
        <>
          <button type="button" className="inc-btn inc-btn--secondary" onClick={onClose}>
            Fechar
          </button>
          {mode === "view" ? (
            <button type="button" className="inc-btn inc-btn--primary" onClick={() => onRequestDuplicate(role!)}>
              Duplicar pra customizar
            </button>
          ) : (
            <button
              type="button"
              className="inc-btn inc-btn--primary"
              disabled={pending}
              onClick={() => formRef.current?.requestSubmit()}
            >
              {pending ? "Salvando..." : "Salvar"}
            </button>
          )}
        </>
      }
    >
      <form ref={formRef} action={dispatch}>
        {mode === "edit" ? <input type="hidden" name="roleId" value={role!.id} /> : null}
        {mode === "duplicate" ? <input type="hidden" name="sourceRoleId" value={role!.id} /> : null}
        {[...selected].map((id) => (
          <input key={id} type="hidden" name="permissionIds" value={id} />
        ))}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "14px" }}>
          <label className="inc-field">
            <span className="inc-label">Nome *</span>
            <input
              className="inc-input"
              name="name"
              required
              disabled={readOnly}
              defaultValue={mode === "duplicate" ? `${role!.name} (customizado)` : (role?.name ?? "")}
            />
          </label>
          <label className="inc-field">
            <span className="inc-label">Descrição</span>
            <input
              className="inc-input"
              name="description"
              disabled={readOnly}
              defaultValue={mode === "duplicate" ? "" : (role?.description ?? "")}
            />
          </label>
        </div>

        {readOnly ? (
          <p style={{ fontSize: "12px", color: "var(--inc-text-soft)", marginBottom: "10px" }}>
            Perfil de sistema — somente leitura. Duplique pra criar uma versão customizada da sua organização.
          </p>
        ) : (
          <div style={{ display: "flex", gap: "8px", marginBottom: "10px", flexWrap: "wrap" }}>
            <button type="button" className="inc-btn inc-btn--secondary" onClick={() => setSelected(new Set(permissions.map((p) => p.id)))}>
              Marcar tudo
            </button>
            <button
              type="button"
              className="inc-btn inc-btn--secondary"
              onClick={() => setSelected(new Set(permissions.filter((p) => p.action === "VIEW").map((p) => p.id)))}
            >
              Somente leitura
            </button>
            <button type="button" className="inc-btn inc-btn--secondary" onClick={() => setSelected(new Set())}>
              Limpar
            </button>
          </div>
        )}

        <div style={{ maxHeight: "50vh", overflow: "auto", border: "1px solid var(--inc-border)", borderRadius: "8px" }}>
          <table className="inc-table" style={{ border: 0 }}>
            <thead>
              <tr>
                <th style={{ position: "sticky", left: 0, background: "var(--inc-surface)", zIndex: 1 }}>Módulo</th>
                {ACTION_ORDER.map((action) => (
                  <th key={action} style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                    {readOnly ? (
                      actionLabel(action)
                    ) : (
                      <button
                        type="button"
                        onClick={() => toggleColumn(action)}
                        style={{ background: "none", border: 0, cursor: "pointer", font: "inherit", color: "inherit", padding: 0 }}
                        title={`Marcar/desmarcar "${actionLabel(action)}" em todos os módulos`}
                      >
                        {actionLabel(action)}
                      </button>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {byResource.map(({ resource, perms }) => (
                <tr key={resource}>
                  <td
                    className="is-key"
                    style={{ position: "sticky", left: 0, background: "var(--inc-surface)", cursor: readOnly ? "default" : "pointer" }}
                    onClick={() => toggleRow(perms)}
                    title={readOnly ? undefined : `Marcar/desmarcar todas as ações de "${resourceLabel(resource)}"`}
                  >
                    {resourceLabel(resource)}
                  </td>
                  {ACTION_ORDER.map((action) => {
                    const perm = perms.find((p) => p.action === action);
                    if (!perm) return <td key={action} />;
                    return (
                      <td key={action} style={{ textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={selected.has(perm.id)}
                          disabled={readOnly}
                          onChange={() => toggle(perm.id)}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {formState.error ? <p className="error-text" style={{ marginTop: "14px" }}>{formState.error}</p> : null}
      </form>
    </Modal>
  );
}
