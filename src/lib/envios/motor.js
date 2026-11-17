// Flujo completo de una factura: analizar → cotizar → elegir → generar.
// Las funciones reciben sus dependencias (llamadas a APIs) como parámetros
// para poder probarlas sin red.
import { calcularBultos } from "./empaque.js";
import { resolverMunicipio } from "./municipios.js";
import { excepcionesPreCotizacion, excepcionesPostCotizacion } from "./reglas.js";
import { payloadLiquidacion, leerLiquidacion, payloadDespacho, leerDespacho } from "./tcc.js";
import { cotizarEstelar } from "./estelar.js";

export function analizarFactura({ factura, catalogo, cfg, departamentoPista, yaGenerada, destinoManual, cajasManuales }) {
  const destino = destinoManual
    ? { estado: "ok", ...destinoManual, opciones: [destinoManual] }
    : resolverMunicipio(factura.cliente?.ciudad, departamentoPista);
  const empaque = calcularBultos(factura.items, catalogo, cfg, cajasManuales);
  const valorDeclarado = cfg.valor_declarado === "total" ? factura.totales.total : factura.totales.subtotal;
  const excepciones = excepcionesPreCotizacion({ factura, empaque, destino, cfg, yaGenerada });
  return { destino, empaque, valorDeclarado: valorDeclarado || factura.validacion.suma_items, excepciones };
}

export function elegirCotizacion(cotizaciones, cfg) {
  let ok = cotizaciones.filter((q) => q.ok);
  if (cfg.criterio === "mas_barata_max_dias") ok = ok.filter((q) => q.dias == null || q.dias <= Number(cfg.max_dias_entrega));
  return ok.sort((a, b) => a.total - b.total || (a.dias ?? 99) - (b.dias ?? 99))[0] || null;
}

export async function cotizar({ analisis, cfg, llamarTCC }) {
  const { destino, empaque, valorDeclarado } = analisis;
  const tareas = [
    (async () => {
      try {
        const body = payloadLiquidacion({ cfg, destinoDane: destino.codigo, valorDeclarado, bultos: empaque.bultos });
        return leerLiquidacion(await llamarTCC("liquidar", body));
      } catch (e) {
        return { transportadora: "tcc", ok: false, error: e.message };
      }
    })(),
    cotizarEstelar(),
  ];
  const cotizaciones = await Promise.all(tareas);
  const elegida = elegirCotizacion(cotizaciones, cfg);
  const excepciones = excepcionesPostCotizacion({ cotizaciones, elegida, valorDeclarado, cfg, destino });
  return { cotizaciones, elegida, excepciones };
}

export async function generarGuia({ factura, analisis, transportadora, cfg, llamarTCC }) {
  if (transportadora !== "tcc") return { ok: false, error: "Por ahora solo se generan guías TCC" };
  const body = payloadDespacho({
    cfg,
    factura,
    destinoDane: analisis.destino.codigo,
    bultos: analisis.empaque.bultos,
    valorDeclarado: analisis.valorDeclarado,
  });
  const resp = await llamarTCC("grabar", body);
  return { ...leerDespacho(resp), ambiente: resp?._ambiente, solicitud: body, respuesta: resp };
}

export const bloquea = (excepciones) => excepciones.some((e) => e.bloquea);
