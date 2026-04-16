import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { PillEstado, PillTransportadora } from "../components/UI";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

export default function VisualizadorDashboard() {
  const { perfil, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [stats, setStats] = useState(null);
  const [tiempos, setTiempos] = useState([]);
  const [ciudades, setCiudades] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    cargarDatos();
  }, []);

  async function cargarDatos() {
    setLoading(true);
    const [statsRes, guiasRes] = await Promise.all([
      supabase.from("dashboard_stats").select("*").single(),
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

    const guias = guiasRes.data || [];

    // Agrupar por transportadora
    const porTrans = {};
    for (const g of guias) {
      const key = g.transportadora_nombre || g.transportadora;
      if (!porTrans[key]) porTrans[key] = { total: 0, sumDias: 0 };
      porTrans[key].total++;
      porTrans[key].sumDias += g.dias_habiles || 0;
    }
    const tiemposData = Object.entries(porTrans)
      .map(([nombre, d]) => ({
        nombre,
        total: d.total,
        promedio: Math.round(d.sumDias / d.total),
      }))
      .sort((a, b) => a.promedio - b.promedio);
    setTiempos(tiemposData);

    // Agrupar por ciudad
    const porCiudad = {};
    for (const g of guias) {
      const ciudad = g.ciudad_destino || "Sin ciudad";
      if (!porCiudad[ciudad]) porCiudad[ciudad] = { total: 0, sumDias: 0 };
      porCiudad[ciudad].total++;
      porCiudad[ciudad].sumDias += g.dias_habiles || 0;
    }
    const ciudadesData = Object.entries(porCiudad)
      .map(([ciudad, d]) => ({
        ciudad,
        total: d.total,
        promedio: Math.round(d.sumDias / d.total),
      }))
      .filter((c) => c.total >= 3)
      .sort((a, b) => b.total - a.total)
      .slice(0, 15);
    setCiudades(ciudadesData);

    setLoading(false);
  }

  const maxPromedio = Math.max(...tiempos.map((t) => t.promedio), 1);
  const maxCiudad = Math.max(...ciudades.map((c) => c.promedio), 1);

  return (
    <div style={{ minHeight: "100vh", background: "var(--blk)" }}>
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
              color: theme === "dark" ? "#0E0E0E" : "#fff",
              fontFamily: "var(--font-mono)",
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
              Panel de visualización
            </div>
            <div style={{ fontSize: "10px", color: "var(--gray)" }}>
              {perfil?.nombre} · Solo lectura
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
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

      <div style={{ padding: "20px", maxWidth: "1200px", margin: "0 auto" }}>
        {loading ? (
          <div
            style={{
              color: "var(--m)",
              fontFamily: "var(--font-mono)",
              fontSize: "12px",
            }}
          >
            Cargando datos...
          </div>
        ) : (
          <>
            {/* KPIs */}
            {stats && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, minmax(0,1fr))",
                  gap: "12px",
                  marginBottom: "24px",
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

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "16px",
              }}
            >
              {/* Tiempos por transportadora */}
              <div
                style={{
                  background: "var(--blk2)",
                  border: "1px solid var(--blk4)",
                  borderRadius: "10px",
                  padding: "16px 20px",
                }}
              >
                <div
                  style={{
                    fontSize: "12px",
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
                  Días hábiles promedio (guías entregadas)
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
                      gap: "10px",
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
                          <span
                            style={{
                              color: "var(--wht2)",
                              maxWidth: "200px",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {t.nombre}
                          </span>
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
                            {t.promedio} días
                          </span>
                        </div>
                        <div
                          style={{
                            height: "6px",
                            background: "var(--blk3)",
                            borderRadius: "3px",
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
                              borderRadius: "3px",
                              transition: "width 0.5s ease",
                            }}
                          />
                        </div>
                        <div
                          style={{
                            fontSize: "10px",
                            color: "var(--gray)",
                            marginTop: "2px",
                          }}
                        >
                          {t.total} entregas
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Tiempos por ciudad */}
              <div
                style={{
                  background: "var(--blk2)",
                  border: "1px solid var(--blk4)",
                  borderRadius: "10px",
                  padding: "16px 20px",
                }}
              >
                <div
                  style={{
                    fontSize: "12px",
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
                  Top 15 ciudades con más entregas
                </div>
                {ciudades.length === 0 ? (
                  <div style={{ fontSize: "12px", color: "var(--gray)" }}>
                    Sin datos aún — mínimo 3 entregas por ciudad
                  </div>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
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
                          <span style={{ color: "var(--wht2)" }}>
                            {c.ciudad}
                          </span>
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
          </>
        )}
      </div>
    </div>
  );
}
