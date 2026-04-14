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

export default function Dashboard() {
  const [stats, setStats] = useState({
    guias_activas: 0,
    entregadas: 0,
    con_novedad: 0,
    criticas: 0,
    estelar_activas: 0,
    tcc_activas: 0,
  });
  const [porAsesor, setPorAsesor] = useState([]);
  const [porEstado, setPorEstado] = useState([]);
  const [ultimasGuias, setUltimasGuias] = useState([]);
  const [ultimaSync, setUltimaSync] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    cargarDatos();
  }, []);

  async function cargarDatos() {
    setLoading(true);
    const [statsRes, asesorRes, estadoRes, recientesRes, syncRes] =
      await Promise.all([
        supabase.from("dashboard_stats").select("*").single(),
        supabase.rpc("guias_por_asesor"),
        supabase.rpc("guias_por_estado"),
        supabase
          .from("guias")
          .select(
            "numero_guia, transportadora, estado, fecha_guia, ciudad_destino, clientes(nombre, usuarios(nombre))",
          )
          .order("created_at", { ascending: false })
          .limit(8),
        supabase
          .from("sync_log")
          .select("created_at, guias_nuevas, guias_actualizadas")
          .order("created_at", { ascending: false })
          .limit(1),
      ]);
    if (statsRes.data) setStats(statsRes.data);
    setPorAsesor(asesorRes.data || []);
    setPorEstado(estadoRes.data || []);
    setUltimasGuias(recientesRes.data || []);
    setUltimaSync(syncRes.data?.[0] || null);
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

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Resumen de guías y envíos activos"
      />

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
          label="+10 días sin entrega"
          value={stats.criticas}
          sub="Críticas"
          accent={stats.criticas > 0 ? "var(--danger)" : undefined}
        />
      </div>

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
          {porAsesor.length === 0 && (
            <p style={{ fontSize: "12px", color: "var(--gray)" }}>Sin datos</p>
          )}
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

      {ultimaSync && (
        <div
          style={{
            background: "var(--blk2)",
            border: "1px solid var(--blk4)",
            borderRadius: "8px",
            padding: "10px 14px",
            marginBottom: "16px",
            display: "flex",
            gap: "16px",
            flexWrap: "wrap",
            fontSize: "11px",
            color: "var(--gray)",
          }}
        >
          <span>
            Última carga:{" "}
            {format(
              parseISO(ultimaSync.created_at),
              "d MMM yyyy 'a las' h:mm a",
              { locale: es },
            )}
          </span>
          <span style={{ color: "var(--m)" }}>
            +{ultimaSync.guias_nuevas} nuevas
          </span>
          <span>{ultimaSync.guias_actualizadas} actualizadas</span>
        </div>
      )}

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
                  <PillTransportadora transportadora={g.transportadora} />
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
