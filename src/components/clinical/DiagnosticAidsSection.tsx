import { useCallback, useRef, useState } from "react";

import { useLiveQuery } from "dexie-react-hooks";

import {
  ChevronDown,
  ExternalLink,
  FileUp,
  Loader2,
  Settings2,
  Trash2,
} from "lucide-react";

import {
  CLINICAL_HISTORY_SECTION_NUMBERS,
  CLINICAL_SECTION_TITLE_CLASS,
  clinicalSectionTitle,
} from "@/constants/clinicalHistorySections";

import {
  deleteDiagnosticAid,
  listDiagnosticAidsForPatient,
  openDiagnosticFile,
  pickDiagnosticApplicationProgram,
  registerDiagnosticAid,
  registerDiagnosticAidFromBrowserFile,
  shouldOpenDiagnosticAidWithWebMenu,
  updateDiagnosticAidComments,
  updateDiagnosticAidReceivedAt,
} from "@/services/diagnosticAidService";

import {
  executeDiagnosticAidWebAction,
  type DiagnosticAidWebAction,
} from "@/services/diagnosticAidWebOpenService";

import {
  DIAGNOSTIC_AID_ACCEPT,
  DIAGNOSTIC_AID_FILE_TYPE_LABELS,
  type DiagnosticAid,
  type DiagnosticAidFileType,
} from "@/types/diagnosticAid";

import { getDesktopBridge, isDesktopApp } from "@/types/desktopBridge";

import type { UserProfile } from "@/types/user";

import {
  loadDiagnosticAidOpenerPreferences,
  saveDiagnosticAidOpenerPreference,
  type DiagnosticAidOpenerMap,
} from "@/utils/diagnosticAidOpenerPreferences";

import { isBrowserStoredDiagnosticAid } from "@/utils/diagnosticAidWebClassification";

import {
  DiagnosticAidOpenMenu,
  DiagnosticAidPreviewModal,
} from "./DiagnosticAidOpenMenu";

interface DiagnosticAidsSectionProps {
  patientId: string;

  encounterId: string;

  disabled?: boolean;

  user?: UserProfile | null;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("es-CO", {
    dateStyle: "short",

    timeStyle: "short",
  });
}

function AlertBanner({
  tone,

  message,

  onDismiss,
}: {
  tone: "error" | "success" | "info";

  message: string;

  onDismiss?: () => void;
}) {
  const toneClass =
    tone === "error"
      ? "border-red-200 bg-red-50 text-red-800"
      : tone === "success"
        ? "border-green-200 bg-green-50 text-green-800"
        : "border-sky-200 bg-sky-50 text-sky-800";

  return (
    <div
      className={`flex items-start justify-between gap-3 rounded-lg border px-3 py-2 text-sm ${toneClass}`}
    >
      <p>{message}</p>

      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 text-xs font-medium underline"
        >
          Cerrar
        </button>
      )}
    </div>
  );
}

function DiagnosticAidOpenerSettings({
  preferences,

  onChange,

  disabled,
}: {
  preferences: DiagnosticAidOpenerMap;

  onChange: (next: DiagnosticAidOpenerMap) => void;

  disabled?: boolean;
}) {
  const fileTypes = Object.keys(
    DIAGNOSTIC_AID_FILE_TYPE_LABELS,
  ) as DiagnosticAidFileType[];

  const handlePick = async (fileType: DiagnosticAidFileType) => {
    const picked = await pickDiagnosticApplicationProgram();

    if (!picked.ok || !picked.preference) return;

    onChange(saveDiagnosticAidOpenerPreference(fileType, picked.preference));
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Settings2 className="h-4 w-4 text-slate-500" />

        <h4 className="text-sm font-semibold text-slate-700">
          Programas para abrir archivos
        </h4>
      </div>

      <p className="mb-3 text-xs text-slate-500">
        Configure el visor o software de su equipo para cada tipo de archivo. Al
        pulsar &quot;Abrir&quot;, se usará el programa asignado; si no hay
        ninguno, se usará el predeterminado de Windows.
      </p>

      <div className="space-y-2">
        {fileTypes.map((fileType) => {
          const preference = preferences[fileType];

          return (
            <div
              key={fileType}

              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-700">
                  {DIAGNOSTIC_AID_FILE_TYPE_LABELS[fileType]}
                </p>

                <p
                  className="truncate text-[10px] text-slate-500"
                  title={preference?.programPath}
                >
                  {preference?.programName ??
                    "Programa predeterminado del sistema"}
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"

                  disabled={disabled}

                  onClick={() => void handlePick(fileType)}

                  className="rounded-lg border border-dental-200 px-2.5 py-1 text-[11px] font-medium text-dental-800 hover:bg-dental-50 disabled:opacity-50"
                >
                  Elegir programa
                </button>

                {preference && (
                  <button
                    type="button"

                    disabled={disabled}

                    onClick={() =>
                      onChange(
                        saveDiagnosticAidOpenerPreference(fileType, null),
                      )
                    }

                    className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Quitar
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DiagnosticAidCard({
  item,

  disabled,

  openingId,

  onOpenNative,

  onOpenWebMenu,

  onOpenWithPicker,

  onDelete,

  onCommentsChange,

  preferredProgramName,
}: {
  item: DiagnosticAid;

  disabled?: boolean;

  openingId: string | null;

  onOpenNative: (id: string) => void;

  onOpenWebMenu: (item: DiagnosticAid) => void;

  onOpenWithPicker: (id: string) => void;

  onDelete: (id: string) => void;

  onCommentsChange: (id: string, comments: string) => void;

  preferredProgramName?: string | null;
}) {
  const isOpening = openingId === item.id;

  const useWebMenu = shouldOpenDiagnosticAidWithWebMenu(item);

  const browserStored = isBrowserStoredDiagnosticAid(item);

  return (
    <article className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className="truncate text-sm font-semibold text-slate-800"
            title={item.fileName}
          >
            {item.fileName}
          </p>

          <p className="mt-1 text-xs text-slate-500">
            Recepción: {formatDate(item.receivedAt ?? item.createdAt)}
          </p>

          <p className="mt-1 text-xs text-slate-500">
            Alta: {formatDate(item.createdAt)}
          </p>
        </div>

        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
          {DIAGNOSTIC_AID_FILE_TYPE_LABELS[item.fileType]}
        </span>
      </div>

      <p
        className="truncate font-mono text-[10px] text-slate-400"
        title={item.absolutePath}
      >
        {browserStored ? "Almacenado en este navegador" : item.absolutePath}
      </p>

      <p className="font-mono text-[10px] text-slate-400" title={item.fileHash}>
        SHA-256: {item.fileHash.slice(0, 16)}…
      </p>

      {preferredProgramName && !useWebMenu && (
        <p className="text-[10px] text-dental-700">
          Programa asignado:{" "}
          <span className="font-medium">{preferredProgramName}</span>
        </p>
      )}

      {!disabled && (
        <textarea
          rows={2}

          value={item.comments}

          onChange={(event) => onCommentsChange(item.id, event.target.value)}

          onBlur={(event) => onCommentsChange(item.id, event.target.value)}

          placeholder="Comentarios clínicos (opcional)…"

          className="input-field resize-y text-xs"
        />
      )}

      {disabled && item.comments && (
        <p className="text-xs text-slate-600">{item.comments}</p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"

          disabled={disabled || isOpening}

          onClick={() =>
            useWebMenu ? onOpenWebMenu(item) : onOpenNative(item.id)
          }

          className="inline-flex items-center gap-1.5 rounded-lg bg-dental-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-dental-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isOpening ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ExternalLink className="h-3.5 w-3.5" />
          )}
          Abrir
        </button>

        {isDesktopApp() && !useWebMenu && (
          <button
            type="button"

            disabled={disabled || isOpening}

            onClick={() => onOpenWithPicker(item.id)}

            className="inline-flex items-center gap-1.5 rounded-lg border border-dental-200 px-3 py-1.5 text-xs font-medium text-dental-800 hover:bg-dental-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ChevronDown className="h-3.5 w-3.5" />
            Elegir programa…
          </button>
        )}

        {!disabled && (
          <button
            type="button"

            onClick={() => onDelete(item.id)}

            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Quitar
          </button>
        )}
      </div>
    </article>
  );
}

export function DiagnosticAidsSection({
  patientId,

  encounterId,

  disabled = false,

  user = null,
}: DiagnosticAidsSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);

  const [openingId, setOpeningId] = useState<string | null>(null);

  const [webMenuItem, setWebMenuItem] = useState<DiagnosticAid | null>(null);

  const [preview, setPreview] = useState<{
    fileName: string;

    url: string;

    kind: "image" | "pdf";
  } | null>(null);

  const [showOpenerSettings, setShowOpenerSettings] = useState(false);

  const [openerPreferences, setOpenerPreferences] =
    useState<DiagnosticAidOpenerMap>(() =>
      loadDiagnosticAidOpenerPreferences(),
    );

  const [banner, setBanner] = useState<{
    tone: "error" | "success" | "info";

    message: string;
  } | null>(null);

  const [receivedAtDate, setReceivedAtDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );

  const items = useLiveQuery(
    () => listDiagnosticAidsForPatient(patientId),

    [patientId],

    [] as DiagnosticAid[],
  );

  const handleUploadElectron = useCallback(async () => {
    const bridge = getDesktopBridge();

    if (!bridge?.isElectron) return;

    setUploading(true);

    setBanner(null);

    try {
      const picked = await bridge.pickDiagnosticFile();

      if (!picked) return;

      await registerDiagnosticAid({
        patientId,

        encounterId,

        absolutePath: picked.absolutePath,

        fileName: picked.fileName,

        receivedAt: new Date(`${receivedAtDate}T12:00:00`).toISOString(),

        user,
      });

      setBanner({
        tone: "success",

        message: `Archivo registrado: ${picked.fileName}`,
      });
    } catch (error) {
      setBanner({
        tone: "error",

        message:
          error instanceof Error
            ? error.message
            : "No se pudo registrar el archivo.",
      });
    } finally {
      setUploading(false);
    }
  }, [patientId, encounterId, user, receivedAtDate]);

  const handleUploadBrowser = useCallback(
    async (file: File) => {
      setUploading(true);

      setBanner(null);

      try {
        await registerDiagnosticAidFromBrowserFile(file, {
          patientId,

          encounterId,

          receivedAt: new Date(`${receivedAtDate}T12:00:00`).toISOString(),

          user,
        });

        setBanner({
          tone: "success",

          message: `Archivo registrado: ${file.name}`,
        });
      } catch (error) {
        setBanner({
          tone: "error",

          message:
            error instanceof Error
              ? error.message
              : "No se pudo registrar el archivo.",
        });
      } finally {
        setUploading(false);

        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },

    [patientId, encounterId, user, receivedAtDate],
  );

  const handleOpenNative = useCallback(
    async (id: string, pickProgram = false) => {
      setOpeningId(id);

      setBanner(null);

      try {
        const result = await openDiagnosticFile(id, user, {
          pickProgram,
          rememberProgram: true,
        });

        if (pickProgram && result.ok) {
          setOpenerPreferences(loadDiagnosticAidOpenerPreferences());
        }

        if (result.ok) {
          setBanner({ tone: "success", message: result.message });
        } else if (!result.message.includes("menú de apertura web")) {
          setBanner({ tone: "error", message: result.message });
        }
      } finally {
        setOpeningId(null);
      }
    },

    [user],
  );

  const handleWebAction = useCallback(
    async (action: DiagnosticAidWebAction) => {
      if (!webMenuItem) return;

      setOpeningId(webMenuItem.id);

      setBanner(null);

      try {
        const result = await executeDiagnosticAidWebAction(
          webMenuItem,
          action,
          user,
        );

        if (result.previewUrl && result.previewKind) {
          setPreview({
            fileName: webMenuItem.fileName,

            url: result.previewUrl,

            kind: result.previewKind,
          });

          setWebMenuItem(null);
        }

        setBanner({
          tone: result.ok ? "success" : "error",

          message: result.message,
        });

        if (result.ok && action !== "preview_media") {
          setWebMenuItem(null);
        }
      } finally {
        setOpeningId(null);
      }
    },

    [user, webMenuItem],
  );

  const handleCommentsChange = useCallback(
    async (id: string, comments: string) => {
      await updateDiagnosticAidComments(id, comments);
    },
    [],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteDiagnosticAid(id, user);
    },

    [user],
  );

  const handlePickFile = () => {
    if (isDesktopApp()) {
      void handleUploadElectron();

      return;
    }

    fileInputRef.current?.click();
  };

  const closePreview = () => {
    if (preview?.url) {
      URL.revokeObjectURL(preview.url);
    }

    setPreview(null);
  };

  return (
    <section id="clinical-section-examenes" className="card space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className={CLINICAL_SECTION_TITLE_CLASS}>
            {clinicalSectionTitle(
              CLINICAL_HISTORY_SECTION_NUMBERS.examenesComplementarios,

              "Exámenes Complementarios y Escaneos",
            )}
          </h3>

          <p className="mt-1 text-sm text-slate-500">
            Adjunte DICOM, escaneos STL/PLY/OBJ e imágenes en cualquier momento.
            Quedan vinculados a la fecha de recepción, sin que una evolución
            firmada bloquee el expediente (Res. 1995/1999).
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="label-field mb-1">Fecha de recepción</label>
            <input
              type="date"
              value={receivedAtDate}
              onChange={(event) => setReceivedAtDate(event.target.value)}
              className="input-field py-2 text-sm"
            />
          </div>
          {isDesktopApp() && !disabled && (
            <button
              type="button"

              onClick={() => setShowOpenerSettings((value) => !value)}

              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Settings2 className="h-4 w-4" />
              Programas
            </button>
          )}

          {!disabled && (
            <button
              type="button"

              onClick={handlePickFile}

              disabled={uploading}

              className="inline-flex items-center gap-2 rounded-lg bg-dental-600 px-4 py-2 text-sm font-semibold text-white hover:bg-dental-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileUp className="h-4 w-4" />
              )}
              Cargar archivo
            </button>
          )}
        </div>
      </div>

      {isDesktopApp() && showOpenerSettings && (
        <DiagnosticAidOpenerSettings
          preferences={openerPreferences}

          onChange={setOpenerPreferences}

          disabled={disabled}
        />
      )}

      <input
        ref={fileInputRef}

        type="file"

        accept={DIAGNOSTIC_AID_ACCEPT}

        className="hidden"

        onChange={(event) => {
          const file = event.target.files?.[0];

          if (file) void handleUploadBrowser(file);
        }}
      />

      {banner && (
        <AlertBanner
          tone={banner.tone}

          message={banner.message}

          onDismiss={() => setBanner(null)}
        />
      )}

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center">
          <p className="text-sm text-slate-500">
            Sin archivos registrados en el expediente del paciente.
          </p>

          {!disabled && (
            <p className="mt-1 text-xs text-slate-400">
              Use &quot;Cargar archivo&quot; para registrar un estudio o
              escaneo.
            </p>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <DiagnosticAidCard
              key={item.id}

              item={item}

              disabled={disabled}

              openingId={openingId}

              onOpenNative={(id) => void handleOpenNative(id)}

              onOpenWebMenu={setWebMenuItem}

              onOpenWithPicker={(id) => void handleOpenNative(id, true)}

              onDelete={handleDelete}

              onCommentsChange={handleCommentsChange}

              preferredProgramName={
                openerPreferences[item.fileType]?.programName
              }
            />
          ))}
        </div>
      )}

      {webMenuItem && (
        <DiagnosticAidOpenMenu
          item={webMenuItem}
          open
          busy={openingId === webMenuItem.id}
          onClose={() => setWebMenuItem(null)}
          onSelect={(action) => void handleWebAction(action)}
        />
      )}

      <DiagnosticAidPreviewModal
        open={preview != null}

        fileName={preview?.fileName ?? ""}

        previewUrl={preview?.url ?? null}

        previewKind={preview?.kind ?? "image"}

        onClose={closePreview}
      />
    </section>
  );
}
