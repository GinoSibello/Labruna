"use client";

import { useState, type FormEvent } from "react";
import { appPath } from "@/lib/app-path";
import { ArrowRight, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail } from "lucide-react";

export function LoginForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(appPath("/api/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "No pudimos iniciar sesión.");
      window.location.assign(appPath("/workspace"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No pudimos iniciar sesión.");
      setBusy(false);
    }
  }

  return (
    <form className="login-form" onSubmit={submit}>
      <label className="field-label" htmlFor="email">
        Correo electrónico
      </label>
      <div className="input-shell">
        <Mail size={18} aria-hidden="true" />
        <input id="email" name="email" type="email" autoComplete="username" required />
      </div>

      <label className="field-label" htmlFor="password">
        Contraseña
      </label>
      <div className="input-shell">
        <LockKeyhole size={18} aria-hidden="true" />
        <input
          id="password"
          name="password"
          type={showPassword ? "text" : "password"}
          autoComplete="current-password"
          minLength={12}
          required
        />
        <button
          className="icon-button"
          type="button"
          aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
          onClick={() => setShowPassword((value) => !value)}
        >
          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <button className="primary-button full-width" type="submit" disabled={busy}>
        {busy ? <LoaderCircle className="spin" size={19} /> : <ArrowRight size={19} />}
        {busy ? "Ingresando…" : "Ingresar"}
      </button>
    </form>
  );
}
