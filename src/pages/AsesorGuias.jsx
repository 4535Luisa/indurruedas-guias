import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { PillEstado, PillTransportadora } from "../components/UI";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

export default function AsesorGuias() {
  const { perfil, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [guias, setGuias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroTexto, setFiltroTexto] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");

  useEffect(() => {
    if (perfil) cargarGuias();
  }, [perfil]);

  async function cargarGuias() {
    setLoading(true);
    const { data: clientesAsesor } = await supabase
      .from("clientes")
      .select("id")
      .eq("asesor_id", perfil.id);

    if (!clientesAsesor || clientesAsesor.length === 0) {
      setGuias([]);
      setLoading(false);
      return;
    }

    const clienteIds = clientesAsesor.map((c) => c.id);
    const { data } = await supabase
      .from("guias")
      .select(
        "id, numero_guia, transportadora, transportadora_nombre, factura_indurruedas, estado, fecha_guia, fecha_entrega, dias_habiles, ciudad_destino, direccion_entrega, destinatario, clientes(id, nombre, nit)",
      )
      .in("cliente_id", clienteIds)
      .neq("estado", "anulada")
      .order("created_at", { ascending: false });

    const ORDEN = {
      en_transito: 0,
      pendiente: 1,
      novedad: 2,
      informada: 3,
      entregado: 4,
      no_despachada: 5,
    };
    const sorted = (data || []).sort((a, b) => {
      const oa = ORDEN[a.estado] ?? 7;
      const ob = ORDEN[b.estado] ?? 7;
      if (oa !== ob) return oa - ob;
      return new Date(b.fecha_guia || 0) - new Date(a.fecha_guia || 0);
    });
    setGuias(sorted);
    setLoading(false);
  }

  const filtradas = guias.filter((g) => {
    const txt = filtroTexto.toLowerCase();
    const matchTxt =
      !txt ||
      g.numero_guia?.toLowerCase().includes(txt) ||
      g.clientes?.nombre?.toLowerCase().includes(txt) ||
      g.ciudad_destino?.toLowerCase().includes(txt) ||
      g.factura_indurruedas?.toLowerCase().includes(txt) ||
      g.destinatario?.toLowerCase().includes(txt);
    const matchEstado = !filtroEstado || g.estado === filtroEstado;
    return matchTxt && matchEstado;
  });

  const activas = guias.filter((g) => g.estado !== "entregado").length;
  const novedad = guias.filter((g) => g.estado === "novedad").length;
  const criticas = guias.filter((g) => {
    if (g.estado === "entregado") return false;
    if (!g.fecha_guia) return false;
    return Math.floor((new Date() - new Date(g.fecha_guia)) / 86400000) >= 10;
  }).length;

  const iniciales =
    perfil?.nombre
      ?.split(" ")
      .map((n) => n[0])
      .slice(0, 2)
      .join("") || "AS";

  return (
    <div style={{ minHeight: "100vh", background: "var(--blk)" }}>
      <div
        style={{
          background: "var(--blk2)",
          borderBottom: "1px solid var(--blk4)",
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: "32px",
              height: "32px",
              background: "var(--m)",
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "13px",
              fontWeight: "700",
              color: theme === "dark" ? "#0E0E0E" : "#FFFFFF",
              fontFamily: "var(--font-mono)",
              flexShrink: 0,
            }}
          >
            M
          </div>
          <div>
            <div
              style={{
                fontSize: "13px",
                fontWeight: "500",
                color: "var(--wht)",
              }}
            >
              Mis guías
            </div>
            <div style={{ fontSize: "10px", color: "var(--gray)" }}>
              {perfil?.nombre}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            onClick={toggleTheme}
            title={theme === "dark" ? "Modo claro" : "Modo oscuro"}
            style={{
              background: "transparent",
              border: "1px solid var(--blk5)",
              borderRadius: "6px",
              color: "var(--gray)",
              fontSize: "14px",
              padding: "4px 8px",
              cursor: "pointer",
            }}
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
          <div
            style={{
              width: "30px",
              height: "30px",
              borderRadius: "50%",
              background: "var(--m-dim)",
              border: "1px solid var(--m-dim2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "10px",
              color: "var(--m)",
              fontWeight: "700",
            }}
          >
            {iniciales}
          </div>
          <button
            onClick={logout}
            style={{
              background: "transparent",
              border: "1px solid var(--blk5)",
              borderRadius: "6px",
              color: "var(--gray)",
              fontSize: "11px",
              padding: "4px 10px",
              cursor: "pointer",
            }}
          >
            Salir
          </button>
        </div>
      </div>

      <div style={{ padding: "16px", maxWidth: "1200px", margin: "0 auto" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0,1fr))",
            gap: "10px",
            marginBottom: "16px",
          }}
        >
          {[
            { label: "Guías activas", value: activas, accent: "var(--m)" },
            {
              label: "Con novedad",
              value: novedad,
              accent: novedad > 0 ? "var(--warn)" : "var(--wht)",
            },
            {
              label: "+10 días",
              value: criticas,
              accent: criticas > 0 ? "var(--danger)" : "var(--wht)",
            },
          ].map((k) => (
            <div
              key={k.label}
              style={{
                background: "var(--blk2)",
                border: "1px solid var(--blk4)",
                borderRadius: "8px",
                padding: "12px",
              }}
            >
              <div
                style={{
                  fontSize: "10px",
                  color: "var(--gray)",
                  textTransform: "uppercase",
                  letterSpacing: ".05em",
                  marginBottom: "5px",
                }}
              >
                {k.label}
              </div>
              <div
                style={{
                  fontSize: "24px",
                  fontWeight: "500",
                  fontFamily: "var(--font-mono)",
                  color: k.accent,
                }}
              >
                {k.value}
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            display: "flex",
            gap: "8px",
            marginBottom: "14px",
            flexWrap: "wrap",
          }}
        >
          <input
            value={filtroTexto}
            onChange={(e) => setFiltroTexto(e.target.value)}
            placeholder="Buscar cliente, guía, factura, ciudad..."
            style={{ flex: 1, minWidth: "180px" }}
          />
          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            style={{ minWidth: "160px" }}
          >
            <option value="">Todos los estados</option>
            <option value="en_transito">En tránsito</option>
            <option value="entregado">Entregado</option>
            <option value="pendiente">Pendiente recogida</option>
            <option value="novedad">Con novedad</option>
            <option value="informada">Informada TCC</option>
            <option value="no_despachada">No despachada</option>
          </select>
        </div>

        {loading ? (
          <div
            style={{
              color: "var(--m)",
              fontFamily: "var(--font-mono)",
              fontSize: "12px",
            }}
          >
            Cargando tus guías...
          </div>
        ) : (
          <>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "8px" }}
            >
              {filtradas.map((g) => {
                let dias = 0;
                if (g.dias_habiles != null) {
                  dias = g.dias_habiles;
                } else if (g.fecha_guia) {
                  const fechaFin =
                    g.estado === "entregado" && g.fecha_entrega
                      ? new Date(g.fecha_entrega)
                      : new Date();
                  dias = Math.floor(
                    (fechaFin - new Date(g.fecha_guia)) / 86400000,
                  );
                }
                const colorDias =
                  dias >= 10
                    ? "var(--danger)"
                    : dias >= 6
                      ? "var(--warn)"
                      : "var(--m)";
                return (
                  <div
                    key={g.id}
                    style={{
                      background: "var(--blk2)",
                      border: "1px solid var(--blk4)",
                      borderRadius: "10px",
                      padding: "14px",
                      borderLeft: `3px solid ${g.estado === "novedad" ? "var(--danger)" : g.estado === "entregado" ? "var(--m)" : dias >= 10 ? "var(--warn)" : "var(--blk5)"}`,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: "8px",
                        flexWrap: "wrap",
                        gap: "6px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          flexWrap: "wrap",
                        }}
                      >
                        <span
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: "12px",
                            fontWeight: "700",
                            color: "var(--wht)",
                          }}
                        >
                          {g.numero_guia}
                        </span>
                        {g.transportadora === "otra" ? (
                          <span
                            style={{
                              fontSize: "10px",
                              padding: "2px 7px",
                              borderRadius: "20px",
                              background: "#1a0a2e",
                              border: "1px solid #3d1a66",
                              color: "#AA88FF",
                              fontWeight: "500",
                            }}
                          >
                            {g.transportadora_nombre
                              ?.split(" ")
                              .slice(0, 2)
                              .join(" ") || "Otra"}
                          </span>
                        ) : (
                          <PillTransportadora
                            transportadora={g.transportadora}
                          />
                        )}
                        {g.factura_indurruedas && (
                          <span
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontSize: "10px",
                              color: "var(--gray)",
                              background: "var(--blk3)",
                              padding: "1px 6px",
                              borderRadius: "4px",
                            }}
                          >
                            {g.factura_indurruedas}
                          </span>
                        )}
                      </div>
                      <PillEstado estado={g.estado} />
                    </div>
                    <div
                      style={{
                        fontSize: "13px",
                        color: "var(--wht)",
                        fontWeight: "500",
                        marginBottom: "6px",
                      }}
                    >
                      {g.clientes?.nombre || g.destinatario || "—"}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "12px",
                        fontSize: "11px",
                        color: "var(--gray)",
                      }}
                    >
                      <span>📍 {g.ciudad_destino || "—"}</span>
                      <span
                        style={{
                          flex: 1,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {g.direccion_entrega || "—"}
                      </span>
                      <span>
                        {g.fecha_guia
                          ? format(parseISO(g.fecha_guia), "d MMM yyyy", {
                              locale: es,
                            })
                          : "—"}
                      </span>
                      <span
                        style={{
                          color: colorDias,
                          fontWeight: "500",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        {dias} días
                      </span>
                    </div>
                  </div>
                );
              })}
              {filtradas.length === 0 && (
                <div
                  style={{
                    padding: "40px",
                    textAlign: "center",
                    color: "var(--gray)",
                    fontSize: "12px",
                  }}
                >
                  No se encontraron guías
                </div>
              )}
            </div>
            <p
              style={{
                fontSize: "10px",
                color: "var(--gray)",
                marginTop: "14px",
                textAlign: "center",
              }}
            >
              Mostrando {filtradas.length} de {guias.length} guías
            </p>
          </>
        )}
      </div>
    </div>
  );
}
