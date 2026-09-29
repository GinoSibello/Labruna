import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (await currentUser()) redirect("/workspace");

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
            <p>Usá la cuenta asignada por el administrador.</p>
          </div>
          <LoginForm />
          <p className="privacy-note">La sesión se cerrará automáticamente después de 8 horas.</p>
        </div>
      </section>
    </main>
  );
}
