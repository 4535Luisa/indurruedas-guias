import { useEffect, useRef, useState } from "react";
import { PageHeader, Btn } from "../components/UI";
import { cargarConfig, guardarConfig } from "../lib/envios/datos";
import { CONFIG_DEFECTO } from "../lib/envios/config";
import { leerExcelPorcentajes, descargarPorcentajes } from "../lib/envios/porcentajes";

const GRUPOS = [
  {
    titulo: "Remitente (sale en la guía)",
    campos: [
      ["remitente_razon_social", "Razón social"],
      ["remitente_nit", "NIT (sin dígito de verificación)"],
      ["remitente_direccion", "Dirección de despacho"],
      ["remitente_ciudad_dane", "Ciudad origen (código DANE 8 dígitos)"],
      ["remitente_telefono", "Teléfono"],
      ["remitente_email", "Correo"],
      ["remitente_contacto", "Contacto"],
    ],
  },
  {
    titulo: "TCC",
    campos: [
      ["tcc_unidad_negocio", "Unidad de negocio", [["1", "Paquetería"], ["2", "Mensajería"]]],
      ["factor_volumetrico_tcc", "Factor peso volumen (kg/m³) — confirmar con TCC", "num"],
      ["valor_declarado", "Valor declarado de la mercancía", [["subtotal", "Subtotal de la factura (sin IVA)"], ["total", "Total a pagar"]]],
    ],
  },
  {
    titulo: "Elección de transportadora",
    campos: [
      ["criterio", "Criterio", [["mas_barata", "Siempre la más barata"], ["mas_barata_max_dias", "La más barata que entregue dentro del máximo de días"]]],
      ["max_dias_entrega", "Máximo de días de entrega", "num"],
    ],
  },
  {
    titulo: "Cuándo pedir revisión humana",
    campos: [
      ["max_kg_bulto", "Peso máximo por bulto (kg)", "num"],
      ["max_kg_despacho", "Peso máximo del despacho (kg cobrables)", "num"],
      ["max_bultos_despacho", "Máximo de bultos por despacho", "num"],
      ["generacion_automatica", "Generar guías automáticamente si no hay novedades", [["true", "Sí"], ["false", "No, siempre confirmar"]]],
    ],
  },
];

export default function ConfigEnvios() {
  const [cfg, setCfg] = useState(null);
  const [msg, setMsg] = useState(null);

  const [errorCarga, setErrorCarga] = useState(null);
  const [resPct, setResPct] = useState(null);
  const [verTabla, setVerTabla] = useState(false);
  const inputPct = useRef(null);
  useEffect(() => { cargarConfig().then(setCfg).catch((e) => setErrorCarga(e.message)); }, []);
  if (errorCarga) return <div style={{ color: "var(--danger)", fontSize: "12px" }}>{errorCarga}</div>;
  if (!cfg) return <div style={{ color: "var(--m)", fontSize: "12px" }}>Cargando...</div>;

  function cambiar(k, v, tipo) {
    let val = v;
    if (tipo === "num") val = v === "" ? "" : Number(v);
    if (k === "generacion_automatica") val = v === "true";
    setCfg({ ...cfg, [k]: val });
  }

  async function guardar() {
    setMsg(null);
    try {
      await guardarConfig(cfg);
      setMsg({ ok: true, t: "Configuración guardada." });
    } catch (e) {
      setMsg({ ok: false, t: e.message });
    }
  }

  async function subirPorcentajes(file) {
    if (!file) return;
    setResPct(null);
    try {
      const { tabla, errores, avisos } = leerExcelPorcentajes(new Uint8Array(await file.arrayBuffer()));
      if (!Object.keys(tabla).length) throw new Error("El Excel no trae municipios válidos.");
      const nuevo = { ...cfg, pct_flete_municipios: tabla };
      await guardarConfig(nuevo);
      setCfg(nuevo);
      setResPct({ ok: true, guardados: Object.keys(tabla).length, errores, avisos });
    } catch (e) {
      setResPct({ ok: false, t: e.message });
    }
  }

  const tablaPct = Object.entries(cfg.pct_flete_municipios || {}).sort((a, b) => a[1].municipio.localeCompare(b[1].municipio));
  const caja = { background: "var(--blk2)", border: "1px solid var(--blk4)", borderRadius: "10px", padding: "14px" };

  return (
    <div>
      <PageHeader title="Configuración de envíos" subtitle="Datos del remitente, cálculo de bultos y reglas para la generación automática">
        <Btn onClick={() => setCfg({ ...CONFIG_DEFECTO, pct_flete_municipios: cfg.pct_flete_municipios })}>Valores por defecto</Btn>
        <Btn variant="primary" onClick={guardar}>Guardar</Btn>
      </PageHeader>
      {msg && <div style={{ color: msg.ok ? "var(--m)" : "var(--danger)", fontSize: "12px", marginBottom: "12px" }}>{msg.t}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "14px" }}>
        {GRUPOS.map((g) => (
          <div key={g.titulo} style={{ background: "var(--blk2)", border: "1px solid var(--blk4)", borderRadius: "10px", padding: "14px" }}>
            <div style={{ fontSize: "11px", color: "var(--m)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "10px" }}>{g.titulo}</div>
            {g.campos.map(([k, label, tipo]) => (
              <label key={k} style={{ display: "block", fontSize: "11px", color: "var(--gray)", marginBottom: "10px" }}>
                {label}
                {Array.isArray(tipo) ? (
                  <select value={String(cfg[k])} onChange={(e) => cambiar(k, e.target.value)} style={{ width: "100%", marginTop: "4px" }}>
                    {tipo.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                ) : (
                  <input type={tipo === "num" ? "number" : "text"} step="any" value={cfg[k] ?? ""} onChange={(e) => cambiar(k, e.target.value, tipo)} style={{ width: "100%", marginTop: "4px" }} />
                )}
              </label>
            ))}
          </div>
        ))}
      </div>

      <div style={{ ...caja, marginTop: "14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "10px" }}>
          <div style={{ fontSize: "11px", color: "var(--m)", textTransform: "uppercase", letterSpacing: ".05em", flex: 1 }}>
            Flete máximo por municipio (cualquier transportadora)
          </div>
          {tablaPct.length > 0 && <Btn onClick={() => descargarPorcentajes(cfg.pct_flete_municipios)}>Descargar Excel</Btn>}
          <Btn variant="primary" onClick={() => inputPct.current?.click()}>Subir Excel de porcentajes</Btn>
          <input ref={inputPct} type="file" accept=".xlsx,.xls" hidden onChange={(e) => { subirPorcentajes(e.target.files[0]); e.target.value = ""; }} />
        </div>
        <div style={{ fontSize: "12px", color: "var(--wht3)", lineHeight: 1.6 }}>
          Columnas: <b>MUNICIPIO</b>, <b>DEPARTAMENTO</b> y <b>PORCENTAJE</b>. Si el flete supera el porcentaje del municipio de destino, la factura queda en revisión.
          Si el municipio no está, la factura queda en revisión mostrando qué transportadoras llegan y te pide el porcentaje. Subir un Excel reemplaza la tabla completa y se guarda de inmediato.
        </div>
        <div style={{ fontSize: "12px", color: "var(--gray)", marginTop: "8px" }}>
          {tablaPct.length ? `${tablaPct.length} municipios cargados. ` : "Aún no hay tabla cargada. "}
          {tablaPct.length > 0 && <a href="#" onClick={(e) => { e.preventDefault(); setVerTabla(!verTabla); }} style={{ color: "var(--m)" }}>{verTabla ? "Ocultar" : "Ver tabla"}</a>}
        </div>

        {resPct && !resPct.ok && <div style={{ color: "var(--danger)", fontSize: "12px", marginTop: "8px" }}>{resPct.t}</div>}
        {resPct?.ok && (
          <div style={{ fontSize: "12px", marginTop: "8px" }}>
            <div style={{ color: "var(--m)" }}>Guardados {resPct.guardados} municipios.</div>
            {resPct.errores.length > 0 && (
              <div style={{ color: "var(--danger)", marginTop: "6px" }}>
                <b>No se cargaron ({resPct.errores.length}) — corrígelos en el Excel y vuelve a subirlo:</b>
                {resPct.errores.map((x) => <div key={"e" + x.fila}>Fila {x.fila} · {x.municipio}: {x.problema}</div>)}
              </div>
            )}
            {resPct.avisos.length > 0 && (
              <div style={{ color: "var(--wht3)", marginTop: "6px" }}>
                <b>Avisos ({resPct.avisos.length}):</b>
                {resPct.avisos.map((x) => <div key={"a" + x.fila}>Fila {x.fila} · {x.municipio}: {x.problema}</div>)}
              </div>
            )}
          </div>
        )}

        {verTabla && tablaPct.length > 0 && (
          <div style={{ maxHeight: "320px", overflowY: "auto", marginTop: "10px", fontSize: "12px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ color: "var(--m)", textAlign: "left" }}>
                  <th style={{ padding: "4px" }}>Municipio</th><th style={{ padding: "4px" }}>Departamento</th><th style={{ padding: "4px" }}>DANE</th><th style={{ padding: "4px", textAlign: "right" }}>Máx. flete</th>
                </tr>
              </thead>
              <tbody>
                {tablaPct.map(([codigo, t]) => (
                  <tr key={codigo} style={{ borderTop: "1px solid var(--blk4)", color: "var(--wht3)" }}>
                    <td style={{ padding: "4px" }}>{t.municipio}</td><td style={{ padding: "4px" }}>{t.departamento}</td><td style={{ padding: "4px" }}>{codigo}</td><td style={{ padding: "4px", textAlign: "right" }}>{t.pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
