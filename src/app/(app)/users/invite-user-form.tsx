"use client";

import { useActionState } from "react";
import { inviteUserAction, type InviteUserState } from "./actions";

const initialState: InviteUserState = {};

type RoleOption = { id: string; name: string };

export function InviteUserForm({ roles }: { roles: RoleOption[] }) {
  const [state, formAction, pending] = useActionState(inviteUserAction, initialState);

  return (
    <form
      action={formAction}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
        maxWidth: 320,
        marginTop: "2rem",
      }}
    >
      <h2 style={{ fontSize: "1rem" }}>Convidar usuário</h2>

      <label htmlFor="fullName">Nome</label>
      <input id="fullName" name="fullName" required />

      <label htmlFor="email">E-mail</label>
      <input id="email" name="email" type="email" required />

      <label htmlFor="roleId">Papel</label>
      <select id="roleId" name="roleId" required defaultValue="">
        <option value="" disabled>
          Selecione...
        </option>
        {roles.map((role) => (
          <option key={role.id} value={role.id}>
            {role.name}
          </option>
        ))}
      </select>

      {state.error ? <p className="error-text">{state.error}</p> : null}

      <button type="submit" disabled={pending}>
        {pending ? "Enviando..." : "Enviar convite"}
      </button>
    </form>
  );
}
