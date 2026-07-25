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
        position: "relative",
      }}
    >
      <div
        className="tsh-grafismo-bg"
        aria-hidden="true"
        style={{ position: "absolute", inset: 0 }}
      />

      <form
        action={formAction}
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
          width: 320,
          padding: "2rem",
          background: "var(--background)",
          border: "1px solid var(--border-color)",
          borderRadius: 12,
          boxShadow: "0 8px 24px rgba(68, 92, 108, 0.12)",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/tsh-logo-color.svg"
          alt="TSH"
          style={{ height: 28, width: "auto", marginBottom: "1.25rem" }}
        />

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
