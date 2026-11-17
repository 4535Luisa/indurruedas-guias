import { useEffect, useMemo, useRef, useState } from "react";
import { PageHeader, Btn, Table, Th, Td } from "../components/UI";
import { cargarCatalogo, guardarProductos, listarDespachos } from "../lib/envios/datos";
import { leerExcelCatalogo, descargarPlantilla } from "../lib/envios/catalogoExcel";

const card = { background: "var(--blk2)", border: "1px solid var(--blk4)", borderRadius: "10px" };

export default function Productos() {
  const [productos, setProductos] = useState([]);
  const [faltantes, setFaltantes] = useState([]);
  const [texto, setTexto] = useState("");
  const [cargando, setCargando] = useState(true);
  const [resultado, setResultado] = useState(null);
  const inputRef = useRef();

  useEffect(() => { recargar(); }, []);

  async function recargar() {
    setCargando(true);
    let cat, desp;
    try {
      [cat, desp] = await Promise.all([cargarCatalogo(), listarDespachos({ estado: "revision", limite: 500 })]);
    } catch (e) {
      setResultado({ error: e.message });
      setCargando(false);
      return;
    }
    setProductos(cat);
    // Referencias que aparecieron en facturas pendientes y no están en el catálogo
    const enCatalogo = new Set(cat.map((p) => p.referencia));
    const m = new Map();
    for (const d of desp)
      for (const it of d.datos_factura?.items || [])
        if (!enCatalogo.has(it.referencia)) {
          const f = m.get(it.referencia) || { referencia: it.referencia, descripcion: it.descripcion, unidad_venta: it.unidad, facturas: new Set() };
          f.facturas.add(d.factura);
          m.set(it.referencia, f);
        }
    setFaltantes([...m.values()].sort((a, b) => b.facturas.size - a.facturas.size));
    setCargando(false);
  }

  async function subir(file) {
    if (!file) return;
    setResultado({ trabajando: true });
    try {
      const { validos, errores } = leerExcelCatalogo(new Uint8Array(await file.arrayBuffer()));
      await guardarProductos(validos);
      setResultado({ guardados: validos.length, errores });
      await recargar();
    } catch (e) {
      setResultado({ error: e.message });
    }
  }

  const visibles = useMemo(() => {
    const t = texto.trim().toLowerCase();
    return productos.filter((p) => !t || p.referencia.includes(t) || (p.descripcion || "").toLowerCase().includes(t));
  }, [productos, texto]);

  return (
    <div>
      <PageHeader title="Productos — medidas y pesos" subtitle={`${productos.length} referencias en el catálogo. Con esto se calculan los bultos de cada guía.`}>
        <Btn onClick={() => descargarPlantilla([...productos, ...faltantes.map(({ facturas, ...f }) => f)])}>Descargar Excel</Btn>
        <Btn variant="primary" onClick={() => inputRef.current?.click()}>Subir Excel</Btn>
      </PageHeader>
      <input ref={inputRef} type="file" accept=".xlsx,.xls" hidden onChange={(e) => { subir(e.target.files[0]); e.target.value = ""; }} />

      <div style={{ ...card, padding: "12px 14px", fontSize: "12px", color: "var(--wht3)", marginBottom: "14px", lineHeight: 1.6 }}>
        <b style={{ color: "var(--wht)" }}>Cómo funciona:</b> descarga el Excel (trae tus productos actuales y los que faltan), llena las medidas y pesos y vuelve a subirlo.
        Las referencias que ya existen se actualizan. El <b>peso por unidad</b> es el de una unidad como sale en la factura (una UND, un PAR, un KIT, una C25).
        Las <b>medidas</b> son las de la caja o empaque master que trae <b>unidades por empaque</b> unidades.
        Lo que no complete un empaque master no se calcula: en cada factura se piden las cajas que se armaron, con medidas y peso.
      </div>

      {resultado && (
        <div style={{ ...card, padding: "12px 14px", fontSize: "12px", marginBottom: "14px" }}>
          {resultado.trabajando && <span style={{ color: "var(--m)" }}>Leyendo Excel...</span>}
          {resultado.error && <span style={{ color: "var(--danger)" }}>Error: {resultado.error}</span>}
          {resultado.guardados != null && (
            <>
              <div style={{ color: "var(--m)" }}>{resultado.guardados} referencia(s) guardadas.</div>
              {resultado.errores.length > 0 && (
                <div style={{ color: "var(--warn)", marginTop: "6px" }}>
                  {resultado.errores.length} fila(s) no se guardaron:
                  {resultado.errores.slice(0, 30).map((e) => (
                    <div key={e.fila} style={{ fontFamily: "var(--font-mono)", fontSize: "11px" }}>Fila {e.fila} · {e.referencia}: {e.problema}</div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {faltantes.length > 0 && (
        <div style={{ ...card, padding: "12px 14px", marginBottom: "14px", borderColor: "var(--warn)" }}>
          <div style={{ fontSize: "12px", color: "var(--warn)", marginBottom: "8px", fontWeight: 500 }}>
            {faltantes.length} referencia(s) de facturas pendientes no están en el catálogo
          </div>
          <div style={{ fontSize: "11px", color: "var(--wht3)", fontFamily: "var(--font-mono)", lineHeight: 1.7 }}>
            {faltantes.slice(0, 40).map((f) => (
              <div key={f.referencia}>{f.referencia} · {f.descripcion} · {f.unidad_venta} · en {f.facturas.size} factura(s)</div>
            ))}
          </div>
        </div>
      )}

      <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar referencia o descripción..." style={{ width: "100%", marginBottom: "12px" }} />

      <div style={{ ...card, overflow: "hidden" }}>
        {cargando ? (
          <div style={{ padding: "14px", color: "var(--m)", fontSize: "12px" }}>Cargando...</div>
        ) : (
          <Table>
            <thead>
              <tr><Th>Referencia</Th><Th>Descripción</Th><Th>Unidad</Th><Th>Peso unidad</Th><Th>Und/empaque</Th><Th>Empaque (cm)</Th><Th>Peso empaque</Th><Th>Especial</Th></tr>
            </thead>
            <tbody>
              {visibles.slice(0, 500).map((p) => (
                <tr key={p.referencia}>
                  <Td style={{ fontFamily: "var(--font-mono)", color: "var(--wht)" }}>{p.referencia}</Td>
                  <Td>{p.descripcion}</Td>
                  <Td>{p.unidad_venta}</Td>
                  <Td>{p.peso_unidad_kg} kg</Td>
                  <Td>{p.unidades_por_empaque}</Td>
                  <Td style={{ fontFamily: "var(--font-mono)" }}>{p.tipo_empaque} {p.largo_cm}×{p.ancho_cm}×{p.alto_cm}</Td>
                  <Td>{p.peso_empaque_kg ? `${p.peso_empaque_kg} kg` : <span style={{ color: "var(--gray)" }}>calculado</span>}</Td>
                  <Td style={{ color: p.especial ? "var(--warn)" : undefined }}>{p.especial ? "Sí" : "No"}</Td>
                </tr>
              ))}
              {!visibles.length && <tr><Td style={{ color: "var(--gray)" }}>Aún no hay productos. Sube el Excel.</Td></tr>}
            </tbody>
          </Table>
        )}
      </div>
    </div>
  );
}
