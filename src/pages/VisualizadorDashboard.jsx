import { useEffect, useState } from "react";
import { supabase, ESTADOS } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { PillEstado, PillTransportadora } from "../components/UI";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

const COLORES = [
  "#AAFF00",
  "#55AAFF",
  "#AA88FF",
  "#FFAA00",
  "#FF6655",
  "#44DDBB",
];

export default function VisualizadorDashboard() {
  const { perfil, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [vista, setVista] = useState("guias");
  const [stats, setStats] = useState(null);
  const [tiempos, setTiempos] = useState([]);
  const [ciudades, setCiudades] = useState([]);
  const [enviosMes, setEnviosMes] = useState({
    meses: [],
    transportadoras: [],
    datos: {},
  });
  const [guias, setGuias] = useState([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [filtroTexto, setFiltroTexto] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroAsesor, setFiltroAsesor] = useState("");
  const [asesores, setAsesores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [menuAbierto, setMenuAbierto] = useState(false);

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
    const [statsRes, asesorRes, guiasEntregadasRes, todasRes] =
      await Promise.all([
        supabase.from("dashboard_stats").select("*").single(),
        supabase
          .from("usuarios")
          .select("id, nombre")
          .eq("rol", "asesor")
          .order("nombre"),
        supabase
          .from("guias")
          .select(
            "transportadora, transportadora_nombre, dias_habiles, ciudad_destino",
          )
          .eq("estado", "entregado")
          .not("dias_habiles", "is", null)
          .limit(2000),
        supabase
          .from("guias")
          .select("transportadora, transportadora_nombre, fecha_guia")
          .not("fecha_guia", "is", null)
          .gte(
            "fecha_guia",
            new Date(Date.now() - 180 * 86400000).toISOString().split("T")[0],
          )
          .limit(5000),
      ]);

    if (statsRes.data) setStats(statsRes.data);
    setAsesores(asesorRes.data || []);

    // Tiempos por transportadora + ciudad
    const porTrans = {};
    for (const g of guiasEntregadasRes.data || []) {
      const key =
        g.transportadora_nombre ||
        (g.transportadora === "estelar"
          ? "Estelar Express"
          : g.transportadora === "tcc"
            ? "TCC"
            : g.transportadora);
      if (!porTrans[key])
        porTrans[key] = { total: 0, sumDias: 0, ciudades: {} };
      porTrans[key].total++;
      porTrans[key].sumDias += g.dias_habiles || 0;
      const ciudad = g.ciudad_destino || "Sin ciudad";
      if (!porTrans[key].ciudades[ciudad])
        porTrans[key].ciudades[ciudad] = { total: 0, sumDias: 0 };
      porTrans[key].ciudades[ciudad].total++;
      porTrans[key].ciudades[ciudad].sumDias += g.dias_habiles || 0;
    }
    setTiempos(
      Object.entries(porTrans)
        .map(([nombre, d]) => ({
          nombre,
          total: d.total,
          promedio: Math.round(d.sumDias / d.total),
          ciudades: Object.entries(d.ciudades)
            .map(([ciudad, c]) => ({
              ciudad,
              total: c.total,
              promedio: Math.round(c.sumDias / c.total),
            }))
            .filter((c) => c.total >= 2)
            .sort((a, b) => b.total - a.total)
            .slice(0, 6),
        }))
        .sort((a, b) => a.promedio - b.promedio),
    );

    // Envíos por mes
    const meses = {};
    for (const g of todasRes.data || []) {
      if (!g.fecha_guia) continue;
      const mes = g.fecha_guia.substring(0, 7);
      const trans =
        g.transportadora_nombre ||
        (g.transportadora === "estelar"
          ? "Estelar Express"
          : g.transportadora === "tcc"
            ? "TCC"
            : "Otra");
      if (!meses[mes]) meses[mes] = {};
      if (!meses[mes][trans]) meses[mes][trans] = 0;
      meses[mes][trans]++;
    }
    const mesesOrdenados = Object.keys(meses).sort();
    const transportadoras = [
      ...new Set(
        (todasRes.data || []).map(
          (g) =>
            g.transportadora_nombre ||
            (g.transportadora === "estelar"
              ? "Estelar Express"
              : g.transportadora === "tcc"
                ? "TCC"
                : "Otra"),
        ),
      ),
    ];
    setEnviosMes({ meses: mesesOrdenados, transportadoras, datos: meses });

    setLoading(false);
  }

  async function cargarGuias() {
    setLoading(true);
    const desde = (pagina - 1) * POR_PAGINA;
    let q = supabase
      .from("guias")
      .select(
        "id, numero_guia, transportadora, transportadora_nombre, factura_indurruedas, estado, fecha_guia, fecha_entrega, dias_habiles, ciudad_destino, destinatario, clientes(nombre, nit, usuarios(nombre))",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(desde, desde + POR_PAGINA - 1);
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
      const oa = ORDEN[a.estado] ?? 7,
        ob = ORDEN[b.estado] ?? 7;
      if (oa !== ob) return oa - ob;
      return new Date(b.fecha_guia || 0) - new Date(a.fecha_guia || 0);
    });
    setGuias(resultado);
    setTotal(count || 0);
    setLoading(false);
  }

  const totalPaginas = Math.ceil(total / POR_PAGINA);
  const maxTiempo = Math.max(...tiempos.map((t) => t.promedio), 1);

  const TransPill = ({ g }) =>
    g.transportadora === "otra" ? (
      <span
        style={{
          fontSize: "10px",
          padding: "2px 6px",
          borderRadius: "20px",
          background: "rgba(170,136,255,0.15)",
          border: "1px solid rgba(170,136,255,0.4)",
          color: "#AA88FF",
          fontWeight: "500",
        }}
      >
        {g.transportadora_nombre?.split(" ").slice(0, 2).join(" ") || "Otra"}
      </span>
    ) : (
      <PillTransportadora transportadora={g.transportadora} />
    );

  return (
    <div style={{ minHeight: "100vh", background: "var(--blk)" }}>
      {/* Header */}
      <div
        style={{
          background: "var(--blk2)",
          borderBottom: "1px solid var(--blk4)",
          padding: "10px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "sticky",
          top: 0,
          zIndex: 20,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div
            style={{
              width: "30px",
              height: "30px",
              background: "var(--m)",
              borderRadius: "7px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "12px",
              fontWeight: "700",
              color: theme === "dark" ? "#0E0E0E" : "#fff",
              fontFamily: "var(--font-mono)",
              flexShrink: 0,
            }}
          >
            M
          </div>
          <span
            style={{ fontSize: "12px", fontWeight: "500", color: "var(--wht)" }}
          >
            Panel de visualización
          </span>
        </div>
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <button
            onClick={toggleTheme}
            style={{
              background: "transparent",
              border: "1px solid var(--blk5)",
              borderRadius: "6px",
              color: "var(--gray)",
              fontSize: "13px",
              padding: "4px 7px",
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
              padding: "4px 9px",
              cursor: "pointer",
            }}
          >
            Salir
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div
        style={{
          background: "var(--blk2)",
          borderBottom: "1px solid var(--blk4)",
          padding: "0 16px",
          display: "flex",
          gap: "4px",
        }}
      >
        {[
          ["guias", "📦 Guías"],
          ["stats", "📊 Estadísticas"],
        ].map(([v, label]) => (
          <button
            key={v}
            onClick={() => setVista(v)}
            style={{
              padding: "10px 14px",
              fontSize: "12px",
              fontWeight: "500",
              cursor: "pointer",
              border: "none",
              background: "transparent",
              color: vista === v ? "var(--m)" : "var(--gray)",
              borderBottom:
                vista === v ? "2px solid var(--m)" : "2px solid transparent",
              transition: "all .15s",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        style={{ padding: "14px 16px", maxWidth: "1400px", margin: "0 auto" }}
      >
        {/* KPIs */}
        {stats && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: "8px",
              marginBottom: "16px",
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
                label: "+6 días sin entrega",
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
                  padding: "12px 14px",
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
                flexDirection: "column",
                gap: "8px",
                marginBottom: "12px",
              }}
            >
              <input
                value={filtroTexto}
                onChange={(e) => setFiltroTexto(e.target.value)}
                placeholder="Buscar guía, factura, cliente, ciudad..."
                style={{ width: "100%" }}
              />
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <select
                  value={filtroEstado}
                  onChange={(e) => {
                    setFiltroEstado(e.target.value);
                    setPagina(1);
                  }}
                  style={{ flex: 1, minWidth: "140px" }}
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
                  style={{ flex: 1, minWidth: "140px" }}
                >
                  <option value="">Todos los asesores</option>
                  {asesores.map((a) => (
                    <option key={a.id} value={a.nombre}>
                      {a.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Tarjetas en móvil */}
            <div
              style={{ display: "flex", flexDirection: "column", gap: "8px" }}
            >
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
                  <div
                    key={g.id}
                    style={{
                      background: "var(--blk2)",
                      border: "1px solid var(--blk4)",
                      borderRadius: "10px",
                      padding: "12px",
                      borderLeft: `3px solid ${g.estado === "novedad" ? "var(--danger)" : g.estado === "entregado" ? "var(--m)" : dias >= 6 ? "var(--warn)" : "var(--blk5)"}`,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: "6px",
                        flexWrap: "wrap",
                        gap: "4px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          flexWrap: "wrap",
                        }}
                      >
                        <span
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: "11px",
                            fontWeight: "700",
                            color: "var(--m)",
                          }}
                        >
                          {g.numero_guia}
                        </span>
                        <TransPill g={g} />
                        {g.factura_indurruedas && (
                          <span
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontSize: "10px",
                              color: "var(--gray)",
                              background: "var(--blk3)",
                              padding: "1px 5px",
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
                        marginBottom: "5px",
                      }}
                    >
                      {g.clientes?.nombre || g.destinatario || "—"}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "10px",
                        fontSize: "11px",
                        color: "var(--gray)",
                      }}
                    >
                      <span>📍 {g.ciudad_destino || "—"}</span>
                      <span>👤 {g.clientes?.usuarios?.nombre || "—"}</span>
                      <span>
                        {g.fecha_guia
                          ? format(parseISO(g.fecha_guia), "d MMM yy", {
                              locale: es,
                            })
                          : "—"}
                      </span>
                      <span
                        style={{
                          color: dias >= 6 ? "var(--danger)" : "var(--m)",
                          fontFamily: "var(--font-mono)",
                          fontWeight: "500",
                        }}
                      >
                        {dias}d
                      </span>
                    </div>
                  </div>
                );
              })}
              {guias.length === 0 && !loading && (
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
                marginTop: "10px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "8px",
              }}
            >
              <span style={{ fontSize: "11px", color: "var(--gray)" }}>
                {Math.min((pagina - 1) * POR_PAGINA + 1, total)}–
                {Math.min(pagina * POR_PAGINA, total)} de{" "}
                {total.toLocaleString()}
              </span>
              <div style={{ display: "flex", gap: "5px" }}>
                {[
                  ["«", () => setPagina(1)],
                  ["‹", () => setPagina((p) => p - 1)],
                  ["›", () => setPagina((p) => p + 1)],
                  ["»", () => setPagina(totalPaginas)],
                ].map(([label, fn], i) => (
                  <button
                    key={i}
                    onClick={fn}
                    disabled={
                      (i < 2 && pagina === 1) ||
                      (i >= 2 && pagina >= totalPaginas)
                    }
                    style={{
                      padding: "6px 10px",
                      borderRadius: "5px",
                      border: "1px solid var(--blk5)",
                      background: "transparent",
                      color: "var(--gray)",
                      cursor: "pointer",
                      fontSize: "12px",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Vista Estadísticas */}
        {vista === "stats" && (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "16px" }}
          >
            {/* Barras días promedio */}
            {tiempos.length > 0 && (
              <div
                style={{
                  background: "var(--blk2)",
                  border: "1px solid var(--blk4)",
                  borderRadius: "10px",
                  padding: "16px",
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
                  Días promedio de entrega
                </div>
                <div
                  style={{
                    fontSize: "10px",
                    color: "var(--gray)",
                    marginBottom: "16px",
                  }}
                >
                  Verde ≤3 · Naranja ≤6 · Rojo {">"} 6
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: "12px",
                    alignItems: "flex-end",
                    height: "140px",
                    marginBottom: "16px",
                  }}
                >
                  {tiempos.map((t, i) => {
                    const color =
                      t.promedio <= 3
                        ? "var(--m)"
                        : t.promedio <= 6
                          ? "var(--warn)"
                          : "var(--danger)";
                    return (
                      <div
                        key={t.nombre}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          flex: 1,
                          height: "100%",
                          justifyContent: "flex-end",
                        }}
                      >
                        <div
                          style={{
                            fontSize: "13px",
                            fontWeight: "700",
                            fontFamily: "var(--font-mono)",
                            color,
                            marginBottom: "4px",
                          }}
                        >
                          {t.promedio}d
                        </div>
                        <div
                          style={{
                            width: "100%",
                            height: `${Math.max(15, (t.promedio / maxTiempo) * 100)}%`,
                            background: color,
                            borderRadius: "5px 5px 0 0",
                            opacity: 0.85,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            minHeight: "20px",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "9px",
                              color: "rgba(0,0,0,0.6)",
                              fontWeight: "700",
                            }}
                          >
                            {t.total}
                          </span>
                        </div>
                        <div
                          style={{
                            fontSize: "9px",
                            color: "var(--gray)",
                            marginTop: "5px",
                            textAlign: "center",
                            lineHeight: 1.3,
                          }}
                        >
                          {t.nombre.split(" ").slice(0, 2).join(" ")}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* Ciudades */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "14px",
                    borderTop: "1px solid var(--blk4)",
                    paddingTop: "14px",
                  }}
                >
                  {tiempos.map((t) => (
                    <div key={t.nombre}>
                      <div
                        style={{
                          fontSize: "11px",
                          fontWeight: "500",
                          color: "var(--wht2)",
                          marginBottom: "7px",
                        }}
                      >
                        {t.nombre}
                      </div>
                      {t.ciudades.map((c) => {
                        const cColor =
                          c.promedio <= 3
                            ? "var(--m)"
                            : c.promedio <= 6
                              ? "var(--warn)"
                              : "var(--danger)";
                        const maxC = Math.max(
                          ...t.ciudades.map((x) => x.promedio),
                          1,
                        );
                        return (
                          <div key={c.ciudad} style={{ marginBottom: "6px" }}>
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                fontSize: "10px",
                                marginBottom: "2px",
                              }}
                            >
                              <span style={{ color: "var(--gray)" }}>
                                {c.ciudad}
                              </span>
                              <span
                                style={{
                                  color: cColor,
                                  fontFamily: "var(--font-mono)",
                                  fontWeight: "500",
                                }}
                              >
                                {c.promedio}d · {c.total} env.
                              </span>
                            </div>
                            <div
                              style={{
                                height: "4px",
                                background: "var(--blk3)",
                                borderRadius: "2px",
                                overflow: "hidden",
                              }}
                            >
                              <div
                                style={{
                                  height: "100%",
                                  width: `${(c.promedio / maxC) * 100}%`,
                                  background: cColor,
                                  borderRadius: "2px",
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                      {t.ciudades.length === 0 && (
                        <div style={{ fontSize: "10px", color: "var(--gray)" }}>
                          Sin suficientes datos por ciudad
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Envíos por mes */}
            {enviosMes.meses.length > 0 && (
              <div
                style={{
                  background: "var(--blk2)",
                  border: "1px solid var(--blk4)",
                  borderRadius: "10px",
                  padding: "16px",
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
                  Envíos por mes
                </div>
                <div
                  style={{
                    fontSize: "10px",
                    color: "var(--gray)",
                    marginBottom: "12px",
                  }}
                >
                  Últimos 6 meses por transportadora
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: "12px",
                    flexWrap: "wrap",
                    marginBottom: "14px",
                  }}
                >
                  {enviosMes.transportadoras.map((t, i) => (
                    <div
                      key={t}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "5px",
                      }}
                    >
                      <div
                        style={{
                          width: "10px",
                          height: "10px",
                          borderRadius: "2px",
                          background: COLORES[i % COLORES.length],
                        }}
                      ></div>
                      <span style={{ fontSize: "10px", color: "var(--gray)" }}>
                        {t}
                      </span>
                    </div>
                  ))}
                </div>
                <div style={{ overflowX: "auto" }}>
                  <div
                    style={{
                      display: "flex",
                      gap: "8px",
                      alignItems: "flex-end",
                      minWidth: `${enviosMes.meses.length * 70}px`,
                    }}
                  >
                    {enviosMes.meses.map((mes) => {
                      const datosMes = enviosMes.datos[mes] || {};
                      const maxMes = Math.max(
                        ...enviosMes.transportadoras.map(
                          (t) => datosMes[t] || 0,
                        ),
                        1,
                      );
                      const totalMes = enviosMes.transportadoras.reduce(
                        (s, t) => s + (datosMes[t] || 0),
                        0,
                      );
                      return (
                        <div
                          key={mes}
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            flex: 1,
                            minWidth: "60px",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              gap: "2px",
                              alignItems: "flex-end",
                              height: "100px",
                              width: "100%",
                            }}
                          >
                            {enviosMes.transportadoras.map((t, i) => {
                              const val = datosMes[t] || 0;
                              return (
                                <div
                                  key={t}
                                  style={{
                                    flex: 1,
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    justifyContent: "flex-end",
                                    height: "100%",
                                  }}
                                >
                                  {val > 0 && (
                                    <div
                                      style={{
                                        fontSize: "8px",
                                        color: COLORES[i % COLORES.length],
                                        marginBottom: "1px",
                                      }}
                                    >
                                      {val}
                                    </div>
                                  )}
                                  <div
                                    style={{
                                      width: "100%",
                                      height:
                                        val > 0
                                          ? `${Math.max(6, (val / maxMes) * 100)}%`
                                          : "0",
                                      background: COLORES[i % COLORES.length],
                                      borderRadius: "2px 2px 0 0",
                                      opacity: 0.85,
                                    }}
                                  />
                                </div>
                              );
                            })}
                          </div>
                          <div
                            style={{
                              height: "1px",
                              background: "var(--blk4)",
                              width: "100%",
                            }}
                          ></div>
                          <div
                            style={{
                              fontSize: "9px",
                              color: "var(--gray)",
                              marginTop: "4px",
                              textAlign: "center",
                            }}
                          >
                            {format(new Date(mes + "-01"), "MMM yy", {
                              locale: es,
                            })}
                          </div>
                          <div
                            style={{
                              fontSize: "9px",
                              color: "var(--wht3)",
                              fontFamily: "var(--font-mono)",
                            }}
                          >
                            {totalMes}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
