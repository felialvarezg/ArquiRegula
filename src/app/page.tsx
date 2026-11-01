"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Building2, FileText, Send, Plus, FileCheck, Search, Bot, User, Loader2, Menu, ExternalLink, Sparkles, BookOpen, Globe2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { useToast, toast } from "@/hooks/use-toast";
import { DocumentType, DOCUMENT_TYPES } from "@/lib/rag/prompts";
import { escapeHtml } from "@/lib/sanitize";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: { id: string; title: string; source?: string; article?: string; url?: string | null; score: number }[];
  webSources?: { title: string; url: string; snippet: string; hostName: string }[];
  toolsUsed?: string[];
  flowId?: string | null;
}

interface CaseDataField {
  key: string;
  label: string;
  placeholder: string;
  type?: "text" | "number" | "textarea";
  required?: boolean;
}

interface SessionDoc {
  id: string;
  type: string;
  title: string;
  content: string;
  metadata: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------
const DOCUMENT_TYPE_OPTIONS: { value: string; label: string; description: string }[] = [
  { value: "memoria_explicativa", label: "Memoria Explicativa", description: "Explica qué se hizo y por qué para regularizar la obra." },
  { value: "checklist_dom", label: "Checklist DOM", description: "Lista de requisitos y trámites para la DOM." },
  { value: "formulario_unico", label: "Formulario Único", description: "Datos estructurados para el trámite municipal." },
  { value: "dictamen_previo", label: "Dictamen Previo", description: "Opinión técnica previa ante la DOM." },
];

const CASE_DATA_FIELDS: CaseDataField[] = [
  { key: "propietario", label: "Propietario", placeholder: "Nombre y apellido del propietario", required: true },
  { key: "comuna", label: "Comuna", placeholder: "Ej. Ñuñoa, Providencia, Santiago", required: true },
  { key: "rolAvaluo", label: "Rol de avalúo", placeholder: "Ej. 1234-56" },
  { key: "direccion", label: "Dirección del predio", placeholder: "Dirección completa del inmueble" },
  { key: "tipoObra", label: "Tipo de obra", placeholder: "Ej. adquisición, construcción nueva, ampliación, reforma" },
  { key: "superficie", label: "Superficie construida (m²)", placeholder: "Número", type: "number" },
  { key: "fechaConstruccion", label: "Fecha aproximada de construcción", placeholder: "YYYY-MM-DD" },
  { key: "destino", label: "Destino o uso actual", placeholder: "Ej. vivienda, oficina, tienda" },
  { key: "descripcion", label: "Descripción de la obra y antecedentes", placeholder: "Detallar lo que se hará/ya hace" },
  { key: "pisos", label: "Número de pisos", placeholder: "Cantidad", type: "number" },
  { key: "materiales", label: "Materiales predominantes", placeholder: "Ej. ladrillo, concreto, madera" },
  { key: "planRegulador", label: "Zonificación del plan regulador", placeholder: "Ej. RSUT, RSCP, TD, sectores urbanos" },
  { key: "observaciones", label: "Observaciones adicionales", placeholder: "Cualquier información relevante" },
];

const FLOW_OPTIONS = [
  { value: "dictamen_previo", label: "Dictamen previo" },
  { value: "checklist_supervision", label: "Checklist de supervisión" },
  { value: "verificacion_dominio", label: "Verificación de dominio" },
  { value: "externalizacion_uso", label: "Cambio de uso" },
  { value: "reclasificacion_suelo", label: "Reclasificación de suelo" },
  { value: "verificacion_normativa", label: "Verificación normativa" },
];

const FLOW_REQUIRED_FIELDS: Record<string, string[]> = {
  dictamen_previo: ["propietario", "comuna", "direccion", "tipoObra"],
  checklist_supervision: ["comuna", "tipoObra"],
  verificacion_dominio: ["propietario", "comuna", "direccion"],
  externalizacion_uso: ["comuna", "codigoEdificacion", "zonaUsoActual", "zonaUsoNueva"],
  reclasificacion_suelo: ["comuna", "codigoEdificacion", "zonaUso", "sueloAnterior", "sueloNuevo"],
  verificacion_normativa: ["comuna", "temaNormativo"],
};

const FLOW_EXTRA_FIELDS: Record<string, CaseDataField> = {
  codigoEdificacion: { key: "codigoEdificacion", label: "Código de edificación", placeholder: "Ej. CIP, permiso o recepción" },
  zonaUsoActual: { key: "zonaUsoActual", label: "Uso de suelo actual", placeholder: "Ej. residencial" },
  zonaUsoNueva: { key: "zonaUsoNueva", label: "Uso de suelo propuesto", placeholder: "Ej. comercial" },
  zonaUso: { key: "zonaUso", label: "Zona de uso", placeholder: "Zona definida por el plan regulador" },
  sueloAnterior: { key: "sueloAnterior", label: "Clasificación de suelo actual", placeholder: "Clasificación vigente" },
  sueloNuevo: { key: "sueloNuevo", label: "Clasificación de suelo propuesta", placeholder: "Clasificación solicitada" },
  temaNormativo: { key: "temaNormativo", label: "Tema normativo", placeholder: "Ej. modificación reciente de la OGUC" },
};

function parseStoredEvidence(value: string | null) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return { sources: parsed };
    return {
      sources: Array.isArray(parsed.rag) ? parsed.rag : [],
      webSources: Array.isArray(parsed.web) ? parsed.web : [],
      flowId: typeof parsed.flowId === "string" ? parsed.flowId : null,
    };
  } catch {
    return {};
  }
}

function isSafeExternalUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Página principal del agente de regularización de obras
// ---------------------------------------------------------------------------
export default function Page() {
  // --- Estado del chat ---
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flowId, setFlowId] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);

  // --- Document generation ---
  const [docType, setDocType] = useState("memoria_explicativa");
  const [caseData, setCaseData] = useState<Record<string, string>>(CASE_DATA_FIELDS.reduce((acc, f) => ({ ...acc, [f.key]: "" }), {}));
  const [generating, setGenerating] = useState(false);
  const [generatedDoc, setGeneratedDoc] = useState<any>(null);

  // --- Sesiones y documentos ---
  const [sessions, setSessions] = useState<any[]>([]);
  const [documents, setDocuments] = useState<SessionDoc[]>([]);
  const [sessionLoading, setSessionLoading] = useState(false);

  // --- Web search ---
  const [webQuery, setWebQuery] = useState("");
  const [webResults, setWebResults] = useState<any[]>([]);
  const [webLoading, setWebLoading] = useState(false);

  // --- Toasts ---
  const { toast } = useToast();

  // ---------------------------------------------------------------------------
  // Cargar sesiones y documentos
  // ---------------------------------------------------------------------------
  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/sessions");
      const data = await res.json();
      if (res.ok) setSessions(data.sessions || []);
    } catch {
      toast({ variant: "destructive", description: "No se pudieron cargar las sesiones." });
    }
  }, []);

  const fetchDocuments = useCallback(async () => {
    if (!sessionId) return;
    try {
      const res = await fetch(`/api/sessions/${sessionId}/documents`);
      const data = await res.json();
      if (res.ok) setDocuments(data.documents || []);
    } catch {
      toast({ variant: "destructive", description: "No se pudieron cargar los documentos." });
    }
  }, [sessionId]);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);
  useEffect(() => { fetchDocuments(); }, [sessionId, fetchDocuments]);
  useEffect(() => {
    if (!sessionId) {
      setMessages([]);
      setSessionLoading(false);
      return;
    }
    let active = true;
    setMessages([]);
    setSessionLoading(true);
    fetch(`/api/sessions/${sessionId}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "No se pudo abrir la sesión.");
        if (!active) return;
        setMessages((data.session?.messages || []).map((message: { role: Message["role"]; content: string; sources: string | null; toolsUsed: string | null }) => {
          const evidence = parseStoredEvidence(message.sources);
          let toolsUsed: string[] = [];
          try { toolsUsed = message.toolsUsed ? JSON.parse(message.toolsUsed) : []; } catch { toolsUsed = []; }
          return { role: message.role, content: message.content, ...evidence, toolsUsed };
        }));
      })
      .catch((err) => {
        if (active) toast({ variant: "destructive", description: err.message || "No se pudo abrir la sesión." });
      })
      .finally(() => { if (active) setSessionLoading(false); });
    return () => { active = false; };
  }, [sessionId, toast]);

  // ---------------------------------------------------------------------------
  // Chat
  // ---------------------------------------------------------------------------
  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || loading || sessionLoading) return;
    const missingFields = (FLOW_REQUIRED_FIELDS[flowId] || []).filter((field) => !String(caseData[field] || "").trim());
    if (missingFields.length > 0) {
      const labels = missingFields.map((field) => FLOW_EXTRA_FIELDS[field]?.label || CASE_DATA_FIELDS.find((item) => item.key === field)?.label || field);
      toast({ variant: "destructive", description: `Completa estos antecedentes del caso: ${labels.join(", ")}.` });
      return;
    }
    setInput("");
    setError(null);
    setMessages((prev) => [...prev, { role: "user", content: text }]);

    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, sessionId, flowId: flowId || undefined, caseData }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo procesar la consulta");
      setSessionId(data.sessionId || sessionId);
      setMessages((prev) => [...prev, { role: "assistant", content: data.response, sources: data.sources, webSources: data.webSources, toolsUsed: data.toolsUsed, flowId: data.flowId }]);
      fetchSessions();
    } catch (err: any) {
      setError(err.message || "Error desconocido");
      setMessages((prev) => [...prev, { role: "assistant", content: "❌ " + err.message }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, sessionLoading, sessionId, flowId, caseData, fetchSessions, toast]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // ---------------------------------------------------------------------------
  // Generación de documentos
  // ---------------------------------------------------------------------------
  const generateDocument = useCallback(async () => {
    if (!caseData.propietario || !caseData.comuna) {
      toast({ variant: "destructive", description: "Completa al menos propietario y comuna." });
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch("/api/generate-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: docType, caseData, sessionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo generar el documento");
      setGeneratedDoc(data.document);
      toast({ variant: "success", description: `Documento "${data.label}" generado.` });
      if (!sessionId) {
        setSessionId(data.document.sessionId || null);
        fetchSessions();
      }
      fetchDocuments();
    } catch (err: any) {
      toast({ variant: "destructive", description: err.message || "Error al generar el documento." });
    } finally {
      setGenerating(false);
    }
  }, [docType, caseData, sessionId]);

  // Mostrar modo edición si hay un documento recién generado
  const isEditing = !!generatedDoc;
  const activeFlowExtraFields = (FLOW_REQUIRED_FIELDS[flowId] || [])
    .map((field) => FLOW_EXTRA_FIELDS[field])
    .filter((field): field is CaseDataField => Boolean(field));

  // ---------------------------------------------------------------------------
  // Web search
  // ---------------------------------------------------------------------------
  const searchWeb = useCallback(async () => {
    const q = webQuery.trim();
    if (!q) return;
    setWebLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/web-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, num: 5 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo buscar.");
      setWebResults(data.results || []);
      if (sessionId) {
        setMessages((prev) => [...prev, { role: "assistant", content: `🌐 Resultados de búsqueda web (${data.results?.length || 0}):` }]);
      }
    } catch (err: any) {
      setError(err.message || "Error en la búsqueda.");
    } finally {
      setWebLoading(false);
    }
  }, [webQuery, sessionId]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-background text-foreground">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Sidebar izquierdo: historial de sesiones y documentos */}
        <aside className="hidden w-[292px] shrink-0 border-r border-border/60 bg-muted/30 p-4 overflow-y-auto md:block">
          <div className="flex items-center gap-2 mb-4">
            <Building2 className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Historial</h2>
          </div>

          {/* Sesiones */}
          <div className="mb-4">
            <h3 className="text-xs font-medium text-muted-foreground mb-2">Sesiones</h3>
            <div className="space-y-1">
              {sessions.length === 0 && <p className="text-xs text-muted-foreground">Sin sesiones. Empieza a chatear.</p>}
              {sessions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSessionId(s.id)}
                  disabled={loading}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${sessionId === s.id ? "bg-primary/10 text-primary" : "hover:bg-secondary/50 text-foreground"}`}
                >
                  <div className="font-medium truncate">{s.title || "Nueva consulta"}</div>
                  <div className="text-xs text-muted-foreground">
                    {s.updatedAt ? new Date(s.updatedAt).toLocaleDateString("es-ES", { day: "2-digit", month: "short" }) : ""}
                  </div>
                </button>
              ))}
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start mt-2 text-primary"
                onClick={() => { setSessionId(null); setMessages([]); setFlowId(""); }}
                disabled={loading}
              >
                <Plus className="h-4 w-4 mr-2" /> Nueva sesión
              </Button>
            </div>
          </div>

          {/* Documentos de la sesión activa */}
          {sessionId && (
            <div className="mb-4">
              <h3 className="text-xs font-medium text-muted-foreground mb-2">Documentos ({documents.length})</h3>
              <div className="space-y-1">
                {documents.map((d) => (
                  <Link key={d.id} href={`/sessions/${sessionId}/documents/${d.id}`} className="block w-full text-left px-3 py-2 rounded-md text-sm transition-colors hover:bg-secondary/50">
                      <div className="font-medium truncate">{d.title}</div>
                      <div className="text-xs text-muted-foreground">{d.type} · {d.createdAt ? new Date(d.createdAt).toLocaleString("es-ES") : ""}</div>
                  </Link>
                ))}
                {documents.length === 0 && <p className="text-xs text-muted-foreground">Sin documentos. Genera uno arriba.</p>}
              </div>
            </div>
          )}
        </aside>

        {/* Contenido principal */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Barra de herramientas */}
          <div className="border-b border-border/60 bg-background/90 px-4 py-3 flex flex-wrap items-center gap-3 sm:px-6">
            <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="icon" className="md:hidden" aria-label="Abrir historial"><Menu className="h-4 w-4" /></Button>
              </DialogTrigger>
              <DialogContent className="max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Historial</DialogTitle>
                  <DialogDescription>Retoma un análisis o inicia uno nuevo.</DialogDescription>
                </DialogHeader>
                <div className="space-y-1">
                  {sessions.map((s) => (
                    <button key={s.id} onClick={() => { setSessionId(s.id); setHistoryOpen(false); }} disabled={loading} className={`w-full rounded-md px-3 py-3 text-left text-sm transition-colors disabled:opacity-50 ${sessionId === s.id ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}>
                      <span className="block truncate font-medium">{s.title || "Nueva consulta"}</span>
                      <span className="text-xs text-muted-foreground">{s.updatedAt ? new Date(s.updatedAt).toLocaleDateString("es-CL", { day: "2-digit", month: "short" }) : ""}</span>
                    </button>
                  ))}
                  <Button variant="ghost" className="w-full justify-start" onClick={() => { setSessionId(null); setMessages([]); setFlowId(""); setHistoryOpen(false); }} disabled={loading}><Plus className="mr-2 h-4 w-4" /> Nueva sesión</Button>
                </div>
              </DialogContent>
            </Dialog>
            <h1 className="text-base font-semibold flex items-center gap-2 sm:text-lg">
              <Bot className="h-5 w-5 text-primary" />
              Agente de regularización
            </h1>
            <div className="hidden flex-1 items-center gap-2 text-xs text-muted-foreground sm:flex">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Normativa LGUC/OGUC · fuentes trazables
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* Sección de chat */}
            <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:px-6 sm:py-8">
              {messages.length === 0 && !sessionLoading && (
                <div className="rounded-xl border border-border/70 bg-card px-5 py-8 sm:px-8">
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Building2 className="h-5 w-5" /></div>
                  <h2 className="text-2xl font-semibold tracking-tight">¿Qué necesitas regularizar?</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Consulta requisitos, revisa normativa chilena o prepara un documento. El agente mostrará las fuentes que utilizó en cada respuesta.</p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {["¿Qué documentos pide la DOM para regularizar una ampliación?", "¿Qué exige la OGUC para una vivienda existente?"].map((suggestion) => (
                      <button key={suggestion} onClick={() => setInput(suggestion)} className="rounded-full border border-border px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-muted hover:text-foreground">{suggestion}</button>
                    ))}
                  </div>
                </div>
              )}
              {sessionLoading && <div className="text-sm text-muted-foreground">Cargando conversación…</div>}
              {/* Mensajes */}
              <div className="space-y-3">
                {messages.map((msg, i) => (
                  <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`flex gap-2 max-w-[85%] ${msg.role === "user" ? "flex-row items-end" : "flex-row items-start"}`}>
                      <Avatar className="h-8 w-8 hidden sm:flex">
                        <AvatarFallback className={msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}>
                          {msg.role === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                        </AvatarFallback>
                      </Avatar>
                      <Card className={`rounded-xl px-4 py-3 shadow-sm ${msg.role === "user" ? "bg-primary text-primary-foreground border-0" : "bg-card border border-border/50"}`}>
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                        {msg.sources && msg.sources.length > 0 && (
                          <div className="mt-2 space-y-1 text-xs text-muted-foreground border-t pt-2">
                            <div className="flex items-center gap-1.5 font-medium text-xs"><BookOpen className="h-3.5 w-3.5" /> Normativa consultada</div>
                            {msg.sources.slice(0, 3).map((s) => (
                              <div key={s.id} className="flex items-center gap-1 truncate">
                                <span aria-hidden="true">•</span>
                                {isSafeExternalUrl(s.url) ? <a href={s.url} target="_blank" rel="noopener noreferrer" className="truncate underline-offset-2 hover:underline">{s.title}</a> : <span className="truncate">{s.title}</span>}
                                {s.article && <span className="shrink-0">· {s.article}</span>}
                              </div>
                            ))}
                          </div>
                        )}
                        {msg.webSources && msg.webSources.length > 0 && (
                          <div className="mt-2 space-y-1 text-xs text-muted-foreground border-t pt-2">
                            <div className="flex items-center gap-1.5 font-medium text-xs"><Globe2 className="h-3.5 w-3.5" /> Fuentes web</div>
                            {msg.webSources.slice(0, 3).map((w) => (
                              isSafeExternalUrl(w.url)
                                ? <a key={w.url} href={w.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 truncate underline-offset-2 hover:underline"><span aria-hidden="true">•</span><span className="truncate">{w.title}</span><ExternalLink className="h-3 w-3 shrink-0" /></a>
                                : <span key={w.url} className="truncate">{w.title}</span>
                            ))}
                          </div>
                        )}
                        {msg.toolsUsed && msg.toolsUsed.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-1.5 border-t pt-2" aria-label="Herramientas utilizadas">
                            {msg.toolsUsed.map((tool) => <Badge key={tool} variant="secondary" className="text-xs font-normal">{tool.replaceAll("_", " ")}</Badge>)}
                          </div>
                        )}
                        {msg.flowId && <div className="mt-2 flex items-center gap-1 text-xs font-medium text-primary"><Sparkles className="h-3 w-3" /> Flujo: {FLOW_OPTIONS.find((flow) => flow.value === msg.flowId)?.label || msg.flowId}</div>}
                      </Card>
                    </div>
                  </div>
                ))}
                {error && <div className="text-sm text-destructive">{error}</div>}
                {loading && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Procesando...
                  </div>
                )}
              </div>

              {/* Input */}
              <div className="rounded-xl border border-border/70 bg-card p-2 shadow-sm focus-within:ring-2 focus-within:ring-ring/30">
                <div className="flex items-center gap-2 px-2 pb-2">
                  <label htmlFor="workflow" className="text-xs font-medium text-muted-foreground">Modo</label>
                  <select id="workflow" value={flowId} onChange={(event) => setFlowId(event.target.value)} className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <option value="">Consulta libre</option>
                    {FLOW_OPTIONS.map((flow) => <option key={flow.value} value={flow.value}>{flow.label}</option>)}
                  </select>
                  {flowId && <span className="hidden text-xs text-muted-foreground sm:inline">Completa los antecedentes requeridos del caso</span>}
                </div>
              <div className="flex items-end gap-2">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder="Describe tu consulta o el caso que quieres revisar…"
                  aria-label="Consulta para el agente"
                  className="min-h-[54px] flex-1 resize-y border-0 shadow-none focus-visible:ring-0"
                  disabled={loading || sessionLoading}
                />
                <Button
                  onClick={sendMessage}
                  disabled={!input.trim() || loading || sessionLoading}
                  className="btn-glow"
                  size="icon"
                  aria-label={loading ? "Procesando consulta" : "Enviar consulta"}
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
                <p className="px-2 pt-1 text-xs text-muted-foreground">Enter para enviar · Shift + Enter para una nueva línea</p>
              </div>
            </div>

            {/* Sección: Generación de documentos */}
            <section className="max-w-3xl mx-auto px-4 py-6">
              <Card className="border-border/60">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileCheck className="h-5 w-5 text-primary" />
                    Generar documento de regularización
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Respuesta del agente con la documentación correspondiente al caso.
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Tipo de documento */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {DOCUMENT_TYPE_OPTIONS.map((t) => (
                      <button
                        key={t.value}
                        onClick={() => setDocType(t.value)}
                        className={`text-left rounded-lg border p-3 transition-all ${docType === t.value ? "border-primary/50 bg-primary/5 ring-1 ring-primary/30" : "hover:border-primary/30"}`}
                      >
                        <div className="text-sm font-medium">{t.label}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{t.description}</div>
                      </button>
                    ))}
                  </div>

                  {/* Datos del caso */}
                  <div>
                    <h4 className="text-sm font-medium text-foreground mb-2">Datos del caso</h4>
                    {activeFlowExtraFields.length > 0 && (
                      <div className="mb-4 rounded-lg bg-muted/70 p-3">
                        <p className="mb-3 text-xs font-medium text-foreground">Antecedentes requeridos para este flujo</p>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          {activeFlowExtraFields.map((field) => (
                            <div key={field.key}>
                              <label htmlFor={`case-${field.key}`} className="mb-1 block text-xs font-medium text-muted-foreground">{field.label}<span className="ml-1 text-destructive" aria-hidden="true">*</span></label>
                              <input id={`case-${field.key}`} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" placeholder={field.placeholder} value={caseData[field.key] || ""} onChange={(event) => setCaseData((prev) => ({ ...prev, [field.key]: event.target.value }))} aria-required="true" />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {CASE_DATA_FIELDS.map((f) => (
                        <div key={f.key}>
                          <label htmlFor={`case-${f.key}`} className="text-xs font-medium text-muted-foreground mb-1 block">{f.label}{f.required && <span className="ml-1 text-destructive" aria-hidden="true">*</span>}</label>
                          {f.type === "textarea" ? (
                            <textarea
                              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                              id={`case-${f.key}`}
                              placeholder={f.placeholder}
                              value={caseData[f.key] || ""}
                              onChange={(e) => setCaseData((prev) => ({ ...prev, [f.key]: e.target.value }))}
                              rows={f.key === "descripcion" ? 4 : 2}
                              aria-required={f.required || undefined}
                            />
                          ) : (
                            <input
                              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                              id={`case-${f.key}`}
                              placeholder={f.placeholder}
                              value={caseData[f.key] || ""}
                              onChange={(e) => setCaseData((prev) => ({ ...prev, [f.key]: e.target.value }))}
                              type={f.type || "text"}
                              aria-required={f.required || undefined}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <Button
                    onClick={generateDocument}
                    disabled={generating || !caseData.propietario || !caseData.comuna}
                    className="btn-glow"
                  >
                    {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck className="h-4 w-4" />}
                    {generating ? "Generando..." : `Generar ${DOCUMENT_TYPES[docType].label}`}
                  </Button>
                </CardContent>
              </Card>
            </section>

            {/* Sección: Búsqueda web */}
            <section className="max-w-3xl mx-auto px-4 py-6">
              <Card className="border-border/60">
                <CardHeader>
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Search className="h-4 w-4" />
                    Búsqueda web externa
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Consulta fuentes actualizadas (BCN, MINVU, municipios, etc.).
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex gap-2">
                    <Input
                      value={webQuery}
                      onChange={(e) => setWebQuery(e.target.value)}
                      placeholder="Ej. ¿cuáles son los requisitos para construir sin permiso en Ñuñoa?"
                      className="flex-1"
                    />
                    <Button onClick={searchWeb} disabled={!webQuery.trim() || webLoading}>
                      {webLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    </Button>
                  </div>
                  {webResults.length > 0 && (
                    <div className="space-y-2">
                      {webResults.map((r, i) => (
                        <Card key={i} className="border-border/60">
                          <CardContent className="p-3">
                            <a href={r.url} target="_blank" rel="noopener" className="text-sm font-medium hover:underline truncate block">{r.title}</a>
                            <p className="text-xs text-muted-foreground truncate">{r.snippet}</p>
                            <p className="text-xs text-primary">{r.hostName}</p>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </section>

            {/* Sección: Detalle del documento generado */}
            {isEditing && generatedDoc && (
              <section className="max-w-3xl mx-auto px-4 py-6">
                <Card className="border-border/60">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-primary" />
                      Documento generado
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Tipo: <Badge>{generatedDoc.type}</Badge> · Generado: {generatedDoc.createdAt ? new Date(generatedDoc.createdAt).toLocaleString("es-ES") : ""}
                    </ p>
                  </CardHeader>
                  <CardContent className="prose-agent max-h-[500px] overflow-y-auto">
                    <div
                      className="prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: escapeHtml(generatedDoc.content) }}
                    />
                  </CardContent>
                </Card>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
