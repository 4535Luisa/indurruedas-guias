import { useEffect, useState, useRef } from "react";
import { supabase } from "../lib/supabase";
import { PageHeader, Btn } from "../components/UI";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

// Palabras que por sí solas son ambiguas
const PALABRAS_AMBIGUAS = [
  'distribuidora', 'ferreteria', 'comercializadora', 'inversiones',
  'agroveterinaria', 'suministros', 'industria', 'importadora',
  'representaciones', 'construcciones', 'servicios', 'grupo',
  'ferroplas', 'plasticos', 'agricolas', 'herramientas'
];

function esNombreAmbiguo(nombre) {
  if (!nombre) return false;
  const lower = nombre.toLowerCase().trim();
  // Si el nombre tiene menos de 3 palabras significativas Y empieza con palabra ambigua
  const palabras = lower.split(' ').filter(p => p.length > 2);
  if (palabras.length <= 2) {
    return PALABRAS_AMBIGUAS.some(p => lower.startsWith(p));
  }
  return false;
}

function parsearFecha(str) {
  if (!str) return null;
  const match = str.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (match) {
    const d = match[1].padStart(2, "0");
    const m = match[2].padStart(2, "0");
    const y = match[3];
    return `${y}-${m}-${d}`;
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
    const ysOrdenados = Object.keys(filas).map(Number).sort((a, b) => b - a);
    for (const y of ysOrdenados) {
      const palabras = filas[y].sort((a, b) => a.x - b.x);
      const linea = palabras.map((p) => `${p.x}:${p.str}`).join("|");
      if (linea.trim()) textoCompleto += linea + "\n";
    }
  }
  return textoCompleto;
}

function parsearPlanilla(texto) {
  const lineas = texto.split("\n").map((l) => l.trim()).filter(Boolean);
  const resultado = { transportadora: null, nit_transportadora: null, numero_planilla: null, fecha_planilla: null, guias: [] };

  for (const linea of lineas) {
    const textoPlano = linea.split("|").map((p) => p.split(":").slice(1).join(":")).join(" ");

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
      const m = textoPlano.match(/Transportador[:\s]+([A-Z][A-Z\s\.]+?)(?:\s+Nit|\s*$)/i);
      if (m) resultado.transportadora = m[1].trim();
    }

    const partes = linea.split("|").map((p) => {
      const idx = p.indexOf(":");
      return { x: parseInt(p.substring(0, idx)), str: p.substring(idx + 1) };
    }).filter((p) => !isNaN(p.x) && p.str);

    const primeraCol = partes[0];
    if (!primeraCol) continue;
    const facturaMatch = primeraCol.str.match(/^(FBG|FBC|REM|ACC)-0*(\d+)$/i);
    if (!facturaMatch) continue;

    const factura = `${facturaMatch[1].toUpperCase()}-${facturaMatch[2]}`;
    const clienteParts = partes.filter((p) => p.x >= 90 && p.x < 230).map((p) => p.str);
    const ciudadParts = partes.filter((p) => p.x >= 230 && p.x < 330).map((p) => p.str);
    const dirParts = partes.filter((p) => p.x >= 330 && p.x < 460)
      .filter((p) => !p.str.match(/^\d+[\.,]\d+$/) && !p.str.startsWith("$") && p.str !== "NO" && p.str !== "SI")
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

// Mini buscador inline en la tabla
function SelectorClienteInline({ nombre, onSeleccionar }) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState(nombre || '');
  const [opciones, setOpciones] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const ref = useRef();

  useEffect(() => {
    if (abierto && busqueda.trim().length > 2) buscarClientes();
  }, [busqueda, abierto]);

  // Cerrar al hacer clic fuera
  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setAbierto(false); }
    if (abierto) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [abierto]);

  async function buscarClientes() {
    setBuscando(true);
    const { data } = await supabase.from('clientes')
      .select('id, nombre, nit, usuarios(nombre)')
      .ilike('nombre', `%${busqueda.trim()}%`)
      .limit(8);
    setOpciones(data || []);
    setBuscando(false);
  }

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <input
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          onFocus={() => setAbierto(true)}
          style={{ background: "transparent", border: "none", color: esNombreAmbiguo(nombre) ? "var(--warn)" : "var(--wht2)", fontSize: "12px", width: "180px", outline: 'none' }}
        />
        {esNombreAmbiguo(nombre) && (
          <span title="Nombre ambiguo — haz clic para seleccionar cliente" style={{ cursor: 'pointer', fontSize: '11px' }}
            onClick={() => setAbierto(true)}>⚠️</span>
        )}
      </div>

      {abierto && (
        <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 100, background: 'var(--blk2)', border: '1px solid var(--m)', borderRadius: '8px', minWidth: '320px', maxHeight: '220px', overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
          <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--blk4)' }}>
            <input
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar cliente..."
              autoFocus
              style={{ width: '100%', fontSize: '12px', padding: '5px 8px' }}
            />
          </div>
          {buscando && <div style={{ padding: '10px', fontSize: '11px', color: 'var(--gray)' }}>Buscando...</div>}
          {!buscando && opciones.map(c => (
            <div key={c.id}
              onClick={() => { onSeleccionar(c); setAbierto(false); setBusqueda(c.nombre); }}
              style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--blk3)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--blk3)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <div style={{ fontSize: '12px', color: 'var(--wht)', fontWeight: '500' }}>{c.nombre}</div>
              <div style={{ fontSize: '10px', color: 'var(--gray)' }}>NIT: {c.nit || '—'} · {c.usuarios?.nombre || 'Sin asesor'}</div>
            </div>
          ))}
          {!buscando && opciones.length === 0 && busqueda.length > 2 && (
            <div style={{ padding: '10px 12px', fontSize: '11px', color: 'var(--gray)' }}>Sin resultados</div>
          )}
          <div onClick={() => setAbierto(false)}
            style={{ padding: '7px 12px', fontSize: '11px', color: 'var(--gray)', cursor: 'pointer', borderTop: '1px solid var(--blk4)', textAlign: 'center' }}>
            Cerrar
          </div>
        </div>
      )}
    </div>
  );
}
  const [busqueda, setBusqueda] = useState(guia.cliente || '');
  const [opciones, setOpciones] = useState([]);
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    if (busqueda.trim().length > 2) buscarClientes();
  }, [busqueda]);

  async function buscarClientes() {
    setBuscando(true);
    const { data } = await supabase.from('clientes')
      .select('id, nombre, nit, usuarios(nombre)')
      .ilike('nombre', `%${busqueda.trim()}%`)
      .limit(10);
    setOpciones(data || []);
    setBuscando(false);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
      onClick={onCerrar}>
      <div style={{ background: 'var(--blk2)', border: '1px solid var(--blk4)', borderRadius: '12px', width: '100%', maxWidth: '480px', padding: '20px' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: '13px', fontWeight: '500', color: 'var(--wht)', marginBottom: '4px' }}>Asignar cliente</div>
        <div style={{ fontSize: '11px', color: 'var(--gray)', marginBottom: '14px' }}>
          Factura <span style={{ color: 'var(--m)', fontFamily: 'var(--font-mono)' }}>{guia.factura}</span> · {guia.numero_guia} · Nombre en planilla: <em>{guia.cliente}</em>
        </div>

        <input
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar cliente por nombre..."
          autoFocus
          style={{ width: '100%', marginBottom: '10px' }}
        />

        {buscando && <div style={{ fontSize: '11px', color: 'var(--gray)', marginBottom: '8px' }}>Buscando...</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '250px', overflowY: 'auto' }}>
          {opciones.map(c => (
            <div key={c.id}
              onClick={() => onAsignar(c)}
              style={{ padding: '10px 12px', borderRadius: '7px', border: '1px solid var(--blk4)', cursor: 'pointer', background: 'var(--blk3)' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--m)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--blk4)'}>
              <div style={{ fontSize: '12px', color: 'var(--wht)', fontWeight: '500' }}>{c.nombre}</div>
              <div style={{ fontSize: '10px', color: 'var(--gray)', marginTop: '2px' }}>
                NIT: {c.nit || '—'} · Asesor: {c.usuarios?.nombre || '—'}
              </div>
            </div>
          ))}
          {!buscando && opciones.length === 0 && busqueda.length > 2 && (
            <div style={{ fontSize: '11px', color: 'var(--gray)', padding: '12px', textAlign: 'center' }}>
              No se encontraron clientes con ese nombre
            </div>
          )}
        </div>

        <button onClick={onCerrar}
          style={{ marginTop: '12px', width: '100%', padding: '8px', background: 'transparent', border: '1px solid var(--blk5)', borderRadius: '7px', color: 'var(--gray)', fontSize: '12px', cursor: 'pointer' }}>
          Cancelar
        </button>
      </div>
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
  const [guiasSinCliente, setGuiasSinCliente] = useState([]); // guías creadas que necesitan asignación
  const [asignandoGuia, setAsignandoGuia] = useState(null); // guía abierta en el buscador
  const fileRef = useRef();

  useEffect(() => { cargarTransportadoras(); }, []);

  async function cargarTransportadoras() {
    const { data } = await supabase.from("transportadoras").select("*").eq("activa", true).order("nombre");
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
    setGuiasSinCliente([]);

    try {
      const texto = await extraerTextoPDF(file);
      const datos = parsearPlanilla(texto);
      setPlanilla(datos);
      setEditando(datos.guias.map((g) => ({ ...g, incluir: true })));

      if (datos.nit_transportadora) {
        const trans = transportadoras.find((t) => t.nit?.includes(datos.nit_transportadora));
        if (trans) setTransportadoraId(trans.id);
      }
    } catch (err) {
      setResultado({ error: "Error leyendo PDF: " + err.message });
    }
    setProcesando(false);
  }

  async function verificarYGuardar() {
    if (!transportadoraId) { alert("Selecciona la transportadora"); return; }

    const trans = transportadoras.find((t) => t.id === transportadoraId);
    const guiasAGuardar = editando.filter((g) => g.incluir && g.factura);
    const planillaCorta = (planilla.numero_planilla || "RTF-0").replace(/RTF-0+(\d+)/i, "RTF-$1");
    const numerosGuia = guiasAGuardar.map((_, i) => `${planillaCorta}-${i + 1}`);

    const { data: existentes } = await supabase.from("guias")
      .select("id, numero_guia, transportadora_nombre, transportadora_id, fecha_guia")
      .in("numero_guia", numerosGuia);

    const existentesMap = {};
    (existentes || []).forEach((g) => { existentesMap[g.numero_guia] = g; });

    const nuevosConflictos = [];
    guiasAGuardar.forEach((g, i) => {
      const numGuia = `${planillaCorta}-${i + 1}`;
      const existente = existentesMap[numGuia];
      if (existente && existente.transportadora_id !== transportadoraId) {
        nuevosConflictos.push({ numero_guia: numGuia, factura: g.factura, trans_anterior: existente.transportadora_nombre, trans_nueva: trans.nombre, id: existente.id, corregir: true });
      }
    });

    if (nuevosConflictos.length > 0) { setConflictos(nuevosConflictos); return; }

    await guardarGuias(existentesMap, planillaCorta, trans, guiasAGuardar);
  }

  async function guardarGuias(existentesMap, planillaCorta, trans, guiasAGuardar) {
    setGuardando(true);
    setConflictos([]);

    let nuevas = 0, actualizadas = 0, duplicadas = 0, errores = 0;
    const sinCliente = [];

    for (let i = 0; i < guiasAGuardar.length; i++) {
      const g = guiasAGuardar[i];
      const numeroGuia = `${planillaCorta}-${i + 1}`;
      const existente = existentesMap?.[numeroGuia];

      if (existente) {
        const conflicto = conflictos.find((c) => c.numero_guia === numeroGuia);
        if (conflicto?.corregir) {
          await supabase.from("guias").update({ transportadora_nombre: trans.nombre, transportadora_id: transportadoraId, fecha_guia: planilla.fecha_planilla, fecha_planilla: planilla.fecha_planilla }).eq("id", existente.id);
          actualizadas++;
        } else { duplicadas++; }
        continue;
      }

      // Usar clienteId preseleccionado en tabla, o buscar por nombre
      let clienteId = g.clienteId || null;
      let clienteAmbiguo = false;

      if (!clienteId && g.cliente?.trim().length > 2) {
        const nombreLimpio = g.cliente.trim();
        const { data: exacto } = await supabase.from("clientes").select("id").ilike("nombre", nombreLimpio).limit(1);
        if (exacto?.[0]) {
          clienteId = exacto[0].id;
        } else {
          const { data: parciales } = await supabase.from("clientes").select("id, nombre").ilike("nombre", `%${nombreLimpio}%`).limit(5);
          if (parciales?.length === 1) {
            clienteId = parciales[0].id;
          } else if (parciales?.length > 1 || esNombreAmbiguo(nombreLimpio)) {
            clienteAmbiguo = true;
          }
        }
      }

      const { data: guiaCreada, error } = await supabase.from("guias").insert({
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
      }).select('id').single();

      if (!error) {
        nuevas++;
        // Si no se asignó cliente o fue ambiguo, agregar al panel de revisión
        if (!clienteId || clienteAmbiguo) {
          sinCliente.push({
            id: guiaCreada.id,
            numero_guia: numeroGuia,
            factura: g.factura,
            cliente: g.cliente,
            ciudad: g.ciudad,
            ambiguo: clienteAmbiguo,
            asignado: false,
          });
        }
      } else errores++;
    }

    await supabase.from("sync_log").insert({
      transportadora: "otra",
      guias_nuevas: nuevas,
      guias_actualizadas: actualizadas,
      errores,
      detalle: { planilla: planilla.numero_planilla, transportadora: trans.nombre },
    });

    setResultado({ nuevas, actualizadas, duplicadas, errores });
    setGuiasSinCliente(sinCliente);
    setGuardando(false);
  }

  async function confirmarConflictos() {
    const trans = transportadoras.find((t) => t.id === transportadoraId);
    const guiasAGuardar = editando.filter((g) => g.incluir && g.factura);
    const planillaCorta = (planilla.numero_planilla || "RTF-0").replace(/RTF-0+(\d+)/i, "RTF-$1");
    const numerosGuia = guiasAGuardar.map((_, i) => `${planillaCorta}-${i + 1}`);
    const { data: existentes } = await supabase.from("guias").select("id, numero_guia, transportadora_nombre, transportadora_id").in("numero_guia", numerosGuia);
    const existentesMap = {};
    (existentes || []).forEach((g) => { existentesMap[g.numero_guia] = g; });
    await guardarGuias(existentesMap, planillaCorta, trans, guiasAGuardar);
  }

  async function asignarCliente(cliente) {
    if (!asignandoGuia) return;
    await supabase.from('guias').update({ cliente_id: cliente.id }).eq('id', asignandoGuia.id);
    setGuiasSinCliente(prev => prev.map(g => g.id === asignandoGuia.id
      ? { ...g, asignado: true, clienteAsignado: cliente.nombre }
      : g
    ));
    setAsignandoGuia(null);
  }

  const pendientesSinAsignar = guiasSinCliente.filter(g => !g.asignado);

  return (
    <div>
      <PageHeader title="Subir planilla de transporte" subtitle="Carga PDFs de remisiones para crear guías automáticamente" />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "20px" }}>
        {/* Subir PDF */}
        <div style={{ background: "var(--blk2)", border: "1px solid var(--blk4)", borderRadius: "10px", padding: "20px" }}>
          <div style={{ fontSize: "11px", color: "var(--gray)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "12px" }}>Archivo PDF</div>
          <div onClick={() => fileRef.current.click()}
            style={{ border: "2px dashed var(--blk5)", borderRadius: "8px", padding: "32px", textAlign: "center", cursor: "pointer", transition: "all .15s" }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--m)")}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--blk5)")}>
            <div style={{ fontSize: "28px", marginBottom: "8px" }}>📄</div>
            <div style={{ fontSize: "13px", color: "var(--wht2)", fontWeight: "500" }}>{archivo ? archivo.name : "Clic para seleccionar PDF"}</div>
            <div style={{ fontSize: "11px", color: "var(--gray)", marginTop: "4px" }}>Planilla de remisión de transporte</div>
          </div>
          <input ref={fileRef} type="file" accept=".pdf" style={{ display: "none" }} onChange={procesarPDF} />
          {procesando && <div style={{ fontSize: "12px", color: "var(--m)", marginTop: "12px", textAlign: "center" }}>⏳ Leyendo PDF...</div>}
        </div>

        {/* Info detectada */}
        <div style={{ background: "var(--blk2)", border: "1px solid var(--blk4)", borderRadius: "10px", padding: "20px" }}>
          <div style={{ fontSize: "11px", color: "var(--gray)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "12px" }}>Información detectada</div>
          {planilla ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {[
                { label: "Planilla", value: planilla.numero_planilla || "No detectado" },
                { label: "Fecha", value: planilla.fecha_planilla ? `${planilla.fecha_planilla} ✓` : "No detectado" },
                { label: "Transportadora detectada", value: planilla.transportadora || "No detectado" },
                { label: "Guías encontradas", value: `${planilla.guias.length} guías` },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
                  <span style={{ color: "var(--gray)" }}>{label}</span>
                  <span style={{ color: label === "Fecha" ? "var(--m)" : "var(--wht)", fontWeight: "500" }}>{value}</span>
                </div>
              ))}
              <div style={{ marginTop: "8px" }}>
                <div style={{ fontSize: "10px", color: "var(--gray)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "5px" }}>Transportadora en sistema *</div>
                <select value={transportadoraId} onChange={(e) => setTransportadoraId(e.target.value)} style={{ width: "100%" }}>
                  <option value="">— Seleccionar —</option>
                  {transportadoras.map((t) => (<option key={t.id} value={t.id}>{t.nombre}</option>))}
                </select>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: "12px", color: "var(--gray)", textAlign: "center", paddingTop: "20px" }}>Sube un PDF para ver la información</div>
          )}
        </div>
      </div>

      {/* Resultado */}
      {resultado && (
        <div style={{ background: resultado.error ? "#2a0000" : "#0d1f00", border: `1px solid ${resultado.error ? "#440000" : "#1a3300"}`, borderRadius: "8px", padding: "12px 16px", marginBottom: "16px", fontSize: "12px", color: resultado.error ? "var(--danger)" : "var(--m)" }}>
          {resultado.error || `✓ ${resultado.nuevas} guías creadas · ${resultado.actualizadas || 0} actualizadas · ${resultado.duplicadas} ya existían · ${resultado.errores} errores`}
          <button onClick={() => setResultado(null)} style={{ float: "right", background: "transparent", border: "none", color: "inherit", cursor: "pointer", fontSize: "16px" }}>×</button>
        </div>
      )}

      {/* Panel clientes sin asignar / ambiguos */}
      {guiasSinCliente.length > 0 && (
        <div style={{ background: '#1a1000', border: '1px solid var(--warn)', borderRadius: '10px', padding: '16px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: '500', color: 'var(--warn)' }}>
                ⚠️ {pendientesSinAsignar.length} guía{pendientesSinAsignar.length !== 1 ? 's' : ''} sin cliente asignado
              </div>
              <div style={{ fontSize: '11px', color: 'var(--gray)', marginTop: '2px' }}>
                El nombre en la planilla es ambiguo o no coincide exactamente con ningún cliente
              </div>
            </div>
            {pendientesSinAsignar.length === 0 && (
              <span style={{ fontSize: '12px', color: 'var(--m)', fontWeight: '500' }}>✓ Todos asignados</span>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {guiasSinCliente.map((g) => (
              <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', background: g.asignado ? 'rgba(170,255,0,0.05)' : 'rgba(255,170,0,0.07)', borderRadius: '7px', border: `1px solid ${g.asignado ? 'rgba(170,255,0,0.2)' : 'rgba(255,170,0,0.2)'}`, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--m)', minWidth: '90px' }}>{g.numero_guia}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--gray)' }}>{g.factura}</span>
                <span style={{ fontSize: '11px', color: 'var(--wht2)', flex: 1 }}>
                  {g.asignado ? (
                    <span style={{ color: 'var(--m)' }}>✓ {g.clienteAsignado}</span>
                  ) : (
                    <>
                      <em style={{ color: 'var(--warn)' }}>{g.cliente}</em>
                      {g.ambiguo && <span style={{ fontSize: '10px', color: 'var(--gray)', marginLeft: '6px' }}>(nombre ambiguo)</span>}
                    </>
                  )}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--gray)' }}>{g.ciudad}</span>
                {!g.asignado && (
                  <button onClick={() => setAsignandoGuia(g)}
                    style={{ fontSize: '11px', padding: '4px 12px', background: 'var(--warn)', color: 'var(--blk)', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: '500', flexShrink: 0 }}>
                    Asignar cliente
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Panel conflictos transportadora */}
      {conflictos.length > 0 && (
        <div style={{ background: "#1a0800", border: "1px solid var(--warn)", borderRadius: "10px", padding: "16px", marginBottom: "16px" }}>
          <div style={{ fontSize: "13px", fontWeight: "500", color: "var(--warn)", marginBottom: "10px" }}>
            ⚠️ {conflictos.length} guía{conflictos.length > 1 ? "s" : ""} ya existen con transportadora diferente
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "14px" }}>
            {conflictos.map((c, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 10px", background: "rgba(255,170,0,0.07)", borderRadius: "6px", flexWrap: "wrap" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--m)", minWidth: "100px" }}>{c.numero_guia}</span>
                <span style={{ fontSize: "11px", color: "var(--gray)" }}>{c.factura}</span>
                <span style={{ fontSize: "11px", color: "var(--danger)" }}>{c.trans_anterior}</span>
                <span style={{ fontSize: "11px", color: "var(--gray)" }}>→</span>
                <span style={{ fontSize: "11px", color: "var(--m)" }}>{c.trans_nueva}</span>
                <label style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", color: "var(--wht2)", marginLeft: "auto", cursor: "pointer" }}>
                  <input type="checkbox" checked={c.corregir}
                    onChange={(e) => setConflictos((prev) => prev.map((x, j) => j === i ? { ...x, corregir: e.target.checked } : x))} />
                  Corregir transportadora
                </label>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={confirmarConflictos} style={{ padding: "8px 16px", background: "var(--warn)", color: "var(--blk)", border: "none", borderRadius: "7px", fontSize: "12px", fontWeight: "500", cursor: "pointer" }}>Continuar y guardar</button>
            <button onClick={() => setConflictos([])} style={{ padding: "8px 14px", background: "transparent", border: "1px solid var(--blk5)", borderRadius: "7px", color: "var(--gray)", fontSize: "12px", cursor: "pointer" }}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Tabla guías detectadas */}
      {editando.length > 0 && (
        <div style={{ background: "var(--blk2)", border: "1px solid var(--blk4)", borderRadius: "10px", overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--blk4)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <span style={{ fontSize: "13px", fontWeight: "500", color: "var(--wht)" }}>Guías detectadas</span>
              <span style={{ fontSize: "11px", color: "var(--gray)", marginLeft: "8px" }}>{editando.filter((g) => g.incluir).length} seleccionadas</span>
            </div>
            <Btn onClick={verificarYGuardar} disabled={guardando || !transportadoraId}>
              {guardando ? "Guardando..." : `Crear ${editando.filter((g) => g.incluir).length} guías`}
            </Btn>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
              <thead>
                <tr>
                  {["✓", "Factura", "Cliente", "Ciudad", "Dirección"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "8px 12px", fontSize: "10px", color: "var(--gray)", borderBottom: "1px solid var(--blk4)", textTransform: "uppercase", letterSpacing: ".04em", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {editando.map((g, i) => (
                  <tr key={i}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover-bg)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                    <td style={{ padding: "7px 12px", borderBottom: "1px solid var(--blk3)" }}>
                      <input type="checkbox" checked={g.incluir} onChange={(e) => setEditando((prev) => prev.map((x, j) => j === i ? { ...x, incluir: e.target.checked } : x))} />
                    </td>
                    <td style={{ padding: "7px 12px", borderBottom: "1px solid var(--blk3)", fontFamily: "var(--font-mono)", color: "var(--m)", fontSize: "11px" }}>
                      <input value={g.factura || ""} onChange={(e) => setEditando((prev) => prev.map((x, j) => j === i ? { ...x, factura: e.target.value } : x))} style={{ background: "transparent", border: "none", color: "var(--m)", fontFamily: "var(--font-mono)", fontSize: "11px", width: "110px" }} />
                    </td>
                    <td style={{ padding: "7px 12px", borderBottom: "1px solid var(--blk3)", color: "var(--wht2)" }}>
                      <SelectorClienteInline
                        nombre={g.cliente || ""}
                        onSeleccionar={(cliente) =>
                          setEditando((prev) => prev.map((x, j) =>
                            j === i ? { ...x, cliente: cliente.nombre, clienteId: cliente.id } : x
                          ))
                        }
                      />
                    </td>
                    <td style={{ padding: "7px 12px", borderBottom: "1px solid var(--blk3)", color: "var(--gray)" }}>
                      <input value={g.ciudad || ""} onChange={(e) => setEditando((prev) => prev.map((x, j) => j === i ? { ...x, ciudad: e.target.value } : x))} style={{ background: "transparent", border: "none", color: "var(--gray)", fontSize: "12px", width: "120px" }} />
                    </td>
                    <td style={{ padding: "7px 12px", borderBottom: "1px solid var(--blk3)", color: "var(--gray)" }}>
                      <input value={g.direccion || ""} onChange={(e) => setEditando((prev) => prev.map((x, j) => j === i ? { ...x, direccion: e.target.value } : x))} style={{ background: "transparent", border: "none", color: "var(--gray)", fontSize: "12px", width: "200px" }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal buscador de cliente */}
      {asignandoGuia && (
        <BuscadorCliente
          guia={asignandoGuia}
          onAsignar={asignarCliente}
          onCerrar={() => setAsignandoGuia(null)}
        />
      )}
    </div>
  );
}