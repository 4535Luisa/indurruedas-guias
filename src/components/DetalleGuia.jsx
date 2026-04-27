import { useEffect, useState } from "react";
import { supabase, ESTADOS } from "../lib/supabase";
import { PillTransportadora } from "./UI";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

const DESCRIPCIONES = {
  en_transito: {
    icono: "🚚",
    texto:
      "La mercancía está en camino hacia el destino. Puede estar en tránsito nacional, en bodega intermedia o en proceso de entrega.",
  },
  entregado: {
    icono: "✅",
    texto:
      "La mercancía fue entregada exitosamente al cliente. Envío completado.",
  },
  pendiente: {
    icono: "🕐",
    texto:
      "La mercancía está esperando ser recogida por el cliente en la oficina de TCC más cercana.",
  },
  novedad: {
    icono: "⚠️",
    texto:
      "Se presentó un problema con la entrega. Puede ser dirección incorrecta, cliente ausente u otro inconveniente. Contactar al cliente.",
  },
  informada: {
    icono: "📋",
    texto:
      "La guía fue registrada en TCC pero aún no ha sido recogida en el origen para despacho.",
  },
  no_despachada: {
    icono: "🚫",
    texto:
      "La mercancía no fue enviada por el remitente. Verificar con el equipo de despacho de Indurruedas.",
  },
  anulada: {
    icono: "❌",
    texto:
      "Esta guía fue anulada. La mercancía no fue despachada por el remitente y el envío no se realizó.",
  },
};

export default function DetalleGuia({ guia, onClose }) {
  const [historial, setHistorial] = useState([]);
  const [guiaData, setGuiaData] = useState(guia);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!guia) return;
    // Cargar guía completa con foto y novedad
    supabase
      .from("guias")
      .select("*, clientes(nombre, nit, usuarios(nombre))")
      .eq("id", guia.id)
      .single()
      .then(({ data }) => {
        if (data) setGuiaData(data);
      });
    // Cargar historial
    supabase
      .from("historial_estados")
      .select("*")
      .eq("guia_id", guia.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setHistorial(data || []);
        setLoading(false);
      });
  }, [guia]);

  if (!guiaData) return null;

  const g = guiaData;
  const dias = g.fecha_guia
    ? Math.floor((new Date() - new Date(g.fecha_guia)) / 86400000)
    : 0;
  const cfg = ESTADOS[g.estado] || ESTADOS["en_transito"];
  const desc = DESCRIPCIONES[g.estado] || DESCRIPCIONES["en_transito"];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.75)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--blk2)",
          border: "1px solid var(--blk4)",
          borderRadius: "12px",
          width: "100%",
          maxWidth: "580px",
          maxHeight: "88vh",
          overflow: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--blk4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "14px",
                fontWeight: "700",
                color: "var(--wht)",
              }}
            >
              {g.numero_guia}
            </span>
            <PillTransportadora transportadora={g.transportadora} />
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--gray)",
              fontSize: "22px",
              cursor: "pointer",
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Estado con descripcion */}
        <div
          style={{
            margin: "16px 20px",
            background: cfg.bg,
            border: `1px solid ${cfg.border}`,
            borderRadius: "10px",
            padding: "14px 16px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              marginBottom: "8px",
            }}
          >
            <span style={{ fontSize: "22px" }}>{desc.icono}</span>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: "13px",
                  fontWeight: "500",
                  color: cfg.color,
                }}
              >
                {cfg.label}
              </div>
              <div
                style={{
                  fontSize: "10px",
                  color: "var(--gray)",
                  marginTop: "1px",
                }}
              >
                Estado en el sistema
              </div>
            </div>
          </div>
          {g.estado_transportadora && (
            <div
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "7px",
                padding: "8px 10px",
                marginBottom: "8px",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <span
                style={{
                  fontSize: "10px",
                  color: "var(--gray)",
                  textTransform: "uppercase",
                  letterSpacing: ".05em",
                }}
              >
                Estado real {g.transportadora === "tcc" ? "TCC" : "Estelar"}:
              </span>
              <span
                style={{
                  fontSize: "12px",
                  color: cfg.color,
                  fontWeight: "500",
                }}
              >
                {g.estado_transportadora}
              </span>
            </div>
          )}
          <p
            style={{
              fontSize: "12px",
              color: "var(--wht2)",
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            {desc.texto}
          </p>
        </div>

        {/* Novedad descripcion */}
        {g.novedad_descripcion && (
          <div
            style={{
              margin: "0 20px 16px",
              background: "rgba(255,170,0,0.1)",
              border: "1px solid rgba(255,170,0,0.3)",
              borderRadius: "8px",
              padding: "12px",
            }}
          >
            <div
              style={{
                fontSize: "10px",
                color: "var(--warn)",
                textTransform: "uppercase",
                letterSpacing: ".05em",
                marginBottom: "5px",
              }}
            >
              ⚠️ Novedad reportada
            </div>
            <div style={{ fontSize: "12px", color: "var(--wht2)" }}>
              {g.novedad_descripcion}
            </div>
          </div>
        )}

        {/* Foto evidencia */}
        {g.foto_evidencia && (
          <div style={{ margin: "0 20px 16px" }}>
            <div
              style={{
                fontSize: "10px",
                color: "var(--gray)",
                textTransform: "uppercase",
                letterSpacing: ".05em",
                marginBottom: "8px",
              }}
            >
              📸 Foto de entrega
            </div>
            <img
              src={g.foto_evidencia}
              alt="Evidencia de entrega"
              style={{
                width: "100%",
                maxHeight: "300px",
                objectFit: "contain",
                borderRadius: "8px",
                border: "1px solid var(--blk4)",
              }}
            />
            <a
              href={g.foto_evidencia}
              download={`entrega-${g.numero_guia}.jpg`}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                marginTop: "8px",
                padding: "8px",
                background: "var(--m-dim)",
                border: "1px solid var(--m-dim2)",
                borderRadius: "7px",
                color: "var(--m)",
                fontSize: "12px",
                fontWeight: "500",
                textDecoration: "none",
              }}
            >
              ⬇️ Descargar foto
            </a>
          </div>
        )}

        {/* Info */}
        <div
          style={{
            padding: "0 20px 16px",
            borderBottom: "1px solid var(--blk4)",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "12px",
            }}
          >
            {[
              {
                label: "Cliente",
                value: g.clientes?.nombre || g.destinatario || "—",
              },
              {
                label: "Factura Indurruedas",
                value: g.factura_indurruedas || "—",
              },
              { label: "Ciudad destino", value: g.ciudad_destino || "—" },
              { label: "Dirección", value: g.direccion_entrega || "—" },
              {
                label: "Fecha generación",
                value: g.fecha_guia
                  ? format(parseISO(g.fecha_guia), "d MMM yyyy", { locale: es })
                  : "—",
              },
              {
                label: "Días activa",
                value: `${dias} días`,
                color:
                  dias >= 10
                    ? "var(--danger)"
                    : dias >= 6
                      ? "var(--warn)"
                      : "var(--m)",
              },
              { label: "Asesor", value: g.clientes?.usuarios?.nombre || "—" },
              { label: "NIT cliente", value: g.clientes?.nit || "—" },
            ].map(({ label, value, color }) => (
              <div key={label}>
                <div
                  style={{
                    fontSize: "10px",
                    color: "var(--gray)",
                    textTransform: "uppercase",
                    letterSpacing: ".05em",
                    marginBottom: "3px",
                  }}
                >
                  {label}
                </div>
                <div
                  style={{
                    fontSize: "13px",
                    color: color || "var(--wht2)",
                    fontWeight: label === "Cliente" ? "500" : "400",
                  }}
                >
                  {value}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Historial */}
        <div style={{ padding: "16px 20px" }}>
          <div
            style={{
              fontSize: "10px",
              color: "var(--gray)",
              textTransform: "uppercase",
              letterSpacing: ".05em",
              marginBottom: "12px",
            }}
          >
            Historial de estados
          </div>
          {loading ? (
            <div style={{ fontSize: "12px", color: "var(--gray)" }}>
              Cargando historial...
            </div>
          ) : historial.length === 0 ? (
            <div style={{ fontSize: "12px", color: "var(--gray)" }}>
              Sin cambios de estado registrados aún
            </div>
          ) : (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "8px" }}
            >
              {historial.map((h) => {
                const cfgNuevo = ESTADOS[h.estado_nuevo];
                const cfgAnterior = ESTADOS[h.estado_anterior];
                return (
                  <div
                    key={h.id}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "10px",
                      padding: "10px 12px",
                      background: "var(--blk3)",
                      borderRadius: "8px",
                      border: "1px solid var(--blk4)",
                    }}
                  >
                    <span style={{ fontSize: "14px", flexShrink: 0 }}>
                      {DESCRIPCIONES[h.estado_nuevo]?.icono || "•"}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          flexWrap: "wrap",
                          marginBottom: "3px",
                        }}
                      >
                        {h.estado_anterior && (
                          <>
                            <span
                              style={{ fontSize: "11px", color: "var(--gray)" }}
                            >
                              {cfgAnterior?.label || h.estado_anterior}
                            </span>
                            <span
                              style={{ fontSize: "11px", color: "var(--gray)" }}
                            >
                              →
                            </span>
                          </>
                        )}
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: "500",
                            color: cfgNuevo?.color || "var(--m)",
                          }}
                        >
                          {cfgNuevo?.label || h.estado_nuevo}
                        </span>
                        <span
                          style={{
                            fontSize: "9px",
                            padding: "1px 5px",
                            background: "var(--blk4)",
                            borderRadius: "4px",
                            color: "var(--gray)",
                          }}
                        >
                          {h.fuente}
                        </span>
                      </div>
                      <div style={{ fontSize: "10px", color: "var(--gray)" }}>
                        {format(
                          parseISO(h.created_at),
                          "d MMM yyyy 'a las' h:mm a",
                          { locale: es },
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
