import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { LoginForm } from "./login-form";
import { config } from "@/lib/config";
import { appPath } from "@/lib/app-path";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await currentUser()) redirect("/workspace");
  const { error } = await searchParams;
  const messages: Record<string, string> = {
    not_authorized: "Tu cuenta no tiene acceso. Contactá al administrador.",
    google_cancelled: "Cancelaste el ingreso con Google. Podés volver a intentarlo.",
    google_unavailable: "No pudimos completar el ingreso con Google. Verificá la configuración o volvé a intentarlo en unos minutos.",
  };

  return (
    <main className="login-shell">
      <section className="login-brand" aria-label="Procesamiento documental">
        <div className="brand-mark" aria-hidden="true">
          L
        </div>
        <div>
          <p className="eyebrow">OPERACIONES · DOCUMENTOS</p>
          <h1>Revisá cada dato antes de guardarlo.</h1>
          <p className="login-intro">
            Una entrada segura para procesar remitos, planos de chapas y cheques sin dejar de usar
            WhatsApp como respaldo.
          </p>
        </div>
        <div className="login-note">
          <span className="status-dot" />
          Twilio continúa disponible durante la transición
        </div>
      </section>

      <section className="login-panel">
        <div className="login-card">
          <div className="login-card-heading">
            <p className="eyebrow">ACCESO INTERNO</p>
            <h2>Ingresar</h2>
            <p>{config.authProvider === "google" ? "Usá la cuenta de Google habilitada para tu equipo." : "Usá la cuenta asignada por el administrador."}</p>
          </div>
          {config.authProvider === "google" ? (
            <div className="login-form">
              {error && messages[error] && <p className="form-error" role="alert">{messages[error]}</p>}
              <a className="primary-button full-width" href={appPath("/api/auth/google")}>Continuar con Google</a>
              <p className="privacy-note">Google verifica tu identidad. El administrador habilita tu acceso y tus permisos.</p>
            </div>
          ) : <LoginForm />}
          <p className="privacy-note">La sesión se cerrará automáticamente después de {config.sessionTtlSeconds / 3600} horas.</p>
        </div>
      </section>
    </main>
  );
}
