import { useEffect, useState, useRef } from "react";
import { supabase } from "../lib/supabase";
import { PageHeader, Btn } from "../components/UI";
import * as pdfjsLib from "pdfjs-dist";

// Usar el worker que viene incluido en el paquete instalado
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

function parsearFecha(str) {
  if (!str) return null;
  // formato dd-mm-yyyy o dd/mm/yyyy
  const match = str.match(/(\d{2})[-/](\d{2})[-/](\d{4})/);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  return null;
}

function limpiarFactura(doc) {
  if (!doc) return null;
  // Quitar ceros: FBG-00045212 → FBG-45212, REM-00031569 → REM-31569
  return doc.replace(
    /(FBG|FBC|REM|ACC)-0+(\d+)/i,
    (_, pre, num) => `${pre.toUpperCase()}-${num}`,
  );
}

async function extraerTextoPDF(file) {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  let textoCompleto = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();

    // Agrupar items por posición Y (línea)
    const filas = {};
    for (const item of content.items) {
      const y = Math.round(item.transform[5]);
      const x = Math.round(item.transform[4]);
      if (!filas[y]) filas[y] = [];
      filas[y].push({ x, str: item.str.trim() });
    }

    // Ordenar por Y descendente y concatenar cada fila
    const ysOrdenados = Object.keys(filas)
      .map(Number)
      .sort((a, b) => b - a);
    for (const y of ysOrdenados) {
      const palabras = filas[y].sort((a, b) => a.x - b.x);
      // Guardar como línea con marcadores de columna
      // formato: "x:texto x:texto ..."
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
    // Reconstruir texto plano para búsquedas generales
    const textoPlano = linea
      .split("|")
      .map((p) => p.split(":").slice(1).join(":"))
      .join(" ");

    // Número de planilla
    if (!resultado.numero_planilla) {
      const m = textoPlano.match(/RTF-(\d+)/i);
      if (m) resultado.numero_planilla = `RTF-${m[1]}`;
    }

    // Fecha
    if (!resultado.fecha_planilla) {
      const m = textoPlano.match(/Fecha[:\s]+(\d{2}[-/]\d{2}[-/]\d{4})/i);
      if (m) resultado.fecha_planilla = parsearFecha(m[1]);
    }

    // NIT transportadora
    if (!resultado.nit_transportadora) {
      const m = textoPlano.match(/Nit[:\s]+(\d[\d\-]+)/i);
      if (m) resultado.nit_transportadora = m[1].replace(/-\d+$/, "");
    }

    // Transportadora
    if (!resultado.transportadora) {
      const m = textoPlano.match(
        /Transportador[:\s]+([A-Z][A-Z\s\.]+?)(?:\s+Nit|\s*$)/i,
      );
      if (m) resultado.transportadora = m[1].trim();
    }

    // Filas de guías — parsear usando posiciones X
    const partes = linea
      .split("|")
      .map((p) => {
        const idx = p.indexOf(":");
        return { x: parseInt(p.substring(0, idx)), str: p.substring(idx + 1) };
      })
      .filter((p) => !isNaN(p.x) && p.str);

    // Verificar si la primera columna es una factura
    const primeraCol = partes[0];
    if (!primeraCol) continue;
    const facturaMatch = primeraCol.str.match(/^(FBG|FBC|REM|ACC)-0*(\d+)$/i);
    if (!facturaMatch) continue;

    const factura = `${facturaMatch[1].toUpperCase()}-${facturaMatch[2]}`;

    // Separar por rangos X:
    // x < 230 → cliente
    // x 230-312 → ciudad
    // x 312-450 → dirección
    const clienteParts = partes
      .filter((p) => p.x >= 90 && p.x < 230)
      .map((p) => p.str);
    const ciudadParts = partes
      .filter((p) => p.x >= 230 && p.x < 312)
      .map((p) => p.str);
    const dirParts = partes
      .filter((p) => p.x >= 312 && p.x < 450)
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

export default function SubirPlanilla() {
  const [transportadoras, setTransportadoras] = useState([]);
  const [archivo, setArchivo] = useState(null);
  const [procesando, setProcesando] = useState(false);
  const [planilla, setPlanilla] = useState(null);
  const [transportadoraId, setTransportadoraId] = useState("");
  const [editando, setEditando] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [textoRaw, setTextoRaw] = useState("");
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

    try {
      const texto = await extraerTextoPDF(file);
      setTextoRaw(texto);
      const datos = parsearPlanilla(texto);
      setPlanilla(datos);
      setEditando(datos.guias.map((g) => ({ ...g, incluir: true })));

      // Autoseleccionar transportadora si coincide NIT
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

  async function guardarGuias() {
    if (!transportadoraId) {
      alert("Selecciona la transportadora");
      return;
    }
    setGuardando(true);

    const trans = transportadoras.find((t) => t.id === transportadoraId);
    const guiasAGuardar = editando.filter((g) => g.incluir && g.factura);

    let nuevas = 0,
      duplicadas = 0,
      errores = 0;
    let indice = 1;
    for (const g of guiasAGuardar) {
      const planillaCorta = (planilla.numero_planilla || "RTF-0").replace(
        /RTF-0+(\d+)/i,
        "RTF-$1",
      );
      const numeroGuia = `${planillaCorta}-${indice}`;

      // Verificar si ya existe por numero_guia
      const { data: existe } = await supabase
        .from("guias")
        .select("id")
        .eq("numero_guia", numeroGuia)
        .maybeSingle();
      if (existe) {
        duplicadas++;
        indice++;
        continue;
      }

      // Buscar cliente por nombre
      let clienteId = null;
      if (g.cliente) {
        const palabras = g.cliente.trim().split(" ").slice(0, 2).join(" ");
        const { data: cli } = await supabase
          .from("clientes")
          .select("id")
          .ilike("nombre", `%${palabras}%`)
          .limit(1);
        if (cli?.[0]) clienteId = cli[0].id;
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

      if (!error) {
        nuevas++;
        indice++;
      } else errores++;
    }

    await supabase.from("sync_log").insert({
      transportadora: "otra",
      guias_nuevas: nuevas,
      guias_actualizadas: 0,
      errores,
      detalle: {
        planilla: planilla.numero_planilla,
        transportadora: trans.nombre,
      },
    });

    setResultado({ nuevas, duplicadas, errores });
    setGuardando(false);
  }

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
                  value: planilla.fecha_planilla || "No detectado",
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
                  <span style={{ color: "var(--wht)", fontWeight: "500" }}>
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
                  Transportadora en sistema
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
            `✓ ${resultado.nuevas} guías creadas · ${resultado.duplicadas} ya existían · ${resultado.errores} errores`}
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

      {/* Tabla de guías detectadas */}
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
            </div>
            <Btn
              onClick={guardarGuias}
              disabled={guardando || !transportadoraId}
            >
              {guardando
                ? "Guardando..."
                : `Crear ${editando.filter((g) => g.incluir).length} guías`}
            </Btn>
          </div>
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
                        color: "var(--wht2)",
                      }}
                    >
                      <input
                        value={g.cliente || ""}
                        onChange={(e) =>
                          setEditando((prev) =>
                            prev.map((x, j) =>
                              j === i ? { ...x, cliente: e.target.value } : x,
                            ),
                          )
                        }
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "var(--wht2)",
                          fontSize: "12px",
                          width: "200px",
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
