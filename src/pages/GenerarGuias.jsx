import { useEffect, useMemo, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { PageHeader, Btn, Table, Th, Td, PillTransportadora } from "../components/UI";
import { useAuth } from "../context/AuthContext";
import { extraerItemsPDF, parsearFactura } from "../lib/envios/factura";
import { procesarFactura, anularDespacho, reimprimirRotulos, NO_FORZABLES } from "../lib/envios/procesar";
import { cargarCatalogo, cargarConfig, guardarConfig, listarDespachos } from "../lib/envios/datos";
import { llamarTCC } from "../lib/envios/api";
import { listaMunicipios, buscarPorCodigo } from "../lib/envios/municipios";
import { leerPorcentaje } from "../lib/envios/porcentajes";
import { cajasValidas } from "../lib/envios/empaque";

const CAJA_VACIA = { largo_cm: "", ancho_cm: "", alto_cm: "", peso_kg: "" };

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

const ESTADOS = {
  revision: { label: "Revisar", color: "var(--warn)" },
  lista: { label: "Lista", color: "var(--info)" },
  generada: { label: "Generada", color: "var(--m)" },
  error: { label: "Error", color: "var(--danger)" },
  anulada: { label: "Anulada", color: "var(--gray)" },
};
const pesos = (n) => (n == null ? "—" : "$" + Math.round(n).toLocaleString("es-CO"));
const card = { background: "var(--blk2)", border: "1px solid var(--blk4)", borderRadius: "10px" };

function PillEstadoDespacho({ estado }) {
  const e = ESTADOS[estado] || ESTADOS.revision;
  return (
    <span style={{ fontSize: "10px", fontWeight: 500, padding: "2px 9px", borderRadius: "20px", color: e.color, border: `1px solid ${e.color}` }}>
      {e.label}
    </span>
  );
}

export default function GenerarGuias() {
  const { perfil } = useAuth();
  const [ambiente, setAmbiente] = useState(null);
  const [errorAmbiente, setErrorAmbiente] = useState(null);
  const [errorDatos, setErrorDatos] = useState(null);
  const [despachos, setDespachos] = useState([]);
  const [filtro, setFiltro] = useState("");
  const [texto, setTexto] = useState("");
  const [progreso, setProgreso] = useState(null);
  const [abierto, setAbierto] = useState(null);
  const inputRef = useRef();

  useEffect(() => {
    llamarTCC("estado", {})
      .then((r) => setAmbiente(r.ambiente))
      .catch((e) => setErrorAmbiente(e.message));
    recargar();
  }, []);

  async function recargar() {
    try {
      setDespachos(await listarDespachos());
      setErrorDatos(null);
    } catch (e) {
      setErrorDatos(e.message);
    }
  }

  const visibles = useMemo(() => {
    const t = texto.trim().toLowerCase();
    return despachos.filter(
      (d) =>
        (!filtro || d.estado === filtro) &&
        (!t || [d.factura, d.cliente_nombre, d.numero_remesa, d.ciudad].some((v) => String(v || "").toLowerCase().includes(t))),
    );
  }, [despachos, filtro, texto]);

  const conteo = useMemo(() => {
    const c = {};
    for (const d of despachos) c[d.estado] = (c[d.estado] || 0) + 1;
    return c;
  }, [despachos]);

  async function procesarArchivos(files) {
    const lista = [...files].filter((f) => f.name.toLowerCase().endsWith(".pdf"));
    if (!lista.length) return;
    let catalogo, cfg;
    try {
      [catalogo, cfg] = await Promise.all([cargarCatalogo(), cargarConfig()]);
    } catch (e) {
      setErrorDatos(e.message);
      return;
    }
    const log = [];
    for (let i = 0; i < lista.length; i++) {
      const f = lista[i];
      setProgreso({ actual: i + 1, total: lista.length, archivo: f.name, log: [...log] });
      try {
        const { items } = await extraerItemsPDF(pdfjsLib, new Uint8Array(await f.arrayBuffer()));
        const factura = parsearFactura(items);
        const d = await procesarFactura(factura, { catalogo, cfg, ambiente, usuarioId: perfil?.id, archivo: f.name });
        log.push({ archivo: f.name, ok: true, estado: d.estado, factura: d.factura, remesa: d.numero_remesa });
      } catch (e) {
        log.push({ archivo: f.name, ok: false, error: e.message });
      }
    }
    setProgreso({ actual: lista.length, total: lista.length, terminado: true, log });
    await recargar();
  }

  return (
    <div>
      <PageHeader title="Generar guías" subtitle="Sube las facturas en PDF: se calculan bultos, se cotiza y se genera la guía automáticamente">
        <Btn variant="primary" onClick={() => inputRef.current?.click()} disabled={!ambiente || (progreso && !progreso.terminado)}>
          + Subir facturas PDF
        </Btn>
      </PageHeader>
      <input ref={inputRef} type="file" accept="application/pdf" multiple hidden onChange={(e) => { procesarArchivos(e.target.files); e.target.value = ""; }} />

      {errorDatos && <Aviso color="var(--danger)">{errorDatos}</Aviso>}
      {errorAmbiente && (
        <Aviso color="var(--danger)">No se pudo contactar el servicio de TCC: {errorAmbiente}</Aviso>
      )}
      {ambiente === "pruebas" && (
        <Aviso color="var(--warn)">
          AMBIENTE DE PRUEBAS — las guías se crean en el sistema de pruebas de TCC, no se despachan y no se registran en el dashboard.
        </Aviso>
      )}

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); if (ambiente) procesarArchivos(e.dataTransfer.files); }}
        onClick={() => ambiente && inputRef.current?.click()}
        style={{ ...card, borderStyle: "dashed", padding: "22px", textAlign: "center", color: "var(--gray)", fontSize: "12px", marginBottom: "16px", cursor: "pointer" }}
      >
        Arrastra aquí las facturas (puedes soltar varias a la vez)
      </div>

      {progreso && <Progreso p={progreso} cerrar={() => setProgreso(null)} />}

      <div style={{ display: "flex", gap: "8px", marginBottom: "12px", flexWrap: "wrap", alignItems: "center" }}>
        {[["", "Todas"], ["revision", "Por revisar"], ["generada", "Generadas"], ["error", "Con error"], ["lista", "Listas"], ["anulada", "Anuladas"]].map(([k, l]) => (
          <button key={k} onClick={() => setFiltro(k)}
            style={{ fontSize: "11px", padding: "5px 11px", borderRadius: "6px", cursor: "pointer", background: filtro === k ? "var(--m-dim)" : "transparent",
              color: filtro === k ? "var(--m)" : "var(--gray)", border: `1px solid ${filtro === k ? "var(--m)" : "var(--blk5)"}` }}>
            {l}{k ? ` (${conteo[k] || 0})` : ` (${despachos.length})`}
          </button>
        ))}
        <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar factura, cliente, remesa..." style={{ flex: 1, minWidth: "200px" }} />
      </div>

      <div style={{ ...card, overflow: "hidden" }}>
        <Table>
          <thead>
            <tr>
              <Th>Factura</Th><Th>Cliente</Th><Th>Destino</Th><Th>Bultos</Th><Th>Kg cobrables</Th><Th>Flete</Th><Th>Transp.</Th><Th>Estado</Th><Th>Remesa</Th><Th></Th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((d) => (
              <FilaDespacho key={d.id} d={d} abierto={abierto === d.id} toggle={() => setAbierto(abierto === d.id ? null : d.id)} onCambio={recargar} />
            ))}
            {!visibles.length && (
              <tr><Td style={{ color: "var(--gray)" }}>No hay facturas procesadas{filtro ? " con este estado" : ""}.</Td></tr>
            )}
          </tbody>
        </Table>
      </div>
    </div>
  );
}

function Aviso({ color, children }) {
  return (
    <div style={{ border: `1px solid ${color}`, color, borderRadius: "8px", padding: "10px 14px", fontSize: "12px", marginBottom: "14px", fontWeight: 500 }}>
      {children}
    </div>
  );
}

function Progreso({ p, cerrar }) {
  return (
    <div style={{ ...card, padding: "14px", marginBottom: "16px", fontSize: "12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
        <span style={{ color: "var(--wht)" }}>
          {p.terminado ? `Listo: ${p.total} factura(s) procesadas` : `Procesando ${p.actual} de ${p.total}: ${p.archivo}`}
        </span>
        {p.terminado && <button onClick={cerrar} style={{ background: "none", border: "none", color: "var(--gray)", cursor: "pointer" }}>✕</button>}
      </div>
      <div style={{ height: "4px", background: "var(--blk4)", borderRadius: "2px", marginBottom: "8px" }}>
        <div style={{ height: "100%", width: `${(p.actual / p.total) * 100}%`, background: "var(--m)", borderRadius: "2px" }} />
      </div>
      {p.log.map((l, i) => (
        <div key={i} style={{ color: l.ok ? "var(--wht3)" : "var(--danger)", fontFamily: "var(--font-mono)", fontSize: "11px" }}>
          {l.ok ? `${l.factura} → ${ESTADOS[l.estado]?.label || l.estado}${l.remesa ? " · remesa " + l.remesa : ""}` : `${l.archivo}: ${l.error}`}
        </div>
      ))}
    </div>
  );
}

function FilaDespacho({ d, abierto, toggle, onCambio }) {
  return (
    <>
      <tr onClick={toggle} style={{ cursor: "pointer", background: abierto ? "var(--blk3)" : "transparent" }}>
        <Td style={{ fontFamily: "var(--font-mono)", color: "var(--wht)" }}>{d.factura}</Td>
        <Td>{d.cliente_nombre}</Td>
        <Td>{d.ciudad}</Td>
        <Td>{d.bultos ?? "—"}</Td>
        <Td>{d.peso_cobrable_kg ?? "—"}</Td>
        <Td>{pesos(d.valor_flete)}{d.dias_estimados ? <span style={{ color: "var(--gray)" }}> · {d.dias_estimados}d</span> : null}</Td>
        <Td>{d.transportadora ? <PillTransportadora transportadora={d.transportadora} /> : "—"}</Td>
        <Td>
          <PillEstadoDespacho estado={d.estado} />
          {d.ambiente === "pruebas" && <span style={{ fontSize: "9px", color: "var(--warn)", marginLeft: "6px" }}>PRUEBA</span>}
        </Td>
        <Td style={{ fontFamily: "var(--font-mono)" }}>{d.numero_remesa || "—"}</Td>
        <Td>
          {d.url_rotulos && d.estado === "generada" && (
            <a href={d.url_rotulos} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ color: "var(--m)", fontSize: "11px" }}>
              Rótulos ↗
            </a>
          )}
        </Td>
      </tr>
      {abierto && (
        <tr>
          <td colSpan={10} style={{ background: "var(--blk3)", padding: "16px", borderBottom: "1px solid var(--blk4)" }}>
            <DetalleDespacho d={d} onCambio={onCambio} />
          </td>
        </tr>
      )}
    </>
  );
}

function DetalleDespacho({ d, onCambio }) {
  const { perfil } = useAuth();
  const f = d.datos_factura || {};
  const cli = f.cliente || {};
  const corr0 = f.correcciones || {};
  const [corr, setCorr] = useState({
    direccion: corr0.direccion || cli.direccion || "",
    celular: corr0.celular || cli.celular || cli.telefono || "",
    destino_dane: corr0.destino_dane || d.destino_dane || "",
  });
  const [trabajando, setTrabajando] = useState(false);
  const [mensaje, setMensaje] = useState(null);
  const [pctNuevo, setPctNuevo] = useState("");
  const sueltas = d.empaque?.sueltas || [];
  const [cajas, setCajas] = useState(corr0.cajas_manuales?.length ? corr0.cajas_manuales : [{ ...CAJA_VACIA }]);
  const cambiarCaja = (i, k, v) => setCajas(cajas.map((c, j) => (j === i ? { ...c, [k]: v.replace(",", ".") } : c)));
  const pidePorcentaje = d.destino_dane && (d.excepciones || []).some((e) => e.codigo === "SIN_PORCENTAJE");
  const municipios = useMemo(() => listaMunicipios(), []);

  const bloqueantes = (d.excepciones || []).filter((e) => e.bloquea);
  const forzable = bloqueantes.length > 0 && bloqueantes.every((e) => !NO_FORZABLES.includes(e.codigo));
  const editable = ["revision", "lista", "error"].includes(d.estado);

  // Guarda el % del municipio en la tabla (Config. envíos) y vuelve a procesar.
  async function guardarPorcentaje() {
    const pct = leerPorcentaje(String(pctNuevo).includes("%") ? pctNuevo : `${pctNuevo}%`);
    if (!(pct > 0 && pct <= 100)) return setMensaje("Error: escribe un porcentaje entre 0 y 100 (ej. 5 o 7,5).");
    setTrabajando(true);
    try {
      const cfg = await cargarConfig();
      const m = buscarPorCodigo(d.destino_dane) || { nombre: d.ciudad, departamento: "" };
      await guardarConfig({
        ...cfg,
        pct_flete_municipios: { ...cfg.pct_flete_municipios, [d.destino_dane]: { pct, municipio: m.nombre, departamento: m.departamento } },
      });
    } catch (e) {
      setTrabajando(false);
      return setMensaje("Error: " + e.message);
    }
    await reprocesar(false);
  }

  async function guardarCajas() {
    const llenas = cajas.filter((c) => Object.values(c).some((v) => String(v).trim() !== ""));
    if (!llenas.length || cajasValidas(llenas).length !== llenas.length)
      return setMensaje("Error: cada caja necesita largo, ancho, alto y peso mayores que cero.");
    setCajas(llenas);
    await reprocesar(false, llenas);
  }

  async function reprocesar(forzar, cajasNuevas = cajas) {
    if (forzar && !confirm(`Se generará la guía aunque:\n\n${bloqueantes.map((e) => "• " + e.mensaje).join("\n")}\n\n¿Continuar?`)) return;
    setTrabajando(true);
    setMensaje(null);
    try {
      const [catalogo, cfg] = await Promise.all([cargarCatalogo(), cargarConfig()]);
      const correcciones = {};
      if (corr.direccion && corr.direccion !== cli.direccion) correcciones.direccion = corr.direccion;
      if (corr.celular && corr.celular !== (cli.celular || cli.telefono)) correcciones.celular = corr.celular;
      if (corr.destino_dane && corr.destino_dane !== d.destino_dane) correcciones.destino_dane = corr.destino_dane;
      if (corr0.destino_dane && !correcciones.destino_dane) correcciones.destino_dane = corr0.destino_dane;
      const cajasOk = cajasValidas(cajasNuevas).map((c) => ({
        largo_cm: Number(c.largo_cm), ancho_cm: Number(c.ancho_cm), alto_cm: Number(c.alto_cm), peso_kg: Number(c.peso_kg),
      }));
      if (cajasOk.length) correcciones.cajas_manuales = cajasOk;
      const r = await procesarFactura(f, { catalogo, cfg, ambiente: d.ambiente, usuarioId: perfil?.id, archivo: d.archivo_nombre, despachoId: d.id, correcciones, forzar });
      setMensaje(r.estado === "generada" ? `Guía generada: ${r.numero_remesa}` : `Estado: ${ESTADOS[r.estado]?.label}`);
      await onCambio();
    } catch (e) {
      setMensaje("Error: " + e.message);
    }
    setTrabajando(false);
  }

  async function anular() {
    if (!confirm(`¿Anular la remesa ${d.numero_remesa} en TCC?`)) return;
    setTrabajando(true);
    try {
      await anularDespacho(d);
      if (d.guia_id) setMensaje("Remesa anulada en TCC. Recuerda marcar la guía como anulada en Guías.");
      await onCambio();
    } catch (e) {
      setMensaje("Error: " + e.message);
    }
    setTrabajando(false);
  }

  async function reimprimir() {
    setTrabajando(true);
    try {
      const r = await reimprimirRotulos(d, await cargarConfig());
      window.open(r.rotulos, "_blank", "noopener");
    } catch (e) {
      setMensaje("Error: " + e.message);
    }
    setTrabajando(false);
  }

  const etiqueta = { fontSize: "10px", color: "var(--gray)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "6px" };
  const seccion = { ...card, padding: "12px", fontSize: "12px" };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "12px" }}>
      <div style={seccion}>
        <div style={etiqueta}>Destinatario</div>
        <div style={{ color: "var(--wht)" }}>{cli.nombre_comercial || cli.nombre}</div>
        <div style={{ color: "var(--wht3)" }}>{cli.nombre} · {cli.nit}{cli.dv ? "-" + cli.dv : ""}</div>
        <div style={{ color: "var(--wht3)" }}>{cli.ciudad} · {cli.correo}</div>
        <div style={{ color: "var(--gray)", marginTop: "6px" }}>
          Factura {d.factura} · {f.fecha} · {f.condicion_pago} · Subtotal {pesos(f.totales?.subtotal)}
        </div>
        {editable && (
          <div style={{ marginTop: "10px", display: "grid", gap: "6px" }}>
            <label style={etiqueta}>Dirección de entrega
              <input value={corr.direccion} onChange={(e) => setCorr({ ...corr, direccion: e.target.value })} style={{ width: "100%", marginTop: "4px" }} />
            </label>
            <label style={etiqueta}>Celular
              <input value={corr.celular} onChange={(e) => setCorr({ ...corr, celular: e.target.value.replace(/\D/g, "") })} style={{ width: "100%", marginTop: "4px" }} />
            </label>
            <label style={etiqueta}>Municipio destino (DANE)
              <select value={corr.destino_dane} onChange={(e) => setCorr({ ...corr, destino_dane: e.target.value })} style={{ width: "100%", marginTop: "4px" }}>
                <option value="">— Automático según la factura —</option>
                {municipios.map((m) => (
                  <option key={m.codigo} value={m.codigo}>{m.nombre} — {m.departamento}</option>
                ))}
              </select>
            </label>
          </div>
        )}
      </div>

      <div style={seccion}>
        <div style={etiqueta}>Revisión</div>
        {!(d.excepciones || []).length && <div style={{ color: "var(--m)" }}>Sin novedades.</div>}
        {(d.excepciones || []).map((e, i) => (
          <div key={i} style={{ color: e.bloquea ? "var(--danger)" : "var(--warn)", marginBottom: "5px" }}>
            {e.bloquea ? "⛔" : "⚠️"} {e.mensaje}
          </div>
        ))}
        {d.error && <div style={{ color: "var(--danger)", marginTop: "6px" }}>Error: {d.error}</div>}
        {editable && pidePorcentaje && (
          <div style={{ display: "flex", gap: "6px", alignItems: "flex-end", marginTop: "10px", flexWrap: "wrap" }}>
            <label style={{ ...etiqueta, marginBottom: 0 }}>
              % máximo de flete para {d.ciudad}
              <input value={pctNuevo} onChange={(e) => setPctNuevo(e.target.value)} placeholder="ej. 5" inputMode="decimal" style={{ width: "120px", marginTop: "4px", display: "block" }} />
            </label>
            <Btn variant="primary" onClick={guardarPorcentaje} disabled={trabajando || !pctNuevo}>Guardar porcentaje y volver a procesar</Btn>
          </div>
        )}

        <div style={{ ...etiqueta, marginTop: "12px" }}>Cotizaciones</div>
        {(d.cotizaciones || []).map((q, i) => (
          <div key={i} style={{ color: q.ok ? "var(--wht2)" : "var(--gray)", marginBottom: "3px" }}>
            {q.transportadora === "tcc" ? "TCC" : "Estelar"}: {q.ok ? `${pesos(q.total)} · ${q.dias} días · ${q.servicio}` : q.error}
          </div>
        ))}

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "14px" }}>
          {editable && <Btn onClick={() => reprocesar(false)} disabled={trabajando}>Guardar y volver a procesar</Btn>}
          {editable && (d.estado === "lista" || forzable) && (
            <Btn variant="primary" onClick={() => reprocesar(true)} disabled={trabajando}>
              {d.estado === "lista" ? "Generar guía" : "Generar de todas formas"}
            </Btn>
          )}
          {d.estado === "generada" && <Btn onClick={reimprimir} disabled={trabajando}>Reimprimir rótulos</Btn>}
          {d.estado === "generada" && d.url_relacion && (
            <Btn onClick={() => window.open(d.url_relacion, "_blank", "noopener")}>Relación de envío</Btn>
          )}
          {d.estado === "generada" && <Btn variant="danger" onClick={anular} disabled={trabajando}>Anular remesa</Btn>}
        </div>
        {mensaje && <div style={{ marginTop: "8px", color: mensaje.startsWith("Error") ? "var(--danger)" : "var(--m)" }}>{mensaje}</div>}
      </div>

      {sueltas.length > 0 && (
        <div style={{ ...seccion, gridColumn: "1 / -1", borderColor: d.empaque?.sueltasPendientes ? "var(--warn)" : "var(--blk4)" }}>
          <div style={etiqueta}>Unidades sueltas (no completan su empaque master)</div>
          {sueltas.map((l, i) => (
            <div key={i} style={{ color: "var(--wht3)", fontSize: "12px" }}>
              {l.cantidad} × {l.referencia} {l.descripcion} <span style={{ color: "var(--gray)" }}>(el master trae {l.unidades_por_empaque})</span>
            </div>
          ))}
          <div style={{ color: "var(--gray)", fontSize: "11px", marginTop: "4px" }}>
            Peso de estas unidades según el catálogo: {d.empaque?.totales?.peso_sueltas_catalogo_kg ?? 0} kg (solo como referencia, sin la caja).
          </div>
          {editable && (
            <>
              <div style={{ ...etiqueta, marginTop: "12px" }}>Cajas armadas para estas unidades</div>
              {cajas.map((c, i) => (
                <div key={i} style={{ display: "flex", gap: "6px", alignItems: "center", marginBottom: "6px", flexWrap: "wrap" }}>
                  <span style={{ color: "var(--gray)", fontSize: "11px", width: "48px" }}>Caja {i + 1}</span>
                  {[["largo_cm", "Largo cm"], ["ancho_cm", "Ancho cm"], ["alto_cm", "Alto cm"], ["peso_kg", "Peso kg"]].map(([k, ph]) => (
                    <input key={k} value={c[k]} placeholder={ph} inputMode="decimal" onChange={(e) => cambiarCaja(i, k, e.target.value)} style={{ width: "90px" }} />
                  ))}
                  {cajas.length > 1 && (
                    <button onClick={() => setCajas(cajas.filter((_, j) => j !== i))} title="Quitar caja"
                      style={{ background: "none", border: "none", color: "var(--gray)", cursor: "pointer" }}>✕</button>
                  )}
                </div>
              ))}
              <div style={{ display: "flex", gap: "8px", marginTop: "8px", flexWrap: "wrap" }}>
                <Btn onClick={() => setCajas([...cajas, { ...CAJA_VACIA }])} disabled={trabajando}>+ Agregar caja</Btn>
                <Btn variant="primary" onClick={guardarCajas} disabled={trabajando}>Guardar cajas y volver a procesar</Btn>
              </div>
            </>
          )}
        </div>
      )}

      <div style={{ ...seccion, gridColumn: "1 / -1" }}>
        <div style={etiqueta}>
          Bultos · {d.empaque?.totales?.bultos ?? 0} · real {d.empaque?.totales?.peso_real_kg ?? 0} kg · volumen {d.empaque?.totales?.peso_volumen_kg ?? 0} kg
        </div>
        <Table>
          <thead>
            <tr><Th>#</Th><Th>Tipo</Th><Th>Medidas (cm)</Th><Th>Peso real</Th><Th>Peso vol.</Th><Th>Contenido</Th></tr>
          </thead>
          <tbody>
            {(d.empaque?.bultos || []).map((b, i) => (
              <tr key={i}>
                <Td>{i + 1}</Td>
                <Td>{b.tipo === "completo" ? "Empaque master" : b.tipo === "manual" ? "Caja armada" : b.tipo}</Td>
                <Td style={{ fontFamily: "var(--font-mono)" }}>{b.largo_cm}×{b.ancho_cm}×{b.alto_cm}</Td>
                <Td>{b.peso_kg} kg</Td>
                <Td>{b.peso_volumen_kg} kg</Td>
                <Td style={{ fontSize: "11px", color: "var(--wht3)" }}>{b.contenido.map((c) => `${c.cantidad} × ${c.referencia} ${c.descripcion}`).join(" · ")}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </div>
  );
}
