import { useEffect, useState, useMemo } from "react";
import { supabase } from "../lib/supabase";
import {
  KPICard,
  PageHeader,
  PillEstado,
  PillTransportadora,
  Btn,
} from "../components/UI";
import {
  format,
  parseISO,
  startOfWeek,
  startOfMonth,
  subMonths,
} from "date-fns";
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

const PERIODOS = [
  { id: "todo", label: "Todo" },
  { id: "hoy", label: "Hoy" },
  { id: "semana", label: "Esta semana" },
  { id: "mes", label: "Este mes" },
  { id: "ant", label: "Mes anterior" },
  { id: "custom", label: "Rango" },
];

function getRango(periodo, customDesde, customHasta) {
  const hoy = new Date();
  hoy.setHours(23, 59, 59, 999);
  const hoyStr = hoy.toISOString().split("T")[0];
  if (periodo === "hoy") {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return { desde: d.toISOString().split("T")[0], hasta: hoyStr };
  }
  if (periodo === "semana") {
    const d = startOfWeek(new Date(), { weekStartsOn: 1 });
    return { desde: d.toISOString().split("T")[0], hasta: hoyStr };
  }
  if (periodo === "mes") {
    const d = startOfMonth(new Date());
    return { desde: d.toISOString().split("T")[0], hasta: hoyStr };
  }
  if (periodo === "ant") {
    const d = startOfMonth(subMonths(new Date(), 1));
    const h = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return {
      desde: d.toISOString().split("T")[0],
      hasta: h.toISOString().split("T")[0],
    };
  }
  if (periodo === "custom") return { desde: customDesde, hasta: customHasta };
  return null;
}

function Barra({ pct, color = "var(--m)", height = 5 }) {
  return (
    <div
      style={{
        flex: 1,
        height,
        background: "var(--blk3)",
        borderRadius: 3,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${pct}%`,
          background: color,
          borderRadius: 3,
          transition: "width .4s",
        }}
      />
    </div>
  );
}

function PeriodoChips({ value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
      {PERIODOS.map((p) => (
        <button
          key={p.id}
          onClick={() => onChange(p.id)}
          style={{
            padding: "4px 11px",
            borderRadius: 20,
            fontSize: 11,
            cursor: "pointer",
            border:
              value === p.id ? "1px solid var(--m)" : "1px solid var(--blk5)",
            background: value === p.id ? "rgba(170,255,0,.12)" : "transparent",
            color: value === p.id ? "var(--m)" : "var(--gray)",
            fontWeight: value === p.id ? 600 : 400,
            transition: "all .15s",
          }}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

function DonutChart({ data, size = 160, stroke = 32, label, sublabel }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  const slices = data.map((d) => {
    const dash = (d.pct / 100) * circ;
    const slice = { ...d, dash, offset };
    offset += dash;
    return slice;
  });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
      <div style={{ position: "relative", flexShrink: 0 }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--blk4)"
            strokeWidth={stroke}
          />
          {slices.map((s, i) => (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={stroke}
              strokeDasharray={`${s.dash} ${circ - s.dash}`}
              strokeDashoffset={-s.offset}
              style={{ transition: "stroke-dasharray .5s ease" }}
            />
          ))}
        </svg>
        {label && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
            }}
          >
            <span
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: "var(--wht)",
                fontFamily: "var(--font-mono)",
                lineHeight: 1,
              }}
            >
              {label}
            </span>
            {sublabel && (
              <span style={{ fontSize: 9, color: "var(--gray)", marginTop: 3 }}>
                {sublabel}
              </span>
            )}
          </div>
        )}
      </div>
      <div
        style={{ display: "flex", flexDirection: "column", gap: 7, flex: 1 }}
      >
        {data.map((d) => (
          <div
            key={d.nombre}
            style={{ display: "flex", alignItems: "center", gap: 8 }}
          >
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: d.color,
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 11, color: "var(--wht2)", flex: 1 }}>
              {d.nombre}
            </span>
            <span
              style={{
                fontSize: 11,
                color: d.color,
                fontFamily: "var(--font-mono)",
                fontWeight: 700,
              }}
            >
              {d.count}
            </span>
            <span
              style={{
                fontSize: 10,
                color: "var(--gray)",
                width: 30,
                textAlign: "right",
              }}
            >
              {d.pct}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LineChartGuias({ data }) {
  if (!data || data.length === 0)
    return (
      <div style={{ color: "var(--gray)", fontSize: 12, padding: "20px 0" }}>
        Sin datos para el período
      </div>
    );

  const W = 600,
    H = 180,
    PL = 36,
    PR = 12,
    PT = 12,
    PB = 32;
  const cW = W - PL - PR,
    cH = H - PT - PB;
  const maxVal = Math.max(
    ...data.map((d) => Math.max(d.nuevas, d.entregadas)),
    1,
  );
  const xStep = data.length > 1 ? cW / (data.length - 1) : cW;
  const toX = (i) => PL + (data.length > 1 ? i * xStep : cW / 2);
  const toY = (v) => PT + cH - (v / maxVal) * cH;
  const pathNuevas = data
    .map((d, i) => `${i === 0 ? "M" : "L"}${toX(i)},${toY(d.nuevas)}`)
    .join(" ");
  const pathEntregadas = data
    .map((d, i) => `${i === 0 ? "M" : "L"}${toX(i)},${toY(d.entregadas)}`)
    .join(" ");
  const areaBase = `L${toX(data.length - 1)},${PT + cH} L${PL},${PT + cH} Z`;
  const step = Math.max(1, Math.ceil(data.length / 8));
  const tickIndices = data
    .map((_, i) => i)
    .filter((i) => i % step === 0 || i === data.length - 1);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: "100%", height: "auto", overflow: "visible" }}
    >
      <defs>
        <linearGradient id="gradNuevas" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#55AAFF" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#55AAFF" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="gradEnt" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#AAFF00" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#AAFF00" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 0.25, 0.5, 0.75, 1].map((t) => {
        const y = PT + cH - t * cH;
        return (
          <g key={t}>
            <line
              x1={PL}
              y1={y}
              x2={PL + cW}
              y2={y}
              stroke="var(--blk4)"
              strokeWidth="1"
            />
            <text
              x={PL - 4}
              y={y + 4}
              fill="var(--gray)"
              fontSize="9"
              textAnchor="end"
            >
              {Math.round(t * maxVal)}
            </text>
          </g>
        );
      })}
      <path d={pathNuevas + " " + areaBase} fill="url(#gradNuevas)" />
      <path d={pathEntregadas + " " + areaBase} fill="url(#gradEnt)" />
      <path
        d={pathNuevas}
        fill="none"
        stroke="#55AAFF"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d={pathEntregadas}
        fill="none"
        stroke="#AAFF00"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {data.map((d, i) => (
        <g key={i}>
          <circle cx={toX(i)} cy={toY(d.nuevas)} r="3" fill="#55AAFF" />
          <circle cx={toX(i)} cy={toY(d.entregadas)} r="3" fill="#AAFF00" />
        </g>
      ))}
      {tickIndices.map((i) => (
        <text
          key={i}
          x={toX(i)}
          y={H - 6}
          fill="var(--gray)"
          fontSize="9"
          textAnchor="middle"
        >
          {data[i].dia.substring(5)}
        </text>
      ))}
    </svg>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [periodo, setPeriodo] = useState("todo");
  const [customDesde, setCustomDesde] = useState("");
  const [customHasta, setCustomHasta] = useState("");
  const [todasGuias, setTodasGuias] = useState([]);
  const [porAsesor, setPorAsesor] = useState([]);
  const [ultimasGuias, setUltimasGuias] = useState([]);
  const [syncs, setSyncs] = useState({
    bot: null,
    excel_estelar: null,
    excel_tcc: null,
  });
  const [guiasCriticas, setGuiasCriticas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [buscar, setBuscar] = useState("");
  const [pagina, setPagina] = useState(0);
  const POR_PAG = 10;

  useEffect(() => {
    cargarDatos();
  }, []);

  async function cargarDatos() {
    setLoading(true);
    const hace6Dias = new Date(Date.now() - 6 * 86400000)
      .toISOString()
      .split("T")[0];

    const [asesorRes, syncRes, criticasRes, todasRes, recientesRes] =
      await Promise.all([
        supabase.rpc("guias_por_asesor"),
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
        // TODAS las guías sin límite de fecha
        supabase
          .from("guias")
          .select(
            "numero_guia, transportadora, transportadora_nombre, estado, fecha_guia, ciudad_destino, activa, dias_habiles, clientes(nombre, usuarios(nombre))",
          )
          .not("fecha_guia", "is", null)
          .limit(10000),
        supabase
          .from("guias")
          .select(
            "numero_guia, transportadora, transportadora_nombre, estado, fecha_guia, ciudad_destino, clientes(nombre, usuarios(nombre))",
          )
          .order("created_at", { ascending: false })
          .limit(200),
      ]);

    setPorAsesor(asesorRes.data || []);
    setGuiasCriticas(criticasRes.data || []);
    setTodasGuias(todasRes.data || []);
    setUltimasGuias(recientesRes.data || []);

    const logs = syncRes.data || [];
    setSyncs({
      bot: logs.find((l) => l.detalle?.tipo === "bot_rastreo"),
      excel_estelar: logs.find(
        (l) =>
          l.transportadora === "estelar" && l.detalle?.tipo !== "bot_rastreo",
      ),
      excel_tcc: logs.find((l) => l.transportadora === "tcc"),
    });
    setLoading(false);
  }

  const rango = getRango(periodo, customDesde, customHasta);

  const guiasFiltradas = useMemo(() => {
    if (!rango) return todasGuias;
    return todasGuias.filter((g) => {
      if (!g.fecha_guia) return false;
      return g.fecha_guia >= rango.desde && g.fecha_guia <= rango.hasta;
    });
  }, [todasGuias, rango]);

  const kpis = useMemo(() => {
    const activas = guiasFiltradas.filter(
      (g) => g.estado !== "entregado" && g.estado !== "anulada",
    ).length;
    const entregadas = guiasFiltradas.filter(
      (g) => g.estado === "entregado",
    ).length;
    const novedades = guiasFiltradas.filter(
      (g) => g.estado === "novedad",
    ).length;
    const total = guiasFiltradas.length;
    const tasaEnt = total > 0 ? Math.round((entregadas / total) * 100) : 0;
    const conDias = guiasFiltradas.filter(
      (g) => g.estado === "entregado" && g.dias_habiles != null,
    );
    const promDias =
      conDias.length > 0
        ? (
            conDias.reduce((s, g) => s + (g.dias_habiles || 0), 0) /
            conDias.length
          ).toFixed(1)
        : "—";
    const criticas =
      periodo === "todo"
        ? guiasCriticas.length
        : guiasFiltradas.filter((g) => {
            if (
              !g.fecha_guia ||
              g.estado === "entregado" ||
              g.estado === "anulada"
            )
              return false;
            return (
              Math.floor((new Date() - new Date(g.fecha_guia)) / 86400000) > 6
            );
          }).length;
    const estelar = guiasFiltradas.filter(
      (g) =>
        g.transportadora === "estelar" &&
        g.estado !== "entregado" &&
        g.estado !== "anulada",
    ).length;
    const tcc = guiasFiltradas.filter(
      (g) =>
        g.transportadora === "tcc" &&
        g.estado !== "entregado" &&
        g.estado !== "anulada",
    ).length;
    return {
      activas,
      entregadas,
      novedades,
      total,
      tasaEnt,
      promDias,
      criticas,
      estelar,
      tcc,
    };
  }, [guiasFiltradas, guiasCriticas, periodo]);

  const porEstado = useMemo(() => {
    const m = {};
    guiasFiltradas.forEach((g) => {
      if (!m[g.estado]) m[g.estado] = 0;
      m[g.estado]++;
    });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [guiasFiltradas]);

  const tiemposTrans = useMemo(() => {
    const porTrans = {};
    guiasFiltradas
      .filter((g) => g.estado === "entregado" && g.dias_habiles != null)
      .forEach((g) => {
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
      });
    return Object.entries(porTrans)
      .map(([nombre, d]) => ({
        nombre,
        total: d.total,
        promedio: +(d.sumDias / d.total).toFixed(1),
      }))
      .sort((a, b) => a.promedio - b.promedio);
  }, [guiasFiltradas]);

  const enviosMes = useMemo(() => {
    const meses = {};
    guiasFiltradas.forEach((g) => {
      if (!g.fecha_guia) return;
      const mes = g.fecha_guia.substring(0, 7);
      const trans =
        g.transportadora_nombre ||
        (g.transportadora === "estelar"
          ? "Estelar Express"
          : g.transportadora === "tcc"
            ? "TCC"
            : "Otra");
      if (!meses[mes]) meses[mes] = {};
      meses[mes][trans] = (meses[mes][trans] || 0) + 1;
    });
    const mesesOrdenados = Object.keys(meses).sort();
    const transportadoras = [
      ...new Set(
        guiasFiltradas.map(
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
    return { meses: mesesOrdenados, transportadoras, datos: meses };
  }, [guiasFiltradas]);

  const nuevasVsEntregadasPorDia = useMemo(() => {
    const dias = {};
    guiasFiltradas.forEach((g) => {
      if (!g.fecha_guia) return;
      const dia = g.fecha_guia.substring(0, 10);
      if (!dias[dia]) dias[dia] = { nuevas: 0, entregadas: 0 };
      dias[dia].nuevas++;
      if (g.estado === "entregado") dias[dia].entregadas++;
    });
    return Object.entries(dias)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([dia, v]) => ({ dia, ...v }));
  }, [guiasFiltradas]);

  const donutTransportadoras = useMemo(() => {
    const m = {};
    guiasFiltradas.forEach((g) => {
      const key =
        g.transportadora_nombre ||
        (g.transportadora === "estelar"
          ? "Estelar Express"
          : g.transportadora === "tcc"
            ? "TCC"
            : g.transportadora || "Otra");
      m[key] = (m[key] || 0) + 1;
    });
    const total = Object.values(m).reduce((s, v) => s + v, 0) || 1;
    const TRANS_COLORS = [
      "#AAFF00",
      "#AA88FF",
      "#55AAFF",
      "#FFAA00",
      "#FF6655",
      "#44DDBB",
    ];
    return Object.entries(m)
      .sort((a, b) => b[1] - a[1])
      .map(([nombre, count], i) => ({
        nombre,
        count,
        pct: Math.round((count / total) * 100),
        color: TRANS_COLORS[i % TRANS_COLORS.length],
      }));
  }, [guiasFiltradas]);

  const donutEntregadas = useMemo(() => {
    const entregadas = guiasFiltradas.filter(
      (g) => g.estado === "entregado",
    ).length;
    const noEntregadas = guiasFiltradas.filter(
      (g) => g.estado !== "entregado" && g.estado !== "anulada",
    ).length;
    const anuladas = guiasFiltradas.filter(
      (g) => g.estado === "anulada",
    ).length;
    const total = entregadas + noEntregadas + anuladas || 1;
    return [
      {
        nombre: "Entregadas",
        count: entregadas,
        pct: Math.round((entregadas / total) * 100),
        color: "#AAFF00",
      },
      {
        nombre: "En curso",
        count: noEntregadas,
        pct: Math.round((noEntregadas / total) * 100),
        color: "#55AAFF",
      },
      {
        nombre: "Anuladas",
        count: anuladas,
        pct: Math.round((anuladas / total) * 100),
        color: "#555",
      },
    ].filter((d) => d.count > 0);
  }, [guiasFiltradas]);

  const tablaFiltrada = useMemo(() => {
    const q = buscar.toLowerCase();
    return ultimasGuias.filter(
      (g) =>
        !q ||
        g.numero_guia?.toLowerCase().includes(q) ||
        g.clientes?.nombre?.toLowerCase().includes(q) ||
        g.ciudad_destino?.toLowerCase().includes(q) ||
        g.clientes?.usuarios?.nombre?.toLowerCase().includes(q) ||
        g.estado?.toLowerCase().includes(q),
    );
  }, [ultimasGuias, buscar]);

  const totalPags = Math.ceil(tablaFiltrada.length / POR_PAG);
  const tablaVisible = tablaFiltrada.slice(
    pagina * POR_PAG,
    (pagina + 1) * POR_PAG,
  );
  const maxAsesor = porAsesor[0]?.total || 1;
  const maxTiempo = Math.max(...tiemposTrans.map((t) => t.promedio), 1);
  const maxEstado = porEstado[0]?.[1] || 1;

  if (loading)
    return (
      <div
        style={{
          color: "var(--m)",
          fontFamily: "var(--font-mono)",
          fontSize: 12,
        }}
      >
        Cargando dashboard...
      </div>
    );

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Resumen de guías y envíos">
        <PeriodoChips
          value={periodo}
          onChange={(p) => {
            setPeriodo(p);
            setPagina(0);
          }}
        />
      </PageHeader>

      {periodo === "custom" && (
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            marginBottom: 16,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 11, color: "var(--gray)" }}>Desde</span>
          <input
            type="date"
            value={customDesde}
            onChange={(e) => setCustomDesde(e.target.value)}
            style={{
              background: "var(--blk2)",
              border: "1px solid var(--blk5)",
              borderRadius: 6,
              padding: "5px 10px",
              color: "var(--wht)",
              fontSize: 12,
            }}
          />
          <span style={{ fontSize: 11, color: "var(--gray)" }}>Hasta</span>
          <input
            type="date"
            value={customHasta}
            onChange={(e) => setCustomHasta(e.target.value)}
            style={{
              background: "var(--blk2)",
              border: "1px solid var(--blk5)",
              borderRadius: 6,
              padding: "5px 10px",
              color: "var(--wht)",
              fontSize: 12,
            }}
          />
        </div>
      )}

      {/* Banner críticas */}
      {guiasCriticas.length > 0 && (
        <div
          style={{
            background: "#1a0800",
            border: "1px solid var(--danger)",
            borderRadius: 10,
            padding: "14px 16px",
            marginBottom: 16,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16 }}>🚨</span>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 500,
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
                fontSize: 11,
                padding: "5px 12px",
                background: "var(--danger)",
                color: "#fff",
                border: "none",
                borderRadius: 5,
                cursor: "pointer",
                fontWeight: 500,
              }}
            >
              Ver todas →
            </button>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 5,
              maxHeight: 200,
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
                    gap: 10,
                    padding: "7px 10px",
                    background: "rgba(255,68,68,0.07)",
                    borderRadius: 6,
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
                      fontSize: 11,
                      color: "var(--danger)",
                      fontWeight: 700,
                      minWidth: 100,
                    }}
                  >
                    {g.numero_guia}
                  </span>
                  <PillTransportadora transportadora={g.transportadora} />
                  <span
                    style={{
                      fontSize: 11,
                      color: "var(--wht2)",
                      flex: 1,
                      minWidth: 120,
                    }}
                  >
                    {g.clientes?.nombre || "—"}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--gray)" }}>
                    {g.ciudad_destino || "—"}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--gray)" }}>
                    {g.clientes?.usuarios?.nombre || "—"}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 12,
                      fontWeight: 700,
                      color: "var(--danger)",
                      background: "rgba(255,68,68,0.2)",
                      padding: "2px 8px",
                      borderRadius: 4,
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

      {/* KPIs fila 1 */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0,1fr))",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <KPICard
          label="Guías activas"
          value={kpis.activas}
          sub={rango ? "En el período" : "En este momento"}
          accent="var(--m)"
        />
        <KPICard
          label="Entregadas"
          value={kpis.entregadas}
          sub={rango ? "En el período" : "Historial total"}
          accent="#AAFF00"
        />
        <KPICard
          label="Con novedad"
          value={kpis.novedades}
          sub="Requieren atención"
          accent={kpis.novedades > 0 ? "var(--warn)" : undefined}
        />
        <KPICard
          label="+6 días sin entrega"
          value={kpis.criticas}
          sub="Críticas"
          accent={kpis.criticas > 0 ? "var(--danger)" : undefined}
        />
      </div>

      {/* KPIs fila 2 */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0,1fr))",
          gap: 12,
          marginBottom: 20,
        }}
      >
        <div
          style={{
            background: "var(--blk2)",
            border: "1px solid var(--blk4)",
            borderRadius: 8,
            padding: 14,
          }}
        >
          <div
            style={{
              fontSize: 10,
              color: "var(--gray)",
              textTransform: "uppercase",
              letterSpacing: ".05em",
              marginBottom: 6,
            }}
          >
            Tasa de entrega
          </div>
          <div
            style={{
              fontSize: 26,
              fontWeight: 500,
              fontFamily: "var(--font-mono)",
              color:
                kpis.tasaEnt >= 80
                  ? "var(--m)"
                  : kpis.tasaEnt >= 50
                    ? "var(--warn)"
                    : "var(--danger)",
              lineHeight: 1,
            }}
          >
            {kpis.tasaEnt}%
          </div>
          <div style={{ marginTop: 8 }}>
            <Barra
              pct={kpis.tasaEnt}
              color={
                kpis.tasaEnt >= 80
                  ? "var(--m)"
                  : kpis.tasaEnt >= 50
                    ? "var(--warn)"
                    : "var(--danger)"
              }
              height={4}
            />
          </div>
          <div style={{ fontSize: 10, color: "var(--gray)", marginTop: 4 }}>
            de {kpis.total} guías
          </div>
        </div>

        <div
          style={{
            background: "var(--blk2)",
            border: "1px solid var(--blk4)",
            borderRadius: 8,
            padding: 14,
          }}
        >
          <div
            style={{
              fontSize: 10,
              color: "var(--gray)",
              textTransform: "uppercase",
              letterSpacing: ".05em",
              marginBottom: 6,
            }}
          >
            Tiempo prom. entrega
          </div>
          <div
            style={{
              fontSize: 26,
              fontWeight: 500,
              fontFamily: "var(--font-mono)",
              lineHeight: 1,
              color:
                typeof kpis.promDias === "string"
                  ? "var(--wht)"
                  : +kpis.promDias <= 3
                    ? "var(--m)"
                    : +kpis.promDias <= 6
                      ? "var(--warn)"
                      : "var(--danger)",
            }}
          >
            {kpis.promDias}
            {typeof kpis.promDias === "string" ? "" : "d"}
          </div>
          <div style={{ fontSize: 10, color: "var(--gray)", marginTop: 5 }}>
            días hábiles · guías entregadas
          </div>
        </div>

        <div
          style={{
            background: "var(--blk2)",
            border: "1px solid var(--blk4)",
            borderRadius: 8,
            padding: 14,
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 10, color: "var(--gray)", marginBottom: 4 }}>
            Estelar Express activas
          </div>
          <div
            style={{
              fontSize: 26,
              fontWeight: 500,
              color: "var(--m)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {kpis.estelar}
          </div>
          <div style={{ fontSize: 10, color: "var(--gray)", marginTop: 4 }}>
            guías en curso
          </div>
        </div>

        <div
          style={{
            background: "var(--blk2)",
            border: "1px solid var(--blk4)",
            borderRadius: 8,
            padding: 14,
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 10, color: "var(--gray)", marginBottom: 4 }}>
            TCC activas
          </div>
          <div
            style={{
              fontSize: 26,
              fontWeight: 500,
              color: "#AA88FF",
              fontFamily: "var(--font-mono)",
            }}
          >
            {kpis.tcc}
          </div>
          <div style={{ fontSize: 10, color: "var(--gray)", marginTop: 4 }}>
            guías en curso
          </div>
        </div>
      </div>

      {/* Línea nuevas vs entregadas */}
      <div
        style={{
          background: "var(--blk2)",
          border: "1px solid var(--blk4)",
          borderRadius: 10,
          padding: 20,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 4,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--wht)" }}>
            Guías nuevas vs entregadas por día
          </div>
          <div style={{ display: "flex", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div
                style={{
                  width: 10,
                  height: 3,
                  background: "#55AAFF",
                  borderRadius: 2,
                }}
              />
              <span style={{ fontSize: 10, color: "var(--gray)" }}>Nuevas</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div
                style={{
                  width: 10,
                  height: 3,
                  background: "#AAFF00",
                  borderRadius: 2,
                }}
              />
              <span style={{ fontSize: 10, color: "var(--gray)" }}>
                Entregadas
              </span>
            </div>
          </div>
        </div>
        <div style={{ fontSize: 10, color: "var(--gray)", marginBottom: 16 }}>
          {rango ? `${rango.desde} → ${rango.hasta}` : "Histórico completo"}
        </div>
        <LineChartGuias data={nuevasVsEntregadasPorDia} />
      </div>

      {/* Donuts */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            background: "var(--blk2)",
            border: "1px solid var(--blk4)",
            borderRadius: 10,
            padding: 20,
          }}
        >
          <div
            style={{
              fontSize: 10,
              color: "var(--gray)",
              textTransform: "uppercase",
              letterSpacing: ".05em",
              marginBottom: 16,
            }}
          >
            Distribución por transportadora
          </div>
          <DonutChart
            data={donutTransportadoras}
            label={guiasFiltradas.length}
            sublabel="guías"
          />
        </div>
        <div
          style={{
            background: "var(--blk2)",
            border: "1px solid var(--blk4)",
            borderRadius: 10,
            padding: 20,
          }}
        >
          <div
            style={{
              fontSize: 10,
              color: "var(--gray)",
              textTransform: "uppercase",
              letterSpacing: ".05em",
              marginBottom: 16,
            }}
          >
            Estado de entrega
          </div>
          <DonutChart
            data={donutEntregadas}
            label={kpis.tasaEnt + "%"}
            sublabel="tasa entrega"
          />
        </div>
      </div>

      {/* Asesor + Estado */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            background: "var(--blk2)",
            border: "1px solid var(--blk4)",
            borderRadius: 10,
            padding: 16,
          }}
        >
          <div
            style={{
              fontSize: 10,
              color: "var(--gray)",
              textTransform: "uppercase",
              letterSpacing: ".05em",
              marginBottom: 14,
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
                gap: 10,
                marginBottom: 9,
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  color: "var(--wht2)",
                  width: 140,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                {nombre}
              </span>
              <Barra pct={(total / maxAsesor) * 100} />
              <span
                style={{
                  fontSize: 11,
                  color: "var(--gray)",
                  width: 24,
                  textAlign: "right",
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
            background: "var(--blk2)",
            border: "1px solid var(--blk4)",
            borderRadius: 10,
            padding: 16,
          }}
        >
          <div
            style={{
              fontSize: 10,
              color: "var(--gray)",
              textTransform: "uppercase",
              letterSpacing: ".05em",
              marginBottom: 12,
            }}
          >
            Estado de guías {rango ? "en el período" : "activas"}
          </div>
          {porEstado.map(([estado, total]) => (
            <div
              key={estado}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 8,
              }}
            >
              <div style={{ width: 110, flexShrink: 0 }}>
                <PillEstado estado={estado} />
              </div>
              <Barra pct={(total / maxEstado) * 100} color="var(--blk5)" />
              <span
                style={{
                  fontSize: 11,
                  color: "var(--gray)",
                  fontFamily: "var(--font-mono)",
                  width: 28,
                  textAlign: "right",
                }}
              >
                {total}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Tiempos por transportadora */}
      {tiemposTrans.length > 0 && (
        <div
          style={{
            background: "var(--blk2)",
            border: "1px solid var(--blk4)",
            borderRadius: 10,
            padding: 20,
            marginBottom: 16,
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: "var(--wht)",
              marginBottom: 4,
            }}
          >
            Tiempo promedio de entrega por transportadora
          </div>
          <div style={{ fontSize: 10, color: "var(--gray)", marginBottom: 20 }}>
            Días hábiles promedio · verde ≤3 · naranja ≤6 · rojo {">"} 6
          </div>
          <div
            style={{
              display: "flex",
              gap: 24,
              alignItems: "flex-end",
              height: 160,
              marginBottom: 16,
            }}
          >
            {tiemposTrans.map((t) => {
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
                      fontSize: 14,
                      fontWeight: 700,
                      fontFamily: "var(--font-mono)",
                      color,
                      marginBottom: 4,
                    }}
                  >
                    {t.promedio}d
                  </div>
                  <div
                    style={{
                      width: "100%",
                      height: `${Math.max(20, (t.promedio / maxTiempo) * 100)}%`,
                      background: color,
                      borderRadius: "6px 6px 0 0",
                      opacity: 0.85,
                      minHeight: 20,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 9,
                        color: "rgba(0,0,0,0.7)",
                        fontWeight: 700,
                      }}
                    >
                      {t.total}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 9,
                      color: "var(--gray)",
                      marginTop: 6,
                      textAlign: "center",
                      maxWidth: 80,
                      lineHeight: 1.3,
                    }}
                  >
                    {t.nombre.split(" ").slice(0, 2).join(" ")}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Envíos por mes */}
      {enviosMes.meses?.length > 0 && (
        <div
          style={{
            background: "var(--blk2)",
            border: "1px solid var(--blk4)",
            borderRadius: 10,
            padding: 20,
            marginBottom: 16,
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: "var(--wht)",
              marginBottom: 4,
            }}
          >
            Envíos por mes por transportadora
          </div>
          <div style={{ fontSize: 10, color: "var(--gray)", marginBottom: 16 }}>
            {rango ? `${rango.desde} → ${rango.hasta}` : "Histórico completo"}
          </div>
          <div
            style={{
              display: "flex",
              gap: 16,
              flexWrap: "wrap",
              marginBottom: 16,
            }}
          >
            {enviosMes.transportadoras?.map((t, i) => (
              <div
                key={t}
                style={{ display: "flex", alignItems: "center", gap: 5 }}
              >
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: COLORES[i % COLORES.length],
                  }}
                />
                <span style={{ fontSize: 10, color: "var(--gray)" }}>{t}</span>
              </div>
            ))}
          </div>
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "flex-end",
              overflowX: "auto",
              paddingBottom: 8,
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
                    minWidth: 80,
                    flex: 1,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      gap: 3,
                      alignItems: "flex-end",
                      height: 120,
                      width: "100%",
                    }}
                  >
                    {enviosMes.transportadoras?.map((t, i) => {
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
                                fontSize: 8,
                                color: COLORES[i % COLORES.length],
                                marginBottom: 2,
                                fontFamily: "var(--font-mono)",
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
                                  ? `${Math.max(8, (val / maxMes) * 100)}%`
                                  : "0px",
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
                      height: 1,
                      background: "var(--blk4)",
                      width: "100%",
                    }}
                  />
                  <div
                    style={{
                      fontSize: 9,
                      color: "var(--gray)",
                      marginTop: 5,
                      textAlign: "center",
                    }}
                  >
                    {format(new Date(mes + "-01"), "MMM yy", { locale: es })}
                  </div>
                  <div
                    style={{
                      fontSize: 9,
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
          gap: 10,
          marginBottom: 16,
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
            titulo: "Último Excel Estelar",
            icono: "📥",
            data: syncs.excel_estelar,
            color: "#55AAFF",
            detalle: syncs.excel_estelar
              ? `+${syncs.excel_estelar.guias_nuevas} nuevas · ${syncs.excel_estelar.guias_actualizadas} actualizadas`
              : null,
          },
          {
            titulo: "Último Excel TCC",
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
              borderRadius: 8,
              padding: "12px 14px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                marginBottom: 6,
              }}
            >
              <span style={{ fontSize: 14 }}>{icono}</span>
              <span
                style={{ fontSize: 11, fontWeight: 500, color: "var(--wht2)" }}
              >
                {titulo}
              </span>
            </div>
            {data ? (
              <>
                <div
                  style={{
                    fontSize: 11,
                    color,
                    fontWeight: 500,
                    marginBottom: 2,
                  }}
                >
                  {format(
                    parseISO(data.created_at),
                    "d MMM yyyy 'a las' h:mm a",
                    { locale: es },
                  )}
                </div>
                <div style={{ fontSize: 10, color: "var(--gray)" }}>
                  {detalle}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 11, color: "var(--gray)" }}>
                Sin registros aún
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Tabla recientes */}
      <div
        style={{
          background: "var(--blk2)",
          border: "1px solid var(--blk4)",
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "12px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid var(--blk4)",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              fontSize: 10,
              color: "var(--gray)",
              textTransform: "uppercase",
              letterSpacing: ".05em",
            }}
          >
            Guías recientes · {tablaFiltrada.length} resultado
            {tablaFiltrada.length !== 1 ? "s" : ""}
          </div>
          <input
            placeholder="Buscar guía, cliente, ciudad, asesor..."
            value={buscar}
            onChange={(e) => {
              setBuscar(e.target.value);
              setPagina(0);
            }}
            style={{
              background: "var(--blk3)",
              border: "1px solid var(--blk5)",
              borderRadius: 6,
              padding: "5px 11px",
              color: "var(--wht)",
              fontSize: 12,
              width: 260,
              outline: "none",
              fontFamily: "var(--font-body)",
            }}
          />
        </div>
        <div style={{ overflowX: "auto" }}>
          <table
            style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}
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
                  "Días activos",
                  "Estado",
                ].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "left",
                      padding: "8px 12px",
                      fontSize: 10,
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
              {tablaVisible.map((g) => {
                const dias = g.fecha_guia
                  ? Math.floor((new Date() - new Date(g.fecha_guia)) / 86400000)
                  : null;
                const diasColor =
                  dias == null
                    ? "var(--gray)"
                    : dias > 6
                      ? "var(--danger)"
                      : dias > 3
                        ? "var(--warn)"
                        : "var(--m)";
                return (
                  <tr
                    key={g.numero_guia}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = "var(--blk3)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = "transparent")
                    }
                    onClick={() => navigate("/guias?buscar=" + g.numero_guia)}
                    style={{ cursor: "pointer" }}
                  >
                    <td
                      style={{
                        padding: "8px 12px",
                        borderBottom: "1px solid var(--blk3)",
                        color: "var(--wht)",
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
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
                        maxWidth: 160,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {g.clientes?.nombre || "—"}
                    </td>
                    <td
                      style={{
                        padding: "8px 12px",
                        borderBottom: "1px solid var(--blk3)",
                        color: "var(--gray)",
                        fontSize: 11,
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
                        fontSize: 11,
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
                        textAlign: "center",
                      }}
                    >
                      {dias != null ? (
                        <span
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: 12,
                            fontWeight: 700,
                            color: diasColor,
                            background:
                              dias > 6
                                ? "rgba(255,68,68,0.12)"
                                : dias > 3
                                  ? "rgba(255,170,0,0.12)"
                                  : "rgba(170,255,0,0.1)",
                            padding: "2px 8px",
                            borderRadius: 4,
                          }}
                        >
                          {dias}d
                        </span>
                      ) : (
                        "—"
                      )}
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
        </div>
        {tablaFiltrada.length === 0 && (
          <div
            style={{
              padding: 24,
              textAlign: "center",
              color: "var(--gray)",
              fontSize: 12,
            }}
          >
            {buscar ? `Sin resultados para "${buscar}"` : "Sin guías aún"}
          </div>
        )}
        {totalPags > 1 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 16px",
              borderTop: "1px solid var(--blk4)",
            }}
          >
            <span style={{ fontSize: 11, color: "var(--gray)" }}>
              Página {pagina + 1} de {totalPags} · {tablaFiltrada.length} guías
            </span>
            <div style={{ display: "flex", gap: 6 }}>
              <Btn
                onClick={() => setPagina((p) => Math.max(0, p - 1))}
                disabled={pagina === 0}
              >
                ← Anterior
              </Btn>
              <Btn
                onClick={() => setPagina((p) => Math.min(totalPags - 1, p + 1))}
                disabled={pagina >= totalPags - 1}
              >
                Siguiente →
              </Btn>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
