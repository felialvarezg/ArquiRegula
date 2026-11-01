"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowLeft, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { escapeHtml } from "@/lib/sanitize";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
interface SessionDoc {
  id: string;
  type: string;
  title: string;
  content: string;
  metadata: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Página de detalle de documento
// ---------------------------------------------------------------------------
export default function DocumentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { sessionId, docId } = params;
  const { toast } = useToast();
  const [doc, setDoc] = useState<SessionDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDoc = async () => {
      const sessionId = params.sessionId as string;
      const docId = params.docId as string;
      if (!sessionId || !docId) {
        setError("ID de sesión o documento no proporcionado");
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(`/api/sessions/${sessionId}/documents/${docId}`);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "No se pudo cargar el documento");
        }
        setDoc(data.document);
      } catch (err: any) {
        setError(err.message || "Error desconocido");
        toast({ variant: "destructive", description: err.message || "Error al cargar el documento." });
      } finally {
        setLoading(false);
      }
    };

    fetchDoc();
  }, [params.docId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/50">
        <CardContent className="p-6 text-center">
          <p className="text-sm text-destructive mb-2">{error}</p>
          <Button variant="outline" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Volver
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!doc) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <p className="text-sm text-muted-foreground">Documento no encontrado</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.back()}
        className="mb-4"
      >
        <ArrowLeft className="h-4 w-4 mr-2" /> Volver
      </Button>

      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            {doc.title}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Tipo: <Badge>{doc.type}</Badge> · Generado: {doc.createdAt ? new Date(doc.createdAt).toLocaleString("es-ES") : ""}
          </p>
        </CardHeader>
        <CardContent className="prose-agent max-h-[600px] overflow-y-auto">
          <div
            className="prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: escapeHtml(doc.content) }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
