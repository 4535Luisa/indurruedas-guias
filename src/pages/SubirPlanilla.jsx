import { useEffect, useState, useRef } from "react";
import { supabase } from "../lib/supabase";
import { PageHeader, Btn } from "../components/UI";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

const PALABRAS_AMBIGUAS = [
  "distribuidora",
  "ferreteria",
  "comercializadora",
  "inversiones",
  "agroveterinaria",
  "suministros",
  "industria",
  "importadora",
  "representaciones",
  "construcciones",
  "servicios",
  "grupo",
  "ferroplas",
  "plasticos",
  "agricolas",
  "herramientas",
];

function esNombreAmbiguo(nombre) {
  if (!nombre) return false;
  const lower = nombre.toLowerCase().trim();
  const palabras = lower.split(" ").filter((p) => p.length > 2);
  if (palabras.length <= 2) {
    return PALABRAS_AMBIGUAS.some((p) => lower.startsWith(p));
  }
  return false;
}

function parsearFecha(str) {
  if (!str) return null;
  const match = str.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (match) {
    return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  }
  return null;
}

async function extraerTextoPDF(file) {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  let textoCompleto = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const filas = {};
    for (const item of content.items) {
      const y = Math.round(item.transform[5]);
      const x = Math.round(item.transform[4]);
      if (!filas[y]) filas[y] = [];
      filas[y].push({ x, str: item.str.trim() });
    }
    const ysOrdenados = Object.keys(filas)
      .map(Number)
      .sort((a, b) => b - a);
    for (const y of ysOrdenados) {
      const palabras = filas[y].sort((a, b) => a.x - b.x);
      const linea = palabras.map((p) => `${p.x}:${p.str}`).join("|");
      if (linea.trim()) textoCompleto += linea + "\n";
    }
  }
  return textoCompleto;
}

function parsearPlanilla(texto) {
  const lineas = texto
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const resultado = {
    transportadora: null,
    nit_transportadora: null,
    numero_planilla: null,
    fecha_planilla: null,
    guias: [],
  };

  for (const linea of lineas) {
    const textoPlano = linea
      .split("|")
      .map((p) => p.split(":").slice(1).join(":"))
      .join(" ");

    if (!resultado.numero_planilla) {
      const m = textoPlano.match(/RTF-(\d+)/i);
      if (m) resultado.numero_planilla = `RTF-${m[1]}`;
    }
    if (!resultado.fecha_planilla) {
      const m = textoPlano.match(/Fecha[:\s]+(\d{2}[-/]\d{2}[-/]\d{4})/i);
      if (m) resultado.fecha_planilla = parsearFecha(m[1]);
    }
    if (!resultado.nit_transportadora) {
      const m = textoPlano.match(/Nit[:\s]+(\d[\d\-]+)/i);
      if (m) resultado.nit_transportadora = m[1].replace(/-\d+$/, "");
    }
    if (!resultado.transportadora) {
      const m = textoPlano.match(
        /Transportador[:\s]+([A-Z][A-Z\s\.]+?)(?:\s+Nit|\s*$)/i,
      );
      if (m) resultado.transportadora = m[1].trim();
    }

    const partes = linea
      .split("|")
      .map((p) => {
        const idx = p.indexOf(":");
        return { x: parseInt(p.substring(0, idx)), str: p.substring(idx + 1) };
      })
      .filter((p) => !isNaN(p.x) && p.str);

    const primeraCol = partes[0];
    if (!primeraCol) continue;
    const facturaMatch = primeraCol.str.match(/^(FBG|FBC|REM|ACC)-0*(\d+)$/i);
    if (!facturaMatch) continue;

    const factura = `${facturaMatch[1].toUpperCase()}-${facturaMatch[2]}`;
    const clienteParts = partes
      .filter((p) => p.x >= 90 && p.x < 230)
      .map((p) => p.str);
    const ciudadParts = partes
      .filter((p) => p.x >= 230 && p.x < 330)
      .map((p) => p.str);
    const dirParts = partes
      .filter((p) => p.x >= 330 && p.x < 460)
      .filter(
        (p) =>
          !p.str.match(/^\d+[\.,]\d+$/) &&
          !p.str.startsWith("$") &&
          p.str !== "NO" &&
          p.str !== "SI",
      )
      .map((p) => p.str);

    const cliente = clienteParts.join(" ").trim();
    const ciudad = ciudadParts.join(" ").trim();
    const direccion = dirParts.join(" ").trim();

    if (factura && cliente) {
      resultado.guias.push({ factura, cliente, ciudad, direccion });
    }
  }
  return resultado;
}

// Selector inline de cliente — se abre al hacer clic en el nombre
function SelectorClienteInline({ nombre, clienteId, onSeleccionar }) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState(nombre || "");
  const [opciones, setOpciones] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null);
  const ref = useRef();

  // Buscar cuando cambia la búsqueda
  useEffect(() => {
    if (abierto && busqueda.trim().length > 2) {
      const t = setTimeout(buscarClientes, 300);
      return () => clearTimeout(t);
    }
  }, [busqueda, abierto]);

  // Cerrar al hacer clic fuera
  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setAbierto(false);
    }
    if (abierto) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [abierto]);

  async function buscarClientes() {
    setBuscando(true);
    const { data } = await supabase
      .from("clientes")
      .select("id, nombre, nit, usuarios(nombre)")
      .ilike("nombre", `%${busqueda.trim()}%`)
      .limit(8);
    setOpciones(data || []);
    setBuscando(false);
  }

  function seleccionar(c) {
    setClienteSeleccionado(c);
    setBusqueda(c.nombre);
    setAbierto(false);
    onSeleccionar(c);
  }

  const ambiguo = esNombreAmbiguo(nombre) && !clienteSeleccionado;
  const color = clienteSeleccionado
    ? "var(--m)"
    : ambiguo
      ? "var(--warn)"
      : "var(--wht2)";

  return (
    <div ref={ref} style={{ position: "relative", width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
        <input
          value={busqueda}
          onChange={(e) => {
            setBusqueda(e.target.value);
            setClienteSeleccionado(null);
          }}
          onFocus={() => setAbierto(true)}
          style={{
            background: "transparent",
            border: "none",
            color,
            fontSize: "12px",
            width: "190px",
            outline: "none",
            cursor: "pointer",
          }}
          readOnly={!!clienteSeleccionado}
          title={
            ambiguo
              ? "Nombre ambiguo — haz clic para seleccionar el cliente correcto"
              : ""
          }
        />
        {ambiguo && (
          <span
            title="Haz clic para seleccionar cliente"
            style={{ cursor: "pointer", fontSize: "11px" }}
            onClick={() => setAbierto(true)}
          >
            ⚠️
          </span>
        )}
        {clienteSeleccionado && (
          <span
            title="Cliente asignado"
            style={{ fontSize: "11px", color: "var(--m)" }}
          >
            ✓
          </span>
        )}
      </div>

      {abierto && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            zIndex: 500,
            background: "var(--blk2)",
            border: "1px solid var(--m)",
            borderRadius: "8px",
            minWidth: "340px",
            maxHeight: "240px",
            overflowY: "auto",
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          }}
        >
          <div
            style={{
              padding: "8px 10px",
              borderBottom: "1px solid var(--blk4)",
              background: "var(--blk3)",
              borderRadius: "8px 8px 0 0",
            }}
          >
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar cliente..."
              autoFocus
              style={{ width: "100%", fontSize: "12px", padding: "5px 8px" }}
            />
          </div>
          {buscando && (
            <div
              style={{
                padding: "12px",
                fontSize: "11px",
                color: "var(--gray)",
                textAlign: "center",
              }}
            >
              Buscando...
            </div>
          )}
          {!buscando &&
            opciones.map((c) => (
              <div
                key={c.id}
                onClick={() => seleccionar(c)}
                style={{
                  padding: "9px 12px",
                  cursor: "pointer",
                  borderBottom: "1px solid var(--blk3)",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "var(--blk3)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "transparent")
                }
              >
                <div
                  style={{
                    fontSize: "12px",
                    color: "var(--wht)",
                    fontWeight: "500",
                  }}
                >
                  {c.nombre}
                </div>
                <div
                  style={{
                    fontSize: "10px",
                    color: "var(--gray)",
                    marginTop: "1px",
                  }}
                >
                  NIT: {c.nit || "—"} · Asesor:{" "}
                  {c.usuarios?.nombre || "Sin asesor"}
                </div>
              </div>
            ))}
          {!buscando && opciones.length === 0 && busqueda.length > 2 && (
            <div
              style={{
                padding: "12px",
                fontSize: "11px",
                color: "var(--gray)",
                textAlign: "center",
              }}
            >
              Sin resultados para "{busqueda}"
            </div>
          )}
          <div
            onClick={() => setAbierto(false)}
            style={{
              padding: "7px 12px",
              fontSize: "11px",
              color: "var(--gray)",
              cursor: "pointer",
              borderTop: "1px solid var(--blk4)",
              textAlign: "center",
              background: "var(--blk3)",
              borderRadius: "0 0 8px 8px",
            }}
          >
            Cerrar
          </div>
        </div>
      )}
    </div>
  );
}

export default function SubirPlanilla() {
  const [transportadoras, setTransportadoras] = useState([]);
  const [archivo, setArchivo] = useState(null);
  const [procesando, setProcesando] = useState(false);
  const [planilla, setPlanilla] = useState(null);
  const [transportadoraId, setTransportadoraId] = useState("");
  const [editando, setEditando] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [conflictos, setConflictos] = useState([]);
  const fileRef = useRef();

  useEffect(() => {
    cargarTransportadoras();
  }, []);

  async function cargarTransportadoras() {
    const { data } = await supabase
      .from("transportadoras")
      .select("*")
      .eq("activa", true)
      .order("nombre");
    setTransportadoras(data || []);
  }

  async function procesarPDF(e) {
    const file = e.target.files[0];
    if (!file) return;
    setArchivo(file);
    setProcesando(true);
    setPlanilla(null);
    setResultado(null);
    setConflictos([]);

    try {
      const texto = await extraerTextoPDF(file);
      const datos = parsearPlanilla(texto);
      setPlanilla(datos);
      setEditando(
        datos.guias.map((g) => ({ ...g, incluir: true, clienteId: null })),
      );

      if (datos.nit_transportadora) {
        const trans = transportadoras.find((t) =>
          t.nit?.includes(datos.nit_transportadora),
        );
        if (trans) setTransportadoraId(trans.id);
      }
    } catch (err) {
      setResultado({ error: "Error leyendo PDF: " + err.message });
    }
    setProcesando(false);
  }

  async function verificarYGuardar() {
    if (!transportadoraId) {
      alert("Selecciona la transportadora");
      return;
    }

    const trans = transportadoras.find((t) => t.id === transportadoraId);
    const guiasAGuardar = editando.filter((g) => g.incluir && g.factura);
    const planillaCorta = (planilla.numero_planilla || "RTF-0").replace(
      /RTF-0+(\d+)/i,
      "RTF-$1",
    );
    const numerosGuia = guiasAGuardar.map(
      (_, i) => `${planillaCorta}-${i + 1}`,
    );

    const { data: existentes } = await supabase
      .from("guias")
      .select(
        "id, numero_guia, transportadora_nombre, transportadora_id, fecha_guia, estado",
      )
      .in("numero_guia", numerosGuia);

    const existentesMap = {};
    (existentes || []).forEach((g) => {
      existentesMap[g.numero_guia] = g;
    });

    // Detectar conflictos de transportadora (solo no anuladas)
    const nuevosConflictos = [];
    guiasAGuardar.forEach((g, i) => {
      const numGuia = `${planillaCorta}-${i + 1}`;
      const existente = existentesMap[numGuia];
      if (
        existente &&
        existente.estado !== "anulada" &&
        existente.transportadora_id !== transportadoraId
      ) {
        nuevosConflictos.push({
          numero_guia: numGuia,
          factura: g.factura,
          trans_anterior: existente.transportadora_nombre,
          trans_nueva: trans.nombre,
          id: existente.id,
          corregir: true,
        });
      }
    });

    if (nuevosConflictos.length > 0) {
      setConflictos(nuevosConflictos);
      return;
    }

    await guardarGuias(existentesMap, planillaCorta, trans, guiasAGuardar);
  }

  async function guardarGuias(
    existentesMap,
    planillaCorta,
    trans,
    guiasAGuardar,
  ) {
    setGuardando(true);
    setConflictos([]);

    let nuevas = 0,
      actualizadas = 0,
      duplicadas = 0,
      errores = 0;

    for (let i = 0; i < guiasAGuardar.length; i++) {
      const g = guiasAGuardar[i];
      const numeroGuia = `${planillaCorta}-${i + 1}`;
      const existente = existentesMap?.[numeroGuia];

      // Si existe y NO está anulada
      if (existente && existente.estado !== "anulada") {
        const conflicto = conflictos.find((c) => c.numero_guia === numeroGuia);
        if (conflicto?.corregir) {
          await supabase
            .from("guias")
            .update({
              transportadora_nombre: trans.nombre,
              transportadora_id: transportadoraId,
              fecha_guia: planilla.fecha_planilla,
              fecha_planilla: planilla.fecha_planilla,
            })
            .eq("id", existente.id);
          actualizadas++;
        } else {
          duplicadas++;
        }
        continue;
      }

      // Resolver cliente — prioridad: seleccionado manualmente > buscar por nombre
      let clienteId = g.clienteId || null;

      if (!clienteId && g.cliente?.trim().length > 2) {
        const nombreLimpio = g.cliente.trim();
        const { data: exacto } = await supabase
          .from("clientes")
          .select("id")
          .ilike("nombre", nombreLimpio)
          .limit(1);
        if (exacto?.[0]) {
          clienteId = exacto[0].id;
        } else {
          const { data: parciales } = await supabase
            .from("clientes")
            .select("id")
            .ilike("nombre", `%${nombreLimpio}%`)
            .limit(5);
          // Solo asignar si hay coincidencia única y el nombre no es ambiguo
          if (parciales?.length === 1 && !esNombreAmbiguo(nombreLimpio)) {
            clienteId = parciales[0].id;
          }
        }
      }

      const { error } = await supabase.from("guias").insert({
        numero_guia: numeroGuia,
        transportadora: "otra",
        transportadora_nombre: trans.nombre,
        transportadora_id: transportadoraId,
        factura_indurruedas: g.factura,
        estado: "en_transito",
        cliente_id: clienteId,
        destinatario: g.cliente,
        ciudad_destino: g.ciudad,
        direccion_entrega: g.direccion,
        fecha_guia: planilla.fecha_planilla,
        fecha_planilla: planilla.fecha_planilla,
        numero_planilla: planilla.numero_planilla,
        activa: true,
      });

      if (!error) nuevas++;
      else errores++;
    }

    await supabase.from("sync_log").insert({
      transportadora: "otra",
      guias_nuevas: nuevas,
      guias_actualizadas: actualizadas,
      errores,
      detalle: {
        planilla: planilla.numero_planilla,
        transportadora: trans.nombre,
      },
    });

    setResultado({ nuevas, actualizadas, duplicadas, errores });
    setGuardando(false);
  }

  async function confirmarConflictos() {
    const trans = transportadoras.find((t) => t.id === transportadoraId);
    const guiasAGuardar = editando.filter((g) => g.incluir && g.factura);
    const planillaCorta = (planilla.numero_planilla || "RTF-0").replace(
      /RTF-0+(\d+)/i,
      "RTF-$1",
    );
    const numerosGuia = guiasAGuardar.map(
      (_, i) => `${planillaCorta}-${i + 1}`,
    );
    const { data: existentes } = await supabase
      .from("guias")
      .select(
        "id, numero_guia, transportadora_nombre, transportadora_id, estado",
      )
      .in("numero_guia", numerosGuia);
    const existentesMap = {};
    (existentes || []).forEach((g) => {
      existentesMap[g.numero_guia] = g;
    });
    await guardarGuias(existentesMap, planillaCorta, trans, guiasAGuardar);
  }

  const ambiguosPendientes = editando.filter(
    (g) => g.incluir && esNombreAmbiguo(g.cliente) && !g.clienteId,
  ).length;

  return (
    <div>
      <PageHeader
        title="Subir planilla de transporte"
        subtitle="Carga PDFs de remisiones para crear guías automáticamente"
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "16px",
          marginBottom: "20px",
        }}
      >
        {/* Subir PDF */}
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
              fontSize: "11px",
              color: "var(--gray)",
              textTransform: "uppercase",
              letterSpacing: ".05em",
              marginBottom: "12px",
            }}
          >
            Archivo PDF
          </div>
          <div
            onClick={() => fileRef.current.click()}
            style={{
              border: "2px dashed var(--blk5)",
              borderRadius: "8px",
              padding: "32px",
              textAlign: "center",
              cursor: "pointer",
              transition: "all .15s",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.borderColor = "var(--m)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.borderColor = "var(--blk5)")
            }
          >
            <div style={{ fontSize: "28px", marginBottom: "8px" }}>📄</div>
            <div
              style={{
                fontSize: "13px",
                color: "var(--wht2)",
                fontWeight: "500",
              }}
            >
              {archivo ? archivo.name : "Clic para seleccionar PDF"}
            </div>
            <div
              style={{
                fontSize: "11px",
                color: "var(--gray)",
                marginTop: "4px",
              }}
            >
              Planilla de remisión de transporte
            </div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf"
            style={{ display: "none" }}
            onChange={procesarPDF}
          />
          {procesando && (
            <div
              style={{
                fontSize: "12px",
                color: "var(--m)",
                marginTop: "12px",
                textAlign: "center",
              }}
            >
              ⏳ Leyendo PDF...
            </div>
          )}
        </div>

        {/* Info detectada */}
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
              fontSize: "11px",
              color: "var(--gray)",
              textTransform: "uppercase",
              letterSpacing: ".05em",
              marginBottom: "12px",
            }}
          >
            Información detectada
          </div>
          {planilla ? (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "10px" }}
            >
              {[
                {
                  label: "Planilla",
                  value: planilla.numero_planilla || "No detectado",
                },
                {
                  label: "Fecha",
                  value: planilla.fecha_planilla
                    ? `${planilla.fecha_planilla} ✓`
                    : "No detectado",
                },
                {
                  label: "Transportadora detectada",
                  value: planilla.transportadora || "No detectado",
                },
                {
                  label: "Guías encontradas",
                  value: `${planilla.guias.length} guías`,
                },
              ].map(({ label, value }) => (
                <div
                  key={label}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "12px",
                  }}
                >
                  <span style={{ color: "var(--gray)" }}>{label}</span>
                  <span
                    style={{
                      color: label === "Fecha" ? "var(--m)" : "var(--wht)",
                      fontWeight: "500",
                    }}
                  >
                    {value}
                  </span>
                </div>
              ))}
              <div style={{ marginTop: "8px" }}>
                <div
                  style={{
                    fontSize: "10px",
                    color: "var(--gray)",
                    textTransform: "uppercase",
                    letterSpacing: ".05em",
                    marginBottom: "5px",
                  }}
                >
                  Transportadora en sistema *
                </div>
                <select
                  value={transportadoraId}
                  onChange={(e) => setTransportadoraId(e.target.value)}
                  style={{ width: "100%" }}
                >
                  <option value="">— Seleccionar —</option>
                  {transportadoras.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <div
              style={{
                fontSize: "12px",
                color: "var(--gray)",
                textAlign: "center",
                paddingTop: "20px",
              }}
            >
              Sube un PDF para ver la información
            </div>
          )}
        </div>
      </div>

      {/* Resultado */}
      {resultado && (
        <div
          style={{
            background: resultado.error ? "#2a0000" : "#0d1f00",
            border: `1px solid ${resultado.error ? "#440000" : "#1a3300"}`,
            borderRadius: "8px",
            padding: "12px 16px",
            marginBottom: "16px",
            fontSize: "12px",
            color: resultado.error ? "var(--danger)" : "var(--m)",
          }}
        >
          {resultado.error ||
            `✓ ${resultado.nuevas} guías creadas · ${resultado.actualizadas || 0} actualizadas · ${resultado.duplicadas} ya existían · ${resultado.errores} errores`}
          <button
            onClick={() => setResultado(null)}
            style={{
              float: "right",
              background: "transparent",
              border: "none",
              color: "inherit",
              cursor: "pointer",
              fontSize: "16px",
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Panel conflictos transportadora */}
      {conflictos.length > 0 && (
        <div
          style={{
            background: "#1a0800",
            border: "1px solid var(--warn)",
            borderRadius: "10px",
            padding: "16px",
            marginBottom: "16px",
          }}
        >
          <div
            style={{
              fontSize: "13px",
              fontWeight: "500",
              color: "var(--warn)",
              marginBottom: "10px",
            }}
          >
            ⚠️ {conflictos.length} guía{conflictos.length > 1 ? "s" : ""} ya
            existen con transportadora diferente
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "6px",
              marginBottom: "14px",
            }}
          >
            {conflictos.map((c, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "8px 10px",
                  background: "rgba(255,170,0,0.07)",
                  borderRadius: "6px",
                  flexWrap: "wrap",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "11px",
                    color: "var(--m)",
                    minWidth: "100px",
                  }}
                >
                  {c.numero_guia}
                </span>
                <span style={{ fontSize: "11px", color: "var(--gray)" }}>
                  {c.factura}
                </span>
                <span style={{ fontSize: "11px", color: "var(--danger)" }}>
                  {c.trans_anterior}
                </span>
                <span style={{ fontSize: "11px", color: "var(--gray)" }}>
                  →
                </span>
                <span style={{ fontSize: "11px", color: "var(--m)" }}>
                  {c.trans_nueva}
                </span>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                    fontSize: "11px",
                    color: "var(--wht2)",
                    marginLeft: "auto",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={c.corregir}
                    onChange={(e) =>
                      setConflictos((prev) =>
                        prev.map((x, j) =>
                          j === i ? { ...x, corregir: e.target.checked } : x,
                        ),
                      )
                    }
                  />
                  Corregir transportadora
                </label>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={confirmarConflictos}
              style={{
                padding: "8px 16px",
                background: "var(--warn)",
                color: "var(--blk)",
                border: "none",
                borderRadius: "7px",
                fontSize: "12px",
                fontWeight: "500",
                cursor: "pointer",
              }}
            >
              Continuar y guardar
            </button>
            <button
              onClick={() => setConflictos([])}
              style={{
                padding: "8px 14px",
                background: "transparent",
                border: "1px solid var(--blk5)",
                borderRadius: "7px",
                color: "var(--gray)",
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Tabla guías detectadas */}
      {editando.length > 0 && (
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
              borderBottom: "1px solid var(--blk4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
              flexWrap: "wrap",
            }}
          >
            <div>
              <span
                style={{
                  fontSize: "13px",
                  fontWeight: "500",
                  color: "var(--wht)",
                }}
              >
                Guías detectadas
              </span>
              <span
                style={{
                  fontSize: "11px",
                  color: "var(--gray)",
                  marginLeft: "8px",
                }}
              >
                {editando.filter((g) => g.incluir).length} seleccionadas
              </span>
              {ambiguosPendientes > 0 && (
                <span
                  style={{
                    fontSize: "11px",
                    color: "var(--warn)",
                    marginLeft: "10px",
                  }}
                >
                  ⚠️ {ambiguosPendientes} cliente
                  {ambiguosPendientes > 1 ? "s" : ""} por confirmar
                </span>
              )}
            </div>
            <Btn
              onClick={verificarYGuardar}
              disabled={guardando || !transportadoraId}
            >
              {guardando
                ? "Guardando..."
                : `Crear ${editando.filter((g) => g.incluir).length} guías`}
            </Btn>
          </div>

          {ambiguosPendientes > 0 && (
            <div
              style={{
                padding: "8px 16px",
                background: "rgba(255,170,0,0.06)",
                borderBottom: "1px solid rgba(255,170,0,0.2)",
                fontSize: "11px",
                color: "var(--warn)",
              }}
            >
              ⚠️ Los nombres en naranja son ambiguos — haz clic en el nombre
              para seleccionar el cliente correcto antes de crear las guías
            </div>
          )}

          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "12px",
              }}
            >
              <thead>
                <tr>
                  {["✓", "Factura", "Cliente", "Ciudad", "Dirección"].map(
                    (h) => (
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
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {editando.map((g, i) => (
                  <tr
                    key={i}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = "var(--hover-bg)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = "transparent")
                    }
                  >
                    <td
                      style={{
                        padding: "7px 12px",
                        borderBottom: "1px solid var(--blk3)",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={g.incluir}
                        onChange={(e) =>
                          setEditando((prev) =>
                            prev.map((x, j) =>
                              j === i ? { ...x, incluir: e.target.checked } : x,
                            ),
                          )
                        }
                      />
                    </td>
                    <td
                      style={{
                        padding: "7px 12px",
                        borderBottom: "1px solid var(--blk3)",
                        fontFamily: "var(--font-mono)",
                        color: "var(--m)",
                        fontSize: "11px",
                      }}
                    >
                      <input
                        value={g.factura || ""}
                        onChange={(e) =>
                          setEditando((prev) =>
                            prev.map((x, j) =>
                              j === i ? { ...x, factura: e.target.value } : x,
                            ),
                          )
                        }
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "var(--m)",
                          fontFamily: "var(--font-mono)",
                          fontSize: "11px",
                          width: "110px",
                        }}
                      />
                    </td>
                    <td
                      style={{
                        padding: "7px 12px",
                        borderBottom: "1px solid var(--blk3)",
                      }}
                    >
                      <SelectorClienteInline
                        nombre={g.cliente || ""}
                        clienteId={g.clienteId}
                        onSeleccionar={(cliente) =>
                          setEditando((prev) =>
                            prev.map((x, j) =>
                              j === i
                                ? {
                                    ...x,
                                    cliente: cliente.nombre,
                                    clienteId: cliente.id,
                                  }
                                : x,
                            ),
                          )
                        }
                      />
                    </td>
                    <td
                      style={{
                        padding: "7px 12px",
                        borderBottom: "1px solid var(--blk3)",
                        color: "var(--gray)",
                      }}
                    >
                      <input
                        value={g.ciudad || ""}
                        onChange={(e) =>
                          setEditando((prev) =>
                            prev.map((x, j) =>
                              j === i ? { ...x, ciudad: e.target.value } : x,
                            ),
                          )
                        }
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "var(--gray)",
                          fontSize: "12px",
                          width: "120px",
                        }}
                      />
                    </td>
                    <td
                      style={{
                        padding: "7px 12px",
                        borderBottom: "1px solid var(--blk3)",
                        color: "var(--gray)",
                      }}
                    >
                      <input
                        value={g.direccion || ""}
                        onChange={(e) =>
                          setEditando((prev) =>
                            prev.map((x, j) =>
                              j === i ? { ...x, direccion: e.target.value } : x,
                            ),
                          )
                        }
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "var(--gray)",
                          fontSize: "12px",
                          width: "200px",
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
