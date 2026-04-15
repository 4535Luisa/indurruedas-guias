import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { PillTransportadora } from "./UI";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

const INFO_ESTADOS = {
  aforada: {
    label: "Mercancia aforada",
    color: "#55AAFF",
    bg: "#001a33",
    border: "#003366",
    icono: "📦",
    descripcion:
      "La mercancia fue recibida y registrada en la oficina de origen. Esta siendo preparada para despacho.",
  },
  despachada: {
    label: "Mercancia despachada",
    color: "#55AAFF",
    bg: "#001a33",
    border: "#003366",
    icono: "🚚",
    descripcion:
      "La mercancia salio de la oficina de origen y esta en camino hacia su destino.",
  },
  en_muellex: {
    label: "Mercancia en muellex",
    color: "#AA88FF",
    bg: "#1a0033",
    border: "#2a0055",
    icono: "🏭",
    descripcion:
      "La mercancia se encuentra en el centro de distribucion (muellex) siendo clasificada para continuar su ruta.",
  },
  en_transito: {
    label: "En transito nacional",
    color: "#55AAFF",
    bg: "#001a33",
    border: "#003366",
    icono: "🛣️",
    descripcion:
      "La mercancia esta viajando entre ciudades hacia el destino final del cliente.",
  },
  en_reparto: {
    label: "En reparto urbano",
    color: "#FFAA00",
    bg: "#2a1800",
    border: "#3d2400",
    icono: "🏍️",
    descripcion:
      "La mercancia ya llego a la ciudad destino y esta siendo repartida. Deberia llegar hoy o manana.",
  },
  recibido: {
    label: "Recibido en destino",
    color: "#FFAA00",
    bg: "#2a1800",
    border: "#3d2400",
    icono: "📬",
    descripcion:
      "La mercancia fue recibida en la oficina de destino. El cliente debe ir a recogerla o esta pendiente de entrega a domicilio.",
  },
  entregado: {
    label: "Entregado",
    color: "#AAFF00",
    bg: "#0d1f00",
    border: "#1a3300",
    icono: "✅",
    descripcion:
      "La mercancia fue entregada exitosamente al cliente en su direccion. Envio completado.",
  },
  novedad: {
    label: "Con novedad",
    color: "#FF4444",
    bg: "#2a0000",
    border: "#440000",
    icono: "⚠️",
    descripcion:
      "Se presento un problema con la entrega. Puede ser que el cliente no estuviera, direccion incorrecta u otro inconveniente. Contactar al cliente.",
  },
  pendiente: {
    label: "Pendiente recogida",
    color: "#FFAA00",
    bg: "#2a1800",
    border: "#3d2400",
    icono: "🕐",
    descripcion:
      "La mercancia esta esperando ser recogida por el cliente en la oficina de TCC mas cercana.",
  },
  informada: {
    label: "Informada a TCC",
    color: "#888888",
    bg: "#1a1a1a",
    border: "#2e2e2e",
    icono: "📋",
    descripcion:
      "La guia fue registrada en el sistema de TCC pero aun no ha sido recogida en origen.",
  },
  no_despachada: {
    label: "No despachada",
    color: "#FF8800",
    bg: "#2a1200",
    border: "#3d1a00",
    icono: "🚫",
    descripcion:
      "La mercancia no fue enviada por el remitente. Verificar con el equipo de despacho de Indurruedas.",
  },
};

export default function DetalleGuia({ guia, onClose }) {
  const [historial, setHistorial] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!guia) return;
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

  if (!guia) return null;

  const dias = guia.fecha_guia
    ? Math.floor((new Date() - new Date(guia.fecha_guia)) / 86400000)
    : 0;
  const infoEstado = INFO_ESTADOS[guia.estado] || INFO_ESTADOS["en_transito"];

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
        {/* Header */}
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
              {guia.numero_guia}
            </span>
            <PillTransportadora transportadora={guia.transportadora} />
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

        {/* Estado destacado */}
        <div
          style={{
            margin: "16px 20px",
            background: infoEstado.bg,
            border: `1px solid ${infoEstado.border}`,
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
            <span style={{ fontSize: "22px" }}>{infoEstado.icono}</span>
            <div>
              <div
                style={{
                  fontSize: "13px",
                  fontWeight: "500",
                  color: infoEstado.color,
                }}
              >
                {infoEstado.label}
              </div>
              <div
                style={{
                  fontSize: "10px",
                  color: "var(--gray)",
                  marginTop: "1px",
                }}
              >
                Estado actual de la guia
              </div>
            </div>
          </div>
          <p
            style={{
              fontSize: "12px",
              color: "var(--wht2)",
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            {infoEstado.descripcion}
          </p>
        </div>

        {/* Info de la guia */}
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
                value: guia.clientes?.nombre || guia.destinatario || "—",
              },
              {
                label: "Factura Indurruedas",
                value: guia.factura_indurruedas || "—",
              },
              { label: "Ciudad destino", value: guia.ciudad_destino || "—" },
              { label: "Direccion", value: guia.direccion_entrega || "—" },
              {
                label: "Fecha generacion",
                value: guia.fecha_guia
                  ? format(parseISO(guia.fecha_guia), "d MMM yyyy", {
                      locale: es,
                    })
                  : "—",
              },
              {
                label: "Dias activa",
                value: `${dias} dias`,
                color:
                  dias >= 10
                    ? "var(--danger)"
                    : dias >= 6
                      ? "var(--warn)"
                      : "var(--m)",
              },
              {
                label: "Asesor",
                value: guia.clientes?.usuarios?.nombre || "—",
              },
              { label: "NIT cliente", value: guia.clientes?.nit || "—" },
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
              Sin cambios de estado registrados aun
            </div>
          ) : (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "8px" }}
            >
              {historial.map((h) => {
                const infoNuevo = INFO_ESTADOS[h.estado_nuevo];
                const infoAnterior = INFO_ESTADOS[h.estado_anterior];
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
                    <span style={{ fontSize: "16px", flexShrink: 0 }}>
                      {infoNuevo?.icono || "•"}
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
                              {infoAnterior?.label || h.estado_anterior}
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
                            color: infoNuevo?.color || "var(--m)",
                          }}
                        >
                          {infoNuevo?.label || h.estado_nuevo}
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
