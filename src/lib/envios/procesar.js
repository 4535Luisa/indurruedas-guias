// Procesa una factura de punta a punta y deja el resultado en `despachos`.
import { analizarFactura, cotizar, generarGuia, bloquea } from "./motor.js";
import { llamarTCC } from "./api.js";
import { remesaVigente, pistaCliente, guardarDespacho, registrarGuia } from "./datos.js";
import { buscarPorCodigo } from "./municipios.js";

// Excepciones que ni forzando se pueden saltar: faltan datos para la guía.
export const NO_FORZABLES = ["DUPLICADA", "SIN_NUMERO", "SIN_PRODUCTOS", "SIN_NIT", "SIN_TELEFONO", "CIUDAD", "CIUDAD_AMBIGUA", "PRODUCTO_NUEVO", "SIN_MEDIDAS", "SIN_COBERTURA", "SIN_CLIENTE", "SIN_PORCENTAJE", "EMPAQUE_MANUAL"];

export function aplicarCorrecciones(factura, correcciones = {}) {
  const f = structuredClone(factura);
  for (const k of ["direccion", "telefono", "celular", "ciudad", "nombre_comercial"])
    if (correcciones[k]) f.cliente[k] = correcciones[k];
  return f;
}

/**
 * @param facturaOriginal  resultado de parsearFactura
 * @param ctx { catalogo, cfg, ambiente, usuarioId, archivo, despachoId, correcciones, forzar }
 */
export async function procesarFactura(facturaOriginal, ctx) {
  const { catalogo, cfg, ambiente, usuarioId, archivo, despachoId, correcciones = {}, forzar = false } = ctx;
  const factura = aplicarCorrecciones(facturaOriginal, correcciones);
  const c = factura.cliente;

  const [yaGenerada, pista] = await Promise.all([
    factura.codigo ? remesaVigente(factura.codigo, ambiente) : null,
    pistaCliente(c.nit, c.dv, c.ciudad),
  ]);
  const destinoManual = correcciones.destino_dane ? buscarPorCodigo(correcciones.destino_dane) : null;
  const analisis = analizarFactura({ factura, catalogo, cfg, departamentoPista: pista.departamento, yaGenerada, destinoManual, cajasManuales: correcciones.cajas_manuales });

  let cot = { cotizaciones: [], elegida: null, excepciones: [] };
  const puedeCotizar = analisis.destino.codigo && !analisis.excepciones.some((e) => ["PRODUCTO_NUEVO", "SIN_MEDIDAS", "SIN_PRODUCTOS", "DUPLICADA", "EMPAQUE_MANUAL"].includes(e.codigo));
  if (puedeCotizar) cot = await cotizar({ analisis, cfg, llamarTCC });

  const excepciones = [...analisis.excepciones, ...cot.excepciones];
  const bloqueantes = excepciones.filter((e) => e.bloquea);
  const forzable = bloqueantes.every((e) => !NO_FORZABLES.includes(e.codigo));
  const debeGenerar = cot.elegida && (bloqueantes.length === 0 ? cfg.generacion_automatica || forzar : forzar && forzable);

  const fila = {
    id: despachoId,
    factura: factura.codigo || `SIN-NUMERO-${Date.now()}`,
    archivo_nombre: archivo || null,
    cliente_nombre: c.nombre_comercial || c.nombre,
    cliente_nit: c.nit,
    ciudad: analisis.destino.nombre || c.ciudad,
    destino_dane: analisis.destino.codigo || null,
    ambiente,
    transportadora: cot.elegida?.transportadora || null,
    valor_flete: cot.elegida?.total ?? null,
    dias_estimados: cot.elegida?.dias ?? null,
    peso_cobrable_kg: analisis.empaque.totales.peso_cobrable_kg,
    bultos: analisis.empaque.totales.bultos,
    datos_factura: { ...facturaOriginal, correcciones, cliente_id: pista.cliente_id || null },
    empaque: analisis.empaque,
    cotizaciones: cot.cotizaciones,
    excepciones,
    estado: bloquea(excepciones) ? "revision" : "lista",
    error: null,
    created_by: usuarioId || null,
  };

  if (!debeGenerar) return guardarDespacho(fila);

  let g;
  try {
    g = await generarGuia({ factura, analisis, transportadora: cot.elegida.transportadora, cfg, llamarTCC });
  } catch (e) {
    g = { ok: false, error: e.message };
  }
  fila.solicitud = g.solicitud || null;
  fila.respuesta = g.respuesta || null;
  if (!g.ok) return guardarDespacho({ ...fila, estado: "error", error: g.error });

  Object.assign(fila, {
    estado: "generada",
    numero_remesa: g.numero_remesa,
    url_rotulos: g.url_rotulos,
    url_relacion: g.url_relacion,
    ambiente: g.ambiente || ambiente,
  });
  const guardado = await guardarDespacho(fila);
  if (guardado.ambiente === "produccion") {
    try {
      const guiaId = await registrarGuia({ despacho: guardado, factura, clienteId: pista.cliente_id });
      return guardarDespacho({ id: guardado.id, guia_id: guiaId });
    } catch (e) {
      return guardarDespacho({ id: guardado.id, error: `Guía creada en TCC pero no se registró en el dashboard: ${e.message}` });
    }
  }
  return guardado;
}

export async function anularDespacho(despacho) {
  const r = await llamarTCC("anular", { numeroremesa: despacho.numero_remesa, fechadespacho: despacho.solicitud?.fechadespacho || despacho.created_at?.slice(0, 10) });
  if (String(r.respuesta) !== "0") throw new Error(r.mensaje || r.error || "TCC no confirmó la anulación");
  return guardarDespacho({ id: despacho.id, estado: "anulada", error: null });
}

export async function reimprimirRotulos(despacho, cfg) {
  const remesas = String(despacho.respuesta?.remesas?.[0]?.numeroremesa || despacho.numero_remesa).split(/\s+/);
  const r = await llamarTCC("rotulos", { identificacion: cfg.remitente_nit, remesas });
  if (String(r.codigoresultado) !== "0") throw new Error(r.mensajeresultado || r.error || "No se obtuvieron los rótulos");
  return { rotulos: r.UrlRotulosDefinitivo || r.UrlRotulosTemporal, relacion: r.UrlRelacion };
}
