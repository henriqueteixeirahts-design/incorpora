"use client";

import { useActionState } from "react";
import { signInAction, type LoginState } from "./actions";

const initialState: LoginState = {};

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(signInAction, initialState);

  return (
    <main
      style={{
        display: "flex",
        minHeight: "100vh",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <form
        action={formAction}
        style={{ display: "flex", flexDirection: "column", gap: "0.75rem", width: 320 }}
      >
        <h1 style={{ marginBottom: "0.5rem" }}>Incorpora</h1>

        <label htmlFor="email">E-mail</label>
        <input id="email" name="email" type="email" required autoComplete="email" />

        <label htmlFor="password">Senha</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
        />

        {state.error ? <p className="error-text">{state.error}</p> : null}

        <button type="submit" disabled={pending}>
          {pending ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </main>
  );
}
