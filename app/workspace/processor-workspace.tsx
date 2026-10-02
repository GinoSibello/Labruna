"use client";

import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  FileCheck2,
  FileText,
  Layers3,
  LoaderCircle,
  LogOut,
  PackageCheck,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { moduleDefinitions, type FieldDefinition } from "@/lib/modules";
import { appPath } from "@/lib/app-path";
import { REMITOS_SHEET_HEADERS, REMITOS_AUTOMATIC_HEADERS } from "@/lib/remitos-sheet";
import type { AnalyzeResponse, ConfirmResponse, ModuleSlug } from "@/lib/types";

type Stage = "upload" | "analyzing" | "review" | "saving" | "success";

interface ApiFailure {
  error?: {
    message?: string;
    fieldErrors?: Record<string, string[]>;
  };
}

const moduleIcons = {
  remitos: PackageCheck,
  chapas: Layers3,
  cheques: Banknote,
};

const itemFields = [
  ["material", "Material"],
  ["unidades", "Unidades"],
  ["kg", "Kg"],
  ["mts", "Metros"],
  ["litros", "Litros"],
  ["unidad_medida", "Unidad de medida"],
  ["lote", "Lote"],
  ["moneda", "Moneda"],
  ["precio_unitario", "Precio unitario"],
] as const;

export function ProcessorWorkspace({
  user,
  modules,
  mockMode,
}: {
  user: { name: string; email: string };
  modules: ModuleSlug[];
  mockMode: boolean;
}) {
  const [selected, setSelected] = useState<ModuleSlug | null>(modules[0] ?? null);
  const [stage, setStage] = useState<Stage>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [receipt, setReceipt] = useState<ConfirmResponse | null>(null);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [progress, setProgress] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const stateRef = useRef<{ stage: Stage; selected: ModuleSlug | null }>({ stage, selected });

  const definition = selected ? moduleDefinitions[selected] : null;
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : ""), [file]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    stateRef.current = { stage, selected };
  }, [stage, selected]);

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const report = (reason: unknown) => {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      console.warn("WebMCP registration failed", reason);
    };

    void Promise.resolve(
      context.registerTool(
        {
          name: "get_document_processing_state",
          title: "Consultar estado del procesamiento",
          description: "Devuelve el módulo y el paso actualmente visibles sin modificar información.",
          inputSchema: { type: "object", properties: {}, additionalProperties: false },
          annotations: { readOnlyHint: true, untrustedContentHint: false },
          execute() {
            return stateRef.current;
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(report);

    void Promise.resolve(
      context.registerTool(
        {
          name: "select_document_module",
          title: "Seleccionar tipo de documento",
          description: "Abre un módulo habilitado en la pantalla de carga. No analiza ni guarda documentos.",
          inputSchema: {
            type: "object",
            properties: { module: { type: "string", enum: modules } },
            required: ["module"],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: false },
          execute(input) {
            const requested = (input as { module?: ModuleSlug })?.module;
            if (!requested || !modules.includes(requested)) throw new Error("Módulo no habilitado");
            if (["analyzing", "saving"].includes(stateRef.current.stage)) {
              throw new Error("Hay una operación en curso");
            }
            setSelected(requested);
            setStage("upload");
            setFile(null);
            setAnalysis(null);
            setDraft({});
            setReceipt(null);
            setError("");
            setFieldErrors({});
            return { module: requested, stage: "upload" };
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(report);

    return () => lifecycle.abort();
  }, [modules]);

  useEffect(() => {
    if (stage !== "analyzing") return;
    setProgress(12);
    const interval = window.setInterval(() => {
      setProgress((value) => Math.min(92, value + Math.max(1, Math.round((94 - value) / 9))));
    }, 850);
    return () => window.clearInterval(interval);
  }, [stage]);

  function chooseModule(module: ModuleSlug) {
    setSelected(module);
    resetOperation();
  }

  function resetOperation() {
    setStage("upload");
    setFile(null);
    setDragging(false);
    setAnalysis(null);
    setDraft({});
    setReceipt(null);
    setError("");
    setFieldErrors({});
    setProgress(0);
    if (fileInput.current) fileInput.current.value = "";
  }

  function acceptFile(next: File | null) {
    if (!next || !definition) return;
    setError("");
    setFile(next);
  }

  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    acceptFile(event.dataTransfer.files[0] ?? null);
  }

  async function analyze() {
    if (!selected || !file) return;
    setError("");
    setStage("analyzing");
    const form = new FormData();
    form.set("file", file);
    try {
      const response = await fetch(appPath(`/api/process/${selected}/analyze`), { method: "POST", body: form });
      const body = (await response.json()) as AnalyzeResponse | ApiFailure;
      if (!response.ok) throw body;
      const result = body as AnalyzeResponse;
      setProgress(100);
      setAnalysis(result);
      setDraft(result.data);
      setStage("review");
    } catch (reason) {
      setError(readError(reason));
      setStage("upload");
    }
  }

  async function confirm() {
    if (!selected || !analysis) return;
    setError("");
    setFieldErrors({});
    setStage("saving");
    try {
      const response = await fetch(appPath(`/api/process/${selected}/confirm`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: analysis.requestId, data: draft }),
      });
      const body = (await response.json()) as ConfirmResponse | ApiFailure;
      if (!response.ok) {
        setFieldErrors((body as ApiFailure).error?.fieldErrors ?? {});
        throw body;
      }
      setReceipt(body as ConfirmResponse);
      setStage("success");
    } catch (reason) {
      setError(readError(reason));
      setStage("review");
    }
  }

  async function logout() {
    await fetch(appPath("/api/auth/logout"), { method: "POST" });
    window.location.assign(appPath("/login"));
  }

  function setField(key: string, value: unknown) {
    setDraft((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      const copy = { ...current };
      delete copy[key];
      return copy;
    });
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="app-identity">
          <div className="mini-mark" aria-hidden="true">
            L
          </div>
          <div>
            <strong>Documentos</strong>
            <span>Centro de procesamiento</span>
          </div>
        </div>
        <div className="header-actions">
          <div className="twilio-status" title="El canal de WhatsApp continúa operativo">
            <span className="status-dot" /> WhatsApp disponible
          </div>
          <div className="user-chip">
            <span>{initials(user.name)}</span>
            <div>
              <strong>{user.name}</strong>
              <small>{user.email}</small>
            </div>
          </div>
          <button className="icon-button header-logout" onClick={logout} aria-label="Cerrar sesión" title="Cerrar sesión">
            <LogOut size={19} />
          </button>
        </div>
      </header>

      <div className="workspace-grid">
        <aside className="module-sidebar" aria-label="Módulos disponibles">
          <p className="sidebar-label">TIPO DE DOCUMENTO</p>
          <nav className="module-nav">
            {modules.map((module) => {
              const item = moduleDefinitions[module];
              const Icon = moduleIcons[module];
              return (
                <button
                  key={module}
                  className={`module-button ${selected === module ? "active" : ""}`}
                  onClick={() => chooseModule(module)}
                  aria-current={selected === module ? "page" : undefined}
                >
                  <span className="module-icon"><Icon size={21} /></span>
                  <span>
                    <strong>{item.name}</strong>
                    <small>{module === "cheques" ? "Imagen o PDF" : "Imagen"}</small>
                  </span>
                  <ChevronRight size={18} />
                </button>
              );
            })}
          </nav>
          <div className="security-card">
            <ShieldCheck size={21} />
            <div>
              <strong>Revisión protegida</strong>
              <p>Nada se guarda hasta que confirmes los datos.</p>
            </div>
          </div>
        </aside>

        <section className="work-area">
          {mockMode && (
            <div className="alert" role="status">
              <CircleAlert size={20} />
              <div><strong>Modo demostración</strong><p>Los resultados son ejemplos. Esta web todavía no analiza con IA ni guarda registros en Sheets o Drive. Usá WhatsApp para operaciones reales.</p></div>
            </div>
          )}
          {!definition ? (
            <EmptyModules />
          ) : (
            <>
              <div className="work-heading">
                <div>
                  <p className="eyebrow">NUEVO PROCESAMIENTO</p>
                  <h1>{definition.name}</h1>
                  <p>{definition.description}</p>
                </div>
                <StepIndicator stage={stage} />
              </div>

              {error && (
                <div className="alert error-alert" role="alert">
                  <CircleAlert size={20} />
                  <div><strong>No pudimos completar la operación</strong><p>{error}</p></div>
                  <button className="icon-button" onClick={() => setError("")} aria-label="Cerrar mensaje"><X size={18} /></button>
                </div>
              )}

              {stage === "upload" && (
                <UploadStage
                  definition={definition}
                  file={file}
                  previewUrl={previewUrl}
                  dragging={dragging}
                  inputRef={fileInput}
                  onInput={(event) => acceptFile(event.target.files?.[0] ?? null)}
                  onDragEnter={() => setDragging(true)}
                  onDragLeave={() => setDragging(false)}
                  onDrop={drop}
                  onRemove={resetOperation}
                  onAnalyze={analyze}
                />
              )}
              {stage === "analyzing" && <AnalyzingStage file={file} progress={progress} />}
              {(stage === "review" || stage === "saving") && analysis && (
                <ReviewStage
                  definition={definition}
                  analysis={analysis}
                  data={draft}
                  fieldErrors={fieldErrors}
                  saving={stage === "saving"}
                  onField={setField}
                  onBack={resetOperation}
                  onConfirm={confirm}
                />
              )}
              {stage === "success" && receipt && (
                <SuccessStage definition={definition} receipt={receipt} onRestart={resetOperation} />
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function UploadStage({
  definition,
  file,
  previewUrl,
  dragging,
  inputRef,
  onInput,
  onDragEnter,
  onDragLeave,
  onDrop,
  onRemove,
  onAnalyze,
}: {
  definition: (typeof moduleDefinitions)[ModuleSlug];
  file: File | null;
  previewUrl: string;
  dragging: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onInput: (event: ChangeEvent<HTMLInputElement>) => void;
  onDragEnter: () => void;
  onDragLeave: () => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onRemove: () => void;
  onAnalyze: () => void;
}) {
  function openPicker() {
    const input = inputRef.current;
    if (!input) return;
    input.value = "";
    input.click();
  }

  return (
    <div className="surface-card upload-card">
      <div className="section-heading">
        <span className="step-number">1</span>
        <div><h2>Cargar documento</h2><p>Elegí una foto clara y completa. Vas a poder revisar los datos extraídos.</p></div>
      </div>

      {!file ? (
        <div
          className={`drop-zone ${dragging ? "dragging" : ""}`}
          onDragEnter={(event) => { event.preventDefault(); onDragEnter(); }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          <input ref={inputRef} type="file" accept={definition.accept} onChange={onInput} hidden />
          <span className="upload-symbol"><UploadCloud size={31} /></span>
          <h3>Arrastrá el archivo o elegilo desde el equipo</h3>
          <p>{definition.formatsLabel} · Hasta 15 MB</p>
          <div className="upload-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={openPicker}
            >
              <FileText size={18} /> Elegir archivo
            </button>
          </div>
        </div>
      ) : (
        <div className="selected-file">
          <div className="document-preview">
            {file.type.startsWith("image/") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="Vista previa del documento seleccionado" />
            ) : (
              <div className="pdf-preview"><FileText size={42} /><span>PDF</span></div>
            )}
          </div>
          <div className="file-details">
            <span className="ready-badge"><Check size={14} /> Listo para analizar</span>
            <h3>{file.name}</h3>
            <p>{formatSize(file.size)} · {file.type || "Archivo"}</p>
            <button className="text-button danger" type="button" onClick={onRemove}><Trash2 size={16} /> Quitar archivo</button>
          </div>
          <button className="primary-button analyze-button" onClick={onAnalyze}>
            Analizar documento <ArrowRight size={19} />
          </button>
        </div>
      )}

      <div className="upload-tips">
        <div><CheckCircle2 size={18} /><span>Documento completo, sin bordes cortados</span></div>
        <div><CheckCircle2 size={18} /><span>Buena luz y texto enfocado</span></div>
        <div><CheckCircle2 size={18} /><span>Un documento por operación</span></div>
      </div>
    </div>
  );
}

function AnalyzingStage({ file, progress }: { file: File | null; progress: number }) {
  return (
    <div className="surface-card processing-card" aria-live="polite">
      <div className="processing-orbit"><FileText size={34} /><span /></div>
      <p className="eyebrow">ANÁLISIS EN CURSO</p>
      <h2>Estamos leyendo el documento</h2>
      <p>{file?.name}</p>
      <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
      <div className="progress-copy"><span>Identificando campos y valores…</span><strong>{progress}%</strong></div>
      <small>Puede demorar hasta dos minutos. Mantené esta pantalla abierta.</small>
    </div>
  );
}

function ReviewStage({
  definition,
  analysis,
  data,
  fieldErrors,
  saving,
  onField,
  onBack,
  onConfirm,
}: {
  definition: (typeof moduleDefinitions)[ModuleSlug];
  analysis: AnalyzeResponse;
  data: Record<string, unknown>;
  fieldErrors: Record<string, string[]>;
  saving: boolean;
  onField: (key: string, value: unknown) => void;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const [sheetOptions, setSheetOptions] = useState<Record<string, string[]>>({});
  const [optionsError, setOptionsError] = useState("");
  useEffect(() => {
    if (definition.slug !== "cheques") return;
    const controller = new AbortController();
    void fetch(appPath("/api/process/cheques/options"), { signal: controller.signal }).then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "No pudimos cargar las listas de la planilla.");
      setSheetOptions(result.options);
    }).catch((error) => { if (!controller.signal.aborted) setOptionsError(String(error.message)); });
    return () => controller.abort();
  }, [definition.slug]);

  async function addOption(field: string, value: string) {
    const response = await fetch(appPath("/api/process/cheques/options"), {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ field, value }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message ?? "No pudimos agregar la opción.");
    setSheetOptions(result.options);
    setOptionsError("");
  }
  return (
    <div className="review-layout">
      <div className="surface-card review-card">
        <div className="review-header">
          <div className="section-heading compact">
            <span className="step-number">2</span>
            <div><h2>Revisar datos</h2><p>Corregí cualquier valor antes de guardarlo.</p></div>
          </div>
          <span className={`operation-badge ${analysis.operation}`}>
            {analysis.operation === "create" ? "Nuevo registro" : "Actualizará un registro"}
          </span>
        </div>

        {analysis.warnings.length > 0 && (
          <div className="alert warning-alert"><CircleAlert size={19} /><div><strong>Revisá estos puntos</strong>{analysis.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div></div>
        )}

        {optionsError && <div className="alert error-alert" role="alert">{optionsError}</div>}
        <div className="fields-grid">
          {definition.fields.map((field) => (
            <EditableField
              key={field.key}
              field={field}
              value={data[field.key]}
              errors={fieldErrors[field.key] ?? fieldErrors[`data.${field.key}`]}
              sheetOptions={sheetOptions[field.key]}
              onAddOption={addOption}
              onChange={(value) => onField(field.key, value)}
            />
          ))}
        </div>
      </div>

      <aside className="confirmation-panel">
        <div className="confirmation-summary">
          <FileCheck2 size={25} />
          <h3>Confirmación</h3>
          <p>Al confirmar, los datos se enviarán a la hoja correspondiente.</p>
          <dl>
            <div><dt>Módulo</dt><dd>{definition.name}</dd></div>
            <div><dt>Acción</dt><dd>{analysis.operation === "create" ? "Crear" : "Actualizar"}</dd></div>
            <div><dt>{definition.keyLabel}</dt><dd>{String(definition.slug === "remitos" && Array.isArray(data.rows) ? data.rows[0]?.["N° de Comprobante"] ?? "—" : data[definition.keyField] ?? "—")}</dd></div>
          </dl>
          <div className="no-save-note"><ShieldCheck size={18} /> Todavía no se guardó ningún cambio.</div>
        </div>
        <button className="primary-button full-width" onClick={onConfirm} disabled={saving}>
          {saving ? <LoaderCircle className="spin" size={19} /> : <Check size={19} />}
          {saving ? "Guardando…" : "Confirmar y guardar"}
        </button>
        <button className="secondary-button full-width" onClick={onBack} disabled={saving}><ArrowLeft size={18} /> Volver a cargar</button>
      </aside>
    </div>
  );
}

function EditableField({ field, value, errors, onChange, sheetOptions, onAddOption }: {
  field: FieldDefinition;
  value: unknown;
  errors?: string[];
  onChange: (value: unknown) => void;
  sheetOptions?: string[];
  onAddOption?: (field: string, value: string) => Promise<void>;
}) {
  if (field.sheetOptions) return <SheetDropdown field={field} value={String(value ?? "")} options={sheetOptions} errors={errors} onChange={onChange} onAddOption={onAddOption!} />;
  if (field.type === "sheetRows") {
    const rows = Array.isArray(value) ? value as Record<string, unknown>[] : [];
    return <div className="field-group span-full">
      <div className="array-heading"><strong>{field.label}</strong><button type="button" className="text-button" onClick={() => {
        const row = { ...rows[0], Material: "", Unid: "", Kg: "", Mts: "", Lts: "", "Precio Unitario": "" };
        onChange([...rows, row]);
      }}><Plus size={16} /> Agregar artículo</button></div>
      <div className="items-list">{rows.map((row, index) => <div className="item-row" key={index}>
        <div className="item-row-title"><strong>Artículo {index + 1}</strong><button type="button" className="icon-button danger" aria-label={`Quitar artículo ${index + 1}`} onClick={() => onChange(rows.filter((_, position) => position !== index))}><Trash2 size={16} /></button></div>
        <div className="item-fields">{REMITOS_SHEET_HEADERS.map((header) => <label key={header}>{header}
          {header === "Comprobante" ? <select value={String(row[header] ?? "")} onChange={(event) => {
            const copy = rows.map((current) => ({ ...current })); copy[index][header] = event.target.value; onChange(copy);
          }}><option value="REMITO">REMITO</option><option value="FACTURA">FACTURA</option></select> : <input
            value={String(row[header] ?? "")} readOnly={REMITOS_AUTOMATIC_HEADERS.has(header)}
            onChange={(event) => { const copy = rows.map((current) => ({ ...current })); copy[index][header] = event.target.value; onChange(copy); }} />}
        </label>)}</div>
      </div>)}</div>
      {errors?.map((message) => <small className="field-error" key={message}>{message}</small>)}
    </div>;
  }
  if (field.type === "items") {
    const items = Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
    return (
      <div className="field-group span-full">
        <div className="array-heading"><label>{field.label}</label><button type="button" className="text-button" onClick={() => onChange([...items, {}])}><Plus size={16} /> Agregar material</button></div>
        <div className="items-list">
          {items.length === 0 && <p className="empty-inline">No se detectaron materiales. Podés agregar uno manualmente.</p>}
          {items.map((item, index) => (
            <div className="item-row" key={index}>
              <div className="item-row-title"><strong>Ítem {index + 1}</strong><button type="button" className="icon-button danger" aria-label={`Quitar ítem ${index + 1}`} onClick={() => onChange(items.filter((_, position) => position !== index))}><Trash2 size={16} /></button></div>
              <div className="item-fields">
                {itemFields.map(([key, label]) => <label key={key}>{label}<input value={String(item[key] ?? "")} onChange={(event) => { const copy = items.map((current) => ({ ...current })); copy[index][key] = event.target.value; onChange(copy); }} /></label>)}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (field.type === "lines") {
    const lines = Array.isArray(value) ? value.map(String).join("\n") : String(value ?? "");
    return (
      <label className="field-group span-full">
        <span>{field.label}</span>
        <textarea rows={3} value={lines} onChange={(event) => onChange(event.target.value.split("\n").map((line) => line.trim()).filter(Boolean))} placeholder="Un endoso por línea" />
      </label>
    );
  }

  const stringValue = value === null || value === undefined ? "" : String(value);
  return (
    <label className={`field-group ${field.highlight ? "highlight-field" : ""} ${errors ? "has-error" : ""}`}>
      <span>{field.label}{field.required && <b aria-label="obligatorio"> *</b>}</span>
      {field.type === "select" ? (
        <select value={stringValue} onChange={(event) => onChange(event.target.value)} required={field.required}>
          {field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      ) : field.type === "textarea" ? (
        <textarea rows={3} value={stringValue} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input
          type={field.type === "date" ? "date" : "text"}
          inputMode={field.type === "number" ? "decimal" : undefined}
          value={stringValue}
          readOnly={field.automatic}
          onChange={(event) => onChange(event.target.value)}
          required={field.required}
          placeholder={field.placeholder}
        />
      )}
      {errors?.map((message) => <small className="field-error" key={message}>{message}</small>)}
    </label>
  );
}

function SheetDropdown({ field, value, options, errors, onChange, onAddOption }: {
  field: FieldDefinition; value: string; options?: string[]; errors?: string[];
  onChange: (value: unknown) => void; onAddOption: (field: string, value: string) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [newValue, setNewValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function saveOption() {
    const text = newValue.trim();
    if (!text || busy) return;
    setBusy(true); setError("");
    try {
      await onAddOption(field.key, text);
      onChange(text); setAdding(false); setNewValue("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No pudimos agregar la opción."); }
    finally { setBusy(false); }
  }
  return <div className="field-group">
    <label><span>{field.label}</span><select value={value} disabled={!options || busy} onChange={(event) => onChange(event.target.value)}>
      <option value="">{options ? "Elegir opción" : "Cargando opciones…"}</option>
      {value && options && !options.includes(value) && <option value={value} disabled>{value} (fuera de la lista)</option>}
      {options?.map((option) => <option key={option} value={option}>{option}</option>)}
    </select></label>
    {!adding ? <button type="button" className="text-button add-option" disabled={!options} onClick={() => setAdding(true)}><Plus size={15} /> Agregar opción</button> : <div className="new-option">
      <label><span>Nueva opción para {field.label}</span><input maxLength={100} value={newValue} disabled={busy} onChange={(event) => setNewValue(event.target.value)} /></label>
      <small>Se agregará a la lista de esta columna en Google Sheets.</small>
      <div><button className="text-button" type="button" disabled={busy || !newValue.trim()} onClick={saveOption}>{busy ? "Agregando…" : "Agregar a la lista"}</button><button className="text-button" type="button" disabled={busy} onClick={() => setAdding(false)}>Cancelar</button></div>
    </div>}
    {error && <small className="field-error" role="alert">{error}</small>}
    {errors?.map((message) => <small className="field-error" key={message}>{message}</small>)}
  </div>;
}

function SuccessStage({ definition, receipt, onRestart }: {
  definition: (typeof moduleDefinitions)[ModuleSlug];
  receipt: ConfirmResponse;
  onRestart: () => void;
}) {
  return (
    <div className="surface-card success-card">
      <span className="success-symbol"><Check size={36} /></span>
      <p className="eyebrow">OPERACIÓN COMPLETADA</p>
      <h2>{receipt.message}</h2>
      <p>La información quedó {receipt.operation === "created" ? "creada" : "actualizada"} en {definition.name}.</p>
      <div className="receipt-card"><span>{definition.keyLabel}</span><strong>{receipt.recordKey}</strong><small>Referencia: {receipt.requestId.slice(0, 8).toUpperCase()}</small></div>
      <button className="primary-button" onClick={onRestart}><RefreshCw size={18} /> Procesar otro documento</button>
      <div className="fallback-note"><span className="status-dot" /> WhatsApp continúa disponible como respaldo.</div>
    </div>
  );
}

function StepIndicator({ stage }: { stage: Stage }) {
  const current = stage === "upload" ? 1 : stage === "analyzing" ? 1 : stage === "review" || stage === "saving" ? 2 : 3;
  return (
    <ol className="step-indicator" aria-label={`Paso ${current} de 3`}>
      {["Cargar", "Revisar", "Guardar"].map((label, index) => {
        const step = index + 1;
        return <li key={label} className={step === current ? "current" : step < current ? "complete" : ""}><span>{step < current ? <Check size={14} /> : step}</span><small>{label}</small></li>;
      })}
    </ol>
  );
}

function EmptyModules() {
  return <div className="surface-card empty-modules"><ShieldCheck size={36} /><h1>No hay módulos habilitados</h1><p>Pedile al administrador que habilite al menos un tipo de documento para tu cuenta.</p></div>;
}

function readError(reason: unknown): string {
  if (reason instanceof Error) return reason.message;
  const failure = reason as ApiFailure;
  return failure?.error?.message ?? "No pudimos completar la operación. Intentá nuevamente.";
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
