import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  KPICard,
  PageHeader,
  PillEstado,
  PillTransportadora,
} from "../components/UI";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { useNavigate } from "react-router-dom";

const COLORES = [
  "#AAFF00",
  "#55AAFF",
  "#AA88FF",
  "#FFAA00",
  "#FF6655",
  "#44DDBB",
  "#FF88CC",
];

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    guias_activas: 0,
    entregadas: 0,
    con_novedad: 0,
    estelar_activas: 0,
    tcc_activas: 0,
  });
  const [porAsesor, setPorAsesor] = useState([]);
  const [porEstado, setPorEstado] = useState([]);
  const [ultimasGuias, setUltimasGuias] = useState([]);
  const [syncs, setSyncs] = useState({
    bot: null,
    excel_estelar: null,
    excel_tcc: null,
  });
  const [guiasCriticas, setGuiasCriticas] = useState([]);
  const [tiemposTrans, setTiemposTrans] = useState([]);
  const [enviosMes, setEnviosMes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    cargarDatos();
  }, []);

  async function cargarDatos() {
    setLoading(true);
    const hace6Dias = new Date(Date.now() - 6 * 86400000)
      .toISOString()
      .split("T")[0];

    const [
      statsRes,
      asesorRes,
      estadoRes,
      recientesRes,
      syncRes,
      criticasRes,
      entregadasRes,
      todasRes,
    ] = await Promise.all([
      supabase.from("dashboard_stats").select("*").single(),
      supabase.rpc("guias_por_asesor"),
      supabase.rpc("guias_por_estado"),
      supabase
        .from("guias")
        .select(
          "numero_guia, transportadora, transportadora_nombre, estado, fecha_guia, ciudad_destino, clientes(nombre, usuarios(nombre))",
        )
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("sync_log")
        .select(
          "created_at, guias_nuevas, guias_actualizadas, transportadora, detalle",
        )
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("guias")
        .select(
          "id, numero_guia, transportadora, transportadora_nombre, factura_indurruedas, estado, fecha_guia, ciudad_destino, clientes(nombre, usuarios(nombre))",
        )
        .eq("activa", true)
        .neq("estado", "entregado")
        .neq("estado", "anulada")
        .lt("fecha_guia", hace6Dias)
        .order("fecha_guia", { ascending: true })
        .limit(50),
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
    setPorAsesor(asesorRes.data || []);
    setPorEstado(estadoRes.data || []);
    setUltimasGuias(recientesRes.data || []);
    setGuiasCriticas(criticasRes.data || []);

    const logs = syncRes.data || [];
    setSyncs({
      bot: logs.find((l) => l.detalle?.tipo === "bot_rastreo"),
      excel_estelar: logs.find(
        (l) =>
          l.transportadora === "estelar" && l.detalle?.tipo !== "bot_rastreo",
      ),
      excel_tcc: logs.find((l) => l.transportadora === "tcc"),
    });

    // Tiempos promedio por transportadora + ciudad
    const guiasEntregadas = entregadasRes.data || [];
    const porTrans = {};
    for (const g of guiasEntregadas) {
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
    setTiemposTrans(
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

    // Envíos por mes por transportadora (últimos 6 meses)
    const todasGuias = todasRes.data || [];
    const meses = {};
    for (const g of todasGuias) {
      if (!g.fecha_guia) continue;
      const mes = g.fecha_guia.substring(0, 7); // YYYY-MM
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
        todasGuias.map(
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

  const maxAsesor = porAsesor[0]?.total || 1;

  if (loading)
    return (
      <div
        style={{
          color: "var(--m)",
          fontFamily: "var(--font-mono)",
          fontSize: "12px",
        }}
      >
        Cargando dashboard...
      </div>
    );

  const maxTiempo = Math.max(...tiemposTrans.map((t) => t.promedio), 1);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Resumen de guías y envíos activos"
      />

      {/* Banner críticas */}
      {guiasCriticas.length > 0 && (
        <div
          style={{
            background: "#1a0800",
            border: "1px solid var(--danger)",
            borderRadius: "10px",
            padding: "14px 16px",
            marginBottom: "16px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "10px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "16px" }}>🚨</span>
              <span
                style={{
                  fontSize: "13px",
                  fontWeight: "500",
                  color: "var(--danger)",
                }}
              >
                {guiasCriticas.length} guía{guiasCriticas.length > 1 ? "s" : ""}{" "}
                con más de 6 días sin entrega
              </span>
            </div>
            <button
              onClick={() => navigate("/guias?estado=criticas")}
              style={{
                fontSize: "11px",
                padding: "5px 12px",
                background: "var(--danger)",
                color: "#fff",
                border: "none",
                borderRadius: "5px",
                cursor: "pointer",
                fontWeight: "500",
              }}
            >
              Ver todas →
            </button>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "5px",
              maxHeight: "200px",
              overflowY: "auto",
            }}
          >
            {guiasCriticas.map((g) => {
              const dias = g.fecha_guia
                ? Math.floor((new Date() - new Date(g.fecha_guia)) / 86400000)
                : 0;
              return (
                <div
                  key={g.id}
                  onClick={() => navigate("/guias?buscar=" + g.numero_guia)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "7px 10px",
                    background: "rgba(255,68,68,0.07)",
                    borderRadius: "6px",
                    flexWrap: "wrap",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "rgba(255,68,68,0.18)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "rgba(255,68,68,0.07)")
                  }
                >
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "11px",
                      color: "var(--danger)",
                      fontWeight: "700",
                      minWidth: "100px",
                    }}
                  >
                    {g.numero_guia}
                  </span>
                  {g.transportadora === "otra" ? (
                    <span
                      style={{
                        fontSize: "10px",
                        color: "#CC99FF",
                        background: "rgba(170,136,255,0.2)",
                        padding: "2px 8px",
                        borderRadius: "10px",
                        border: "1px solid rgba(170,136,255,0.4)",
                        fontWeight: "500",
                      }}
                    >
                      {g.transportadora_nombre
                        ?.split(" ")
                        .slice(0, 2)
                        .join(" ")}
                    </span>
                  ) : g.transportadora === "estelar" ? (
                    <span
                      style={{
                        fontSize: "10px",
                        color: "#AAFF00",
                        background: "rgba(170,255,0,0.15)",
                        padding: "2px 8px",
                        borderRadius: "10px",
                        border: "1px solid rgba(170,255,0,0.4)",
                        fontWeight: "500",
                      }}
                    >
                      Estelar Express
                    </span>
                  ) : (
                    <span
                      style={{
                        fontSize: "10px",
                        color: "#88AAFF",
                        background: "rgba(85,170,255,0.15)",
                        padding: "2px 8px",
                        borderRadius: "10px",
                        border: "1px solid rgba(85,170,255,0.4)",
                        fontWeight: "500",
                      }}
                    >
                      TCC
                    </span>
                  )}
                  <span
                    style={{
                      fontSize: "11px",
                      color: "var(--wht2)",
                      flex: 1,
                      minWidth: "120px",
                    }}
                  >
                    {g.clientes?.nombre || "—"}
                  </span>
                  <span style={{ fontSize: "11px", color: "var(--gray)" }}>
                    {g.ciudad_destino || "—"}
                  </span>
                  <span style={{ fontSize: "11px", color: "var(--gray)" }}>
                    {g.clientes?.usuarios?.nombre || "—"}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "12px",
                      fontWeight: "700",
                      color: "var(--danger)",
                      background: "rgba(255,68,68,0.2)",
                      padding: "2px 8px",
                      borderRadius: "4px",
                    }}
                  >
                    {dias}d
                  </span>
                  <PillEstado estado={g.estado} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* KPIs */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0,1fr))",
          gap: "12px",
          marginBottom: "20px",
        }}
      >
        <KPICard
          label="Guías activas"
          value={stats.guias_activas}
          sub="En este momento"
          accent="var(--m)"
        />
        <KPICard
          label="Entregadas"
          value={stats.entregadas}
          sub="Historial total"
        />
        <KPICard
          label="Con novedad"
          value={stats.con_novedad}
          sub="Requieren atención"
          accent={stats.con_novedad > 0 ? "var(--warn)" : undefined}
        />
        <KPICard
          label="+6 días sin entrega"
          value={guiasCriticas.length}
          sub="Críticas"
          accent={guiasCriticas.length > 0 ? "var(--danger)" : undefined}
        />
      </div>

      {/* Asesor + Estado */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "16px",
          marginBottom: "16px",
        }}
      >
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
              fontSize: "10px",
              color: "var(--gray)",
              textTransform: "uppercase",
              letterSpacing: ".05em",
              marginBottom: "14px",
            }}
          >
            Guías activas por asesor
          </div>
          {porAsesor.map(({ nombre, total }) => (
            <div
              key={nombre}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                marginBottom: "9px",
              }}
            >
              <span
                style={{
                  fontSize: "11px",
                  color: "var(--wht2)",
                  width: "140px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                {nombre}
              </span>
              <div
                style={{
                  flex: 1,
                  height: "5px",
                  background: "var(--blk3)",
                  borderRadius: "3px",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${(total / maxAsesor) * 100}%`,
                    background: "var(--m)",
                    borderRadius: "3px",
                  }}
                />
              </div>
              <span
                style={{
                  fontSize: "11px",
                  color: "var(--gray)",
                  width: "24px",
                  textAlign: "right",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {total}
              </span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div
            style={{
              background: "var(--blk2)",
              border: "1px solid var(--blk4)",
              borderRadius: "10px",
              padding: "16px",
              flex: 1,
            }}
          >
            <div
              style={{
                fontSize: "10px",
                color: "var(--gray)",
                textTransform: "uppercase",
                letterSpacing: ".05em",
                marginBottom: "12px",
              }}
            >
              Estado de guías activas
            </div>
            {porEstado.map(({ estado, total }) => (
              <div
                key={estado}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "5px 0",
                  borderBottom: "1px solid var(--blk3)",
                }}
              >
                <PillEstado estado={estado} />
                <span
                  style={{
                    fontSize: "12px",
                    color: "var(--gray)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {total}
                </span>
              </div>
            ))}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "8px",
            }}
          >
            <div
              style={{
                background: "var(--blk2)",
                border: "1px solid var(--blk4)",
                borderRadius: "8px",
                padding: "12px",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: "10px",
                  color: "var(--gray)",
                  marginBottom: "4px",
                }}
              >
                Estelar Express
              </div>
              <div
                style={{
                  fontSize: "22px",
                  fontWeight: "500",
                  color: "var(--m)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {stats.estelar_activas}
              </div>
            </div>
            <div
              style={{
                background: "var(--blk2)",
                border: "1px solid var(--blk4)",
                borderRadius: "8px",
                padding: "12px",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: "10px",
                  color: "var(--gray)",
                  marginBottom: "4px",
                }}
              >
                TCC
              </div>
              <div
                style={{
                  fontSize: "22px",
                  fontWeight: "500",
                  color: "var(--purple)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {stats.tcc_activas}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Gráfica: días promedio por transportadora */}
      {tiemposTrans.length > 0 && (
        <div
          style={{
            background: "var(--blk2)",
            border: "1px solid var(--blk4)",
            borderRadius: "10px",
            padding: "20px",
            marginBottom: "16px",
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
            Tiempo promedio de entrega por transportadora
          </div>
          <div
            style={{
              fontSize: "10px",
              color: "var(--gray)",
              marginBottom: "20px",
            }}
          >
            Días hábiles promedio · verde ≤3 · naranja ≤6 · rojo {">"} 6
          </div>
          <div
            style={{
              display: "flex",
              gap: "24px",
              alignItems: "flex-end",
              height: "160px",
              marginBottom: "20px",
            }}
          >
            {tiemposTrans.map((t, i) => {
              const color =
                t.promedio <= 3
                  ? "var(--m)"
                  : t.promedio <= 6
                    ? "var(--warn)"
                    : "var(--danger)";
              const altura = `${Math.max(20, (t.promedio / maxTiempo) * 100)}%`;
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
                      fontSize: "14px",
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
                      height: altura,
                      background: color,
                      borderRadius: "6px 6px 0 0",
                      opacity: 0.85,
                      minHeight: "20px",
                      position: "relative",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "9px",
                        color: "rgba(0,0,0,0.7)",
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
                      marginTop: "6px",
                      textAlign: "center",
                      maxWidth: "80px",
                      lineHeight: 1.3,
                    }}
                  >
                    {t.nombre.split(" ").slice(0, 2).join(" ")}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Detalle ciudades por transportadora */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px,1fr))",
              gap: "12px",
              borderTop: "1px solid var(--blk4)",
              paddingTop: "16px",
            }}
          >
            {tiemposTrans.map((t, ti) => (
              <div key={t.nombre}>
                <div
                  style={{
                    fontSize: "11px",
                    fontWeight: "500",
                    color: "var(--wht2)",
                    marginBottom: "8px",
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
                        <span
                          style={{
                            color: "var(--gray)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            maxWidth: "120px",
                          }}
                        >
                          {c.ciudad}
                        </span>
                        <span
                          style={{
                            color: cColor,
                            fontFamily: "var(--font-mono)",
                            fontWeight: "500",
                            flexShrink: 0,
                          }}
                        >
                          {c.promedio}d · {c.total}
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
                    Sin datos por ciudad aún
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Gráfica: envíos por mes por transportadora */}
      {enviosMes.meses?.length > 0 && (
        <div
          style={{
            background: "var(--blk2)",
            border: "1px solid var(--blk4)",
            borderRadius: "10px",
            padding: "20px",
            marginBottom: "16px",
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
            Envíos por mes por transportadora
          </div>
          <div
            style={{
              fontSize: "10px",
              color: "var(--gray)",
              marginBottom: "16px",
            }}
          >
            Últimos 6 meses
          </div>

          {/* Leyenda */}
          <div
            style={{
              display: "flex",
              gap: "16px",
              flexWrap: "wrap",
              marginBottom: "16px",
            }}
          >
            {enviosMes.transportadoras?.map((t, i) => (
              <div
                key={t}
                style={{ display: "flex", alignItems: "center", gap: "5px" }}
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

          {/* Barras agrupadas */}
          <div
            style={{
              display: "flex",
              gap: "8px",
              alignItems: "flex-end",
              overflowX: "auto",
              paddingBottom: "8px",
            }}
          >
            {enviosMes.meses?.map((mes) => {
              const datosMes = enviosMes.datos[mes] || {};
              const maxMes = Math.max(
                ...(enviosMes.transportadoras?.map((t) => datosMes[t] || 0) || [
                  1,
                ]),
                1,
              );
              const totalMes = enviosMes.transportadoras?.reduce(
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
                    minWidth: "80px",
                    flex: 1,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      gap: "3px",
                      alignItems: "flex-end",
                      height: "120px",
                      width: "100%",
                    }}
                  >
                    {enviosMes.transportadoras?.map((t, i) => {
                      const val = datosMes[t] || 0;
                      const h =
                        val > 0
                          ? `${Math.max(8, (val / maxMes) * 100)}%`
                          : "0px";
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
                                marginBottom: "2px",
                                fontFamily: "var(--font-mono)",
                              }}
                            >
                              {val}
                            </div>
                          )}
                          <div
                            style={{
                              width: "100%",
                              height: h,
                              background: COLORES[i % COLORES.length],
                              borderRadius: "3px 3px 0 0",
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
                      marginTop: "5px",
                      textAlign: "center",
                    }}
                  >
                    {format(new Date(mes + "-01"), "MMM yy", { locale: es })}
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
      )}

      {/* Syncs */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0,1fr))",
          gap: "10px",
          marginBottom: "16px",
        }}
      >
        {[
          {
            titulo: "Bot rastreo Estelar",
            icono: "🤖",
            data: syncs.bot,
            color: "var(--m)",
            detalle: syncs.bot
              ? `${syncs.bot.guias_actualizadas} estados actualizados`
              : null,
          },
          {
            titulo: "Ultimo Excel Estelar",
            icono: "📥",
            data: syncs.excel_estelar,
            color: "#55AAFF",
            detalle: syncs.excel_estelar
              ? `+${syncs.excel_estelar.guias_nuevas} nuevas · ${syncs.excel_estelar.guias_actualizadas} actualizadas`
              : null,
          },
          {
            titulo: "Ultimo Excel TCC",
            icono: "📥",
            data: syncs.excel_tcc,
            color: "#AA88FF",
            detalle: syncs.excel_tcc
              ? `+${syncs.excel_tcc.guias_nuevas} nuevas · ${syncs.excel_tcc.guias_actualizadas} actualizadas`
              : null,
          },
        ].map(({ titulo, icono, data, color, detalle }) => (
          <div
            key={titulo}
            style={{
              background: "var(--blk2)",
              border: "1px solid var(--blk4)",
              borderRadius: "8px",
              padding: "12px 14px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "7px",
                marginBottom: "6px",
              }}
            >
              <span style={{ fontSize: "14px" }}>{icono}</span>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: "500",
                  color: "var(--wht2)",
                }}
              >
                {titulo}
              </span>
            </div>
            {data ? (
              <>
                <div
                  style={{
                    fontSize: "11px",
                    color,
                    fontWeight: "500",
                    marginBottom: "2px",
                  }}
                >
                  {format(
                    parseISO(data.created_at),
                    "d MMM yyyy 'a las' h:mm a",
                    { locale: es },
                  )}
                </div>
                <div style={{ fontSize: "10px", color: "var(--gray)" }}>
                  {detalle}
                </div>
              </>
            ) : (
              <div style={{ fontSize: "11px", color: "var(--gray)" }}>
                Sin registros aún
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Guías recientes */}
      <div
        style={{
          background: "var(--blk2)",
          border: "1px solid var(--blk4)",
          borderRadius: "10px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "12px 16px",
            fontSize: "10px",
            color: "var(--gray)",
            textTransform: "uppercase",
            letterSpacing: ".05em",
            borderBottom: "1px solid var(--blk4)",
          }}
        >
          Guías ingresadas recientemente
        </div>
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
                "Transportadora",
                "Cliente",
                "Asesor",
                "Ciudad",
                "Fecha",
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
            {ultimasGuias.map((g) => (
              <tr
                key={g.numero_guia}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "var(--blk3)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "transparent")
                }
              >
                <td
                  style={{
                    padding: "8px 12px",
                    borderBottom: "1px solid var(--blk3)",
                    color: "var(--wht)",
                    fontFamily: "var(--font-mono)",
                    fontSize: "11px",
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
                    <PillTransportadora transportadora={g.transportadora} />
                  )}
                </td>
                <td
                  style={{
                    padding: "8px 12px",
                    borderBottom: "1px solid var(--blk3)",
                    color: "var(--wht2)",
                  }}
                >
                  {g.clientes?.nombre || "—"}
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
                    ? format(parseISO(g.fecha_guia), "d MMM yy", { locale: es })
                    : "—"}
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
            ))}
          </tbody>
        </table>
        {ultimasGuias.length === 0 && (
          <div
            style={{
              padding: "24px",
              textAlign: "center",
              color: "var(--gray)",
              fontSize: "12px",
            }}
          >
            Sin guías aún
          </div>
        )}
      </div>
    </div>
  );
}
