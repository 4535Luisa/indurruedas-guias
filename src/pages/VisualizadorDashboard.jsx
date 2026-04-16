import { useEffect, useState } from "react";
import { supabase, ESTADOS } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { PillEstado, PillTransportadora } from "../components/UI";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

export default function VisualizadorDashboard() {
  const { perfil, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [vista, setVista] = useState("guias"); // 'guias' | 'stats'
  const [stats, setStats] = useState(null);
  const [tiempos, setTiempos] = useState([]);
  const [ciudades, setCiudades] = useState([]);
  const [guias, setGuias] = useState([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [filtroTexto, setFiltroTexto] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroAsesor, setFiltroAsesor] = useState("");
  const [asesores, setAsesores] = useState([]);
  const [loading, setLoading] = useState(true);

  const POR_PAGINA = 50;

  useEffect(() => {
    cargarDatos();
  }, []);
  useEffect(() => {
    cargarGuias();
  }, [pagina, busqueda, filtroEstado, filtroAsesor]);
  useEffect(() => {
    const t = setTimeout(() => {
      setBusqueda(filtroTexto);
      setPagina(1);
    }, 400);
    return () => clearTimeout(t);
  }, [filtroTexto]);

  async function cargarDatos() {
    const [statsRes, asesorRes, guiasEntregadasRes] = await Promise.all([
      supabase.from("dashboard_stats").select("*").single(),
      supabase
        .from("usuarios")
        .select("id, nombre")
        .eq("rol", "asesor")
        .order("nombre"),
      supabase
        .from("guias")
        .select(
          "transportadora, transportadora_nombre, estado, fecha_guia, fecha_entrega, dias_habiles, ciudad_destino",
        )
        .not("dias_habiles", "is", null)
        .eq("estado", "entregado")
        .limit(500),
    ]);
    if (statsRes.data) setStats(statsRes.data);
    setAsesores(asesorRes.data || []);

    const guiasEntregadas = guiasEntregadasRes.data || [];

    // Tiempos por transportadora
    const porTrans = {};
    for (const g of guiasEntregadas) {
      const key =
        g.transportadora_nombre ||
        (g.transportadora === "estelar"
          ? "Estelar Express"
          : g.transportadora === "tcc"
            ? "TCC"
            : g.transportadora);
      if (!porTrans[key]) porTrans[key] = { total: 0, sumDias: 0 };
      porTrans[key].total++;
      porTrans[key].sumDias += g.dias_habiles || 0;
    }
    setTiempos(
      Object.entries(porTrans)
        .map(([nombre, d]) => ({
          nombre,
          total: d.total,
          promedio: Math.round(d.sumDias / d.total),
        }))
        .sort((a, b) => a.promedio - b.promedio),
    );

    // Tiempos por ciudad
    const porCiudad = {};
    for (const g of guiasEntregadas) {
      const ciudad = g.ciudad_destino || "Sin ciudad";
      if (!porCiudad[ciudad]) porCiudad[ciudad] = { total: 0, sumDias: 0 };
      porCiudad[ciudad].total++;
      porCiudad[ciudad].sumDias += g.dias_habiles || 0;
    }
    setCiudades(
      Object.entries(porCiudad)
        .map(([ciudad, d]) => ({
          ciudad,
          total: d.total,
          promedio: Math.round(d.sumDias / d.total),
        }))
        .filter((c) => c.total >= 2)
        .sort((a, b) => b.total - a.total)
        .slice(0, 15),
    );

    setLoading(false);
  }

  async function cargarGuias() {
    setLoading(true);
    const desde = (pagina - 1) * POR_PAGINA;
    const hasta = desde + POR_PAGINA - 1;
    let q = supabase
      .from("guias")
      .select(
        "id, numero_guia, transportadora, transportadora_nombre, factura_indurruedas, estado, fecha_guia, fecha_entrega, dias_habiles, ciudad_destino, destinatario, clientes(nombre, nit, usuarios(nombre))",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(desde, hasta);
    if (busqueda)
      q = q.or(
        `numero_guia.ilike.%${busqueda}%,factura_indurruedas.ilike.%${busqueda}%,destinatario.ilike.%${busqueda}%,ciudad_destino.ilike.%${busqueda}%`,
      );
    if (filtroEstado) q = q.eq("estado", filtroEstado);
    const { data, count } = await q;
    let resultado = data || [];
    if (filtroAsesor)
      resultado = resultado.filter(
        (g) => g.clientes?.usuarios?.nombre === filtroAsesor,
      );

    // Ordenar
    const ORDEN = {
      en_transito: 0,
      pendiente: 1,
      novedad: 2,
      informada: 3,
      entregado: 4,
      no_despachada: 5,
      anulada: 6,
    };
    resultado.sort((a, b) => {
      const oa = ORDEN[a.estado] ?? 7;
      const ob = ORDEN[b.estado] ?? 7;
      if (oa !== ob) return oa - ob;
      return new Date(b.fecha_guia || 0) - new Date(a.fecha_guia || 0);
    });
    setGuias(resultado);
    setTotal(count || 0);
    setLoading(false);
  }

  const totalPaginas = Math.ceil(total / POR_PAGINA);
  const maxPromedio = Math.max(...tiempos.map((t) => t.promedio), 1);
  const maxCiudad = Math.max(...ciudades.map((c) => c.promedio), 1);

  return (
    <div style={{ minHeight: "100vh", background: "var(--blk)" }}>
      {/* Header */}
      <div
        style={{
          background: "var(--blk2)",
          borderBottom: "1px solid var(--blk4)",
          padding: "12px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
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
              color: theme === "dark" ? "#0E0E0E" : "#fff",
              fontFamily: "var(--font-mono)",
            }}
          >
            M
          </div>
          <div style={{ display: "flex", gap: "4px" }}>
            {["guias", "stats"].map((v) => (
              <button
                key={v}
                onClick={() => setVista(v)}
                style={{
                  padding: "6px 14px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  fontWeight: "500",
                  cursor: "pointer",
                  border: "none",
                  background: vista === v ? "var(--m)" : "transparent",
                  color: vista === v ? "var(--blk)" : "var(--gray)",
                  transition: "all .15s",
                }}
              >
                {v === "guias" ? "📦 Guías" : "📊 Estadísticas"}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <span style={{ fontSize: "11px", color: "var(--gray)" }}>
            {perfil?.nombre} · Solo lectura
          </span>
          <button
            onClick={toggleTheme}
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

      <div style={{ padding: "20px", maxWidth: "1400px", margin: "0 auto" }}>
        {/* KPIs siempre visibles */}
        {stats && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0,1fr))",
              gap: "12px",
              marginBottom: "20px",
            }}
          >
            {[
              {
                label: "Guías activas",
                value: stats.guias_activas,
                color: "var(--m)",
              },
              {
                label: "Entregadas",
                value: stats.entregadas,
                color: "var(--wht)",
              },
              {
                label: "Con novedad",
                value: stats.con_novedad,
                color: stats.con_novedad > 0 ? "var(--warn)" : "var(--wht)",
              },
              {
                label: "+10 días sin entrega",
                value: stats.criticas,
                color: stats.criticas > 0 ? "var(--danger)" : "var(--wht)",
              },
            ].map((k) => (
              <div
                key={k.label}
                style={{
                  background: "var(--blk2)",
                  border: "1px solid var(--blk4)",
                  borderRadius: "10px",
                  padding: "16px",
                }}
              >
                <div
                  style={{
                    fontSize: "10px",
                    color: "var(--gray)",
                    textTransform: "uppercase",
                    letterSpacing: ".05em",
                    marginBottom: "8px",
                  }}
                >
                  {k.label}
                </div>
                <div
                  style={{
                    fontSize: "28px",
                    fontWeight: "500",
                    fontFamily: "var(--font-mono)",
                    color: k.color,
                  }}
                >
                  {k.value}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Vista Guías */}
        {vista === "guias" && (
          <>
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
                placeholder="Buscar guía, factura, cliente, ciudad..."
                style={{ flex: 1, minWidth: "200px" }}
              />
              <select
                value={filtroEstado}
                onChange={(e) => {
                  setFiltroEstado(e.target.value);
                  setPagina(1);
                }}
                style={{ minWidth: "160px" }}
              >
                <option value="">Todos los estados</option>
                <option value="en_transito">En tránsito</option>
                <option value="entregado">Entregado</option>
                <option value="pendiente">Pendiente recogida</option>
                <option value="novedad">Con novedad</option>
                <option value="informada">Informada TCC</option>
                <option value="no_despachada">No despachada</option>
                <option value="anulada">Anulada</option>
              </select>
              <select
                value={filtroAsesor}
                onChange={(e) => {
                  setFiltroAsesor(e.target.value);
                  setPagina(1);
                }}
                style={{ minWidth: "180px" }}
              >
                <option value="">Todos los asesores</option>
                {asesores.map((a) => (
                  <option key={a.id} value={a.nombre}>
                    {a.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div
              style={{
                background: "var(--blk2)",
                border: "1px solid var(--blk4)",
                borderRadius: "10px",
                overflow: "hidden",
              }}
            >
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "12px",
                }}
              >
                <thead>
                  <tr>
                    {[
                      "N° Guía",
                      "Transp.",
                      "Factura",
                      "Cliente",
                      "Asesor",
                      "Ciudad",
                      "Fecha",
                      "Días",
                      "Estado",
                    ].map((h) => (
                      <th
                        key={h}
                        style={{
                          textAlign: "left",
                          padding: "8px 12px",
                          fontSize: "10px",
                          color: "var(--gray)",
                          borderBottom: "1px solid var(--blk4)",
                          textTransform: "uppercase",
                          letterSpacing: ".04em",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {guias.map((g) => {
                    let dias = 0;
                    if (g.dias_habiles != null) dias = g.dias_habiles;
                    else if (g.fecha_guia) {
                      const fechaFin =
                        g.estado === "entregado" && g.fecha_entrega
                          ? new Date(g.fecha_entrega)
                          : new Date();
                      dias = Math.floor(
                        (fechaFin - new Date(g.fecha_guia)) / 86400000,
                      );
                    }
                    return (
                      <tr
                        key={g.id}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.background = "var(--hover-bg)")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.background = "transparent")
                        }
                      >
                        <td
                          style={{
                            padding: "8px 12px",
                            borderBottom: "1px solid var(--blk3)",
                            fontFamily: "var(--font-mono)",
                            fontSize: "11px",
                            color: "var(--m)",
                          }}
                        >
                          {g.numero_guia}
                        </td>
                        <td
                          style={{
                            padding: "8px 12px",
                            borderBottom: "1px solid var(--blk3)",
                          }}
                        >
                          {g.transportadora === "otra" ? (
                            <span
                              style={{
                                fontSize: "10px",
                                padding: "2px 6px",
                                borderRadius: "20px",
                                background: "#1a0a2e",
                                border: "1px solid #3d1a66",
                                color: "#AA88FF",
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
                        </td>
                        <td
                          style={{
                            padding: "8px 12px",
                            borderBottom: "1px solid var(--blk3)",
                            fontFamily: "var(--font-mono)",
                            fontSize: "11px",
                            color: "var(--gray)",
                          }}
                        >
                          {g.factura_indurruedas || "—"}
                        </td>
                        <td
                          style={{
                            padding: "8px 12px",
                            borderBottom: "1px solid var(--blk3)",
                            color: "var(--wht)",
                          }}
                        >
                          {g.clientes?.nombre || g.destinatario || "—"}
                        </td>
                        <td
                          style={{
                            padding: "8px 12px",
                            borderBottom: "1px solid var(--blk3)",
                            color: "var(--gray)",
                            fontSize: "11px",
                          }}
                        >
                          {g.clientes?.usuarios?.nombre || "—"}
                        </td>
                        <td
                          style={{
                            padding: "8px 12px",
                            borderBottom: "1px solid var(--blk3)",
                            color: "var(--wht2)",
                          }}
                        >
                          {g.ciudad_destino || "—"}
                        </td>
                        <td
                          style={{
                            padding: "8px 12px",
                            borderBottom: "1px solid var(--blk3)",
                            color: "var(--gray)",
                            fontSize: "11px",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {g.fecha_guia
                            ? format(parseISO(g.fecha_guia), "d MMM yy", {
                                locale: es,
                              })
                            : "—"}
                        </td>
                        <td
                          style={{
                            padding: "8px 12px",
                            borderBottom: "1px solid var(--blk3)",
                          }}
                        >
                          <span
                            style={{
                              color:
                                dias >= 10
                                  ? "var(--danger)"
                                  : dias >= 6
                                    ? "var(--warn)"
                                    : "var(--m)",
                              fontFamily: "var(--font-mono)",
                              fontSize: "12px",
                              fontWeight: "500",
                            }}
                          >
                            {dias}
                          </span>
                        </td>
                        <td
                          style={{
                            padding: "8px 12px",
                            borderBottom: "1px solid var(--blk3)",
                          }}
                        >
                          <PillEstado estado={g.estado} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {guias.length === 0 && (
                <div
                  style={{
                    padding: "32px",
                    textAlign: "center",
                    color: "var(--gray)",
                    fontSize: "12px",
                  }}
                >
                  No se encontraron guías
                </div>
              )}
            </div>

            {/* Paginación */}
            <div
              style={{
                position: "sticky",
                bottom: 0,
                background: "var(--blk)",
                borderTop: "1px solid var(--blk4)",
                padding: "10px 0",
                marginTop: "8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "8px",
              }}
            >
              <span style={{ fontSize: "11px", color: "var(--gray)" }}>
                Mostrando {Math.min((pagina - 1) * POR_PAGINA + 1, total)}–
                {Math.min(pagina * POR_PAGINA, total)} de{" "}
                {total.toLocaleString()} guías
              </span>
              <div style={{ display: "flex", gap: "6px" }}>
                <button
                  onClick={() => setPagina(1)}
                  disabled={pagina === 1}
                  style={{
                    padding: "5px 9px",
                    borderRadius: "5px",
                    border: "1px solid var(--blk5)",
                    background: "transparent",
                    color: "var(--gray)",
                    cursor: "pointer",
                  }}
                >
                  «
                </button>
                <button
                  onClick={() => setPagina((p) => p - 1)}
                  disabled={pagina === 1}
                  style={{
                    padding: "5px 9px",
                    borderRadius: "5px",
                    border: "1px solid var(--blk5)",
                    background: "transparent",
                    color: "var(--gray)",
                    cursor: "pointer",
                  }}
                >
                  ‹
                </button>
                <button
                  onClick={() => setPagina((p) => p + 1)}
                  disabled={pagina >= totalPaginas}
                  style={{
                    padding: "5px 9px",
                    borderRadius: "5px",
                    border: "1px solid var(--blk5)",
                    background: "transparent",
                    color: "var(--gray)",
                    cursor: "pointer",
                  }}
                >
                  ›
                </button>
                <button
                  onClick={() => setPagina(totalPaginas)}
                  disabled={pagina >= totalPaginas}
                  style={{
                    padding: "5px 9px",
                    borderRadius: "5px",
                    border: "1px solid var(--blk5)",
                    background: "transparent",
                    color: "var(--gray)",
                    cursor: "pointer",
                  }}
                >
                  »
                </button>
              </div>
            </div>
          </>
        )}

        {/* Vista Estadísticas */}
        {vista === "stats" && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "16px",
            }}
          >
            <div
              style={{
                background: "var(--blk2)",
                border: "1px solid var(--blk4)",
                borderRadius: "10px",
                padding: "20px",
              }}
            >
              <div
                style={{
                  fontSize: "13px",
                  fontWeight: "500",
                  color: "var(--wht)",
                  marginBottom: "4px",
                }}
              >
                Tiempo promedio por transportadora
              </div>
              <div
                style={{
                  fontSize: "10px",
                  color: "var(--gray)",
                  marginBottom: "16px",
                }}
              >
                Días promedio en guías entregadas
              </div>
              {tiempos.length === 0 ? (
                <div style={{ fontSize: "12px", color: "var(--gray)" }}>
                  Sin datos aún
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                  }}
                >
                  {tiempos.map((t) => (
                    <div key={t.nombre}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: "11px",
                          marginBottom: "4px",
                        }}
                      >
                        <span style={{ color: "var(--wht2)" }}>{t.nombre}</span>
                        <span
                          style={{
                            color:
                              t.promedio <= 3
                                ? "var(--m)"
                                : t.promedio <= 7
                                  ? "var(--warn)"
                                  : "var(--danger)",
                            fontFamily: "var(--font-mono)",
                            fontWeight: "700",
                          }}
                        >
                          {t.promedio} días · {t.total} entregas
                        </span>
                      </div>
                      <div
                        style={{
                          height: "7px",
                          background: "var(--blk3)",
                          borderRadius: "4px",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            width: `${(t.promedio / maxPromedio) * 100}%`,
                            background:
                              t.promedio <= 3
                                ? "var(--m)"
                                : t.promedio <= 7
                                  ? "var(--warn)"
                                  : "var(--danger)",
                            borderRadius: "4px",
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div
              style={{
                background: "var(--blk2)",
                border: "1px solid var(--blk4)",
                borderRadius: "10px",
                padding: "20px",
              }}
            >
              <div
                style={{
                  fontSize: "13px",
                  fontWeight: "500",
                  color: "var(--wht)",
                  marginBottom: "4px",
                }}
              >
                Tiempo promedio por ciudad
              </div>
              <div
                style={{
                  fontSize: "10px",
                  color: "var(--gray)",
                  marginBottom: "16px",
                }}
              >
                Top 15 ciudades · mínimo 2 entregas
              </div>
              {ciudades.length === 0 ? (
                <div style={{ fontSize: "12px", color: "var(--gray)" }}>
                  Sin datos aún
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                    maxHeight: "400px",
                    overflowY: "auto",
                  }}
                >
                  {ciudades.map((c) => (
                    <div key={c.ciudad}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: "11px",
                          marginBottom: "3px",
                        }}
                      >
                        <span style={{ color: "var(--wht2)" }}>{c.ciudad}</span>
                        <span
                          style={{
                            color: "#55AAFF",
                            fontFamily: "var(--font-mono)",
                            fontWeight: "700",
                          }}
                        >
                          {c.promedio} días · {c.total} env.
                        </span>
                      </div>
                      <div
                        style={{
                          height: "5px",
                          background: "var(--blk3)",
                          borderRadius: "3px",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            width: `${(c.promedio / maxCiudad) * 100}%`,
                            background: "#55AAFF",
                            borderRadius: "3px",
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
