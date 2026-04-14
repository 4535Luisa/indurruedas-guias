import { useEffect, useState } from "react";
import { supabase, ESTADOS } from "../lib/supabase";
import { PillEstado, PillTransportadora } from "./UI";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

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

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.7)",
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
          maxWidth: "600px",
          maxHeight: "85vh",
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
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
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
            <PillEstado estado={guia.estado} />
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--gray)",
              fontSize: "20px",
              cursor: "pointer",
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Info */}
        <div
          style={{
            padding: "16px 20px",
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
              { label: "Dirección", value: guia.direccion_entrega || "—" },
              {
                label: "Fecha generación",
                value: guia.fecha_guia
                  ? format(parseISO(guia.fecha_guia), "d MMM yyyy", {
                      locale: es,
                    })
                  : "—",
              },
              { label: "Días activa", value: `${dias} días` },
              {
                label: "Asesor",
                value: guia.clientes?.usuarios?.nombre || "—",
              },
              { label: "NIT cliente", value: guia.clientes?.nit || "—" },
            ].map(({ label, value }) => (
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
                    color: "var(--wht2)",
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
              Sin cambios de estado registrados
            </div>
          ) : (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "8px" }}
            >
              {historial.map((h, i) => (
                <div
                  key={h.id}
                  style={{ display: "flex", alignItems: "center", gap: "10px" }}
                >
                  <div
                    style={{
                      width: "6px",
                      height: "6px",
                      borderRadius: "50%",
                      background: "var(--m)",
                      flexShrink: 0,
                    }}
                  ></div>
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        flexWrap: "wrap",
                      }}
                    >
                      {h.estado_anterior && (
                        <>
                          <PillEstado estado={h.estado_anterior} />
                          <span
                            style={{ fontSize: "11px", color: "var(--gray)" }}
                          >
                            →
                          </span>
                        </>
                      )}
                      <PillEstado estado={h.estado_nuevo} />
                      <span
                        style={{
                          fontSize: "10px",
                          color: "var(--gray)",
                          background: "var(--blk3)",
                          padding: "1px 6px",
                          borderRadius: "4px",
                        }}
                      >
                        {h.fuente}
                      </span>
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: "10px",
                      color: "var(--gray)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {format(parseISO(h.created_at), "d MMM yyyy HH:mm", {
                      locale: es,
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
