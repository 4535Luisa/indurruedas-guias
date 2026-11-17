// Reglas de excepción: deciden cuándo una factura necesita revisión humana.
// `bloquea: true` detiene la generación automática; `false` es solo un aviso.
import { limiteFlete } from "./config.js";

export function excepcionesPreCotizacion({ factura, empaque, destino, cfg, yaGenerada }) {
  const ex = [];
  const add = (codigo, mensaje, bloquea = true) => ex.push({ codigo, mensaje, bloquea });
  const c = factura.cliente || {};

  if (yaGenerada) add("DUPLICADA", `La factura ${factura.codigo} ya tiene guía (${yaGenerada}).`);
  if (!factura.numero) add("SIN_NUMERO", "No se pudo leer el número de factura.");
  if (!factura.items.length) add("SIN_PRODUCTOS", "No se leyeron productos en la factura.");
  if (!factura.validacion.cuadra)
    add("DESCUADRE", `La suma de productos ($${fmt(factura.validacion.suma_items)}) no coincide con el subtotal ($${fmt(factura.totales.subtotal)}). Puede faltar un producto.`);

  if (!c.nombre) add("SIN_CLIENTE", "No se leyó el nombre del cliente.");
  if (!c.nit) add("SIN_NIT", "No se leyó el NIT o cédula del cliente.");
  if (!c.celular && !c.telefono) add("SIN_TELEFONO", "La factura no trae teléfono ni celular del cliente.");
  if (direccionSospechosa(c.direccion)) add("DIRECCION", `La dirección "${c.direccion || ""}" parece incompleta o mal leída.`);

  if (destino.estado === "no_encontrado" || destino.estado === "sin_dato")
    add("CIUDAD", `No se encontró la ciudad "${c.ciudad || ""}" en el listado DANE.`);
  if (destino.estado === "ambiguo")
    add("CIUDAD_AMBIGUA", `"${c.ciudad}" existe en varios departamentos: ${destino.opciones.map((o) => o.departamento).join(", ")}.`);

  for (const f of empaque.faltantes)
    add("PRODUCTO_NUEVO", `Ref. ${f.referencia} (${f.descripcion}) no está en el catálogo de medidas y pesos.`);
  for (const e of empaque.especiales) add("PRODUCTO_ESPECIAL", `Ref. ${e.referencia}: ${e.motivo}.`);

  if (empaque.sueltasPendientes)
    add(
      "EMPAQUE_MANUAL",
      `Hay unidades que no completan su empaque master: ${empaque.sueltas.map((l) => `${l.cantidad} × ${l.referencia} ${l.descripcion || ""}`.trim()).join(" · ")}. Ingresa cuántas cajas armaste para ellas, con medidas y peso.`,
    );
  const pesados = empaque.bultos.filter((b) => b.peso_kg > cfg.max_kg_bulto);
  if (pesados.length) add("BULTO_PESADO", `${pesados.length} bulto(s) superan ${cfg.max_kg_bulto} kg.`);
  if (empaque.totales.peso_cobrable_kg > cfg.max_kg_despacho)
    add("DESPACHO_GRANDE", `El despacho pesa ${empaque.totales.peso_cobrable_kg} kg cobrables (límite ${cfg.max_kg_despacho} kg). Puede convenir carga masiva.`);
  if (empaque.totales.bultos > cfg.max_bultos_despacho)
    add("MUCHOS_BULTOS", `Son ${empaque.totales.bultos} bultos (límite ${cfg.max_bultos_despacho}).`);
  if (empaque.bultos.some((b) => !b.largo_cm || !b.ancho_cm || !b.alto_cm))
    add("SIN_MEDIDAS", "Hay productos en el catálogo sin medidas de empaque.");

  if (/CONTADO/i.test(factura.condicion_pago || ""))
    add("CONTADO", "Factura de contado: confirma si el pago ya se recibió o si se debe recaudar contra entrega.", false);
  return ex;
}

export function excepcionesPostCotizacion({ cotizaciones, elegida, valorDeclarado, cfg, destino }) {
  const ex = [];
  const add = (codigo, mensaje, bloquea = true) => ex.push({ codigo, mensaje, bloquea });
  const ok = cotizaciones.filter((q) => q.ok);
  if (!ok.length) {
    add("SIN_COBERTURA", "Ninguna transportadora devolvió tarifa: " + cotizaciones.map((q) => `${q.transportadora}: ${q.error}`).join(" | "));
    return ex;
  }
  if (!elegida) {
    add("SIN_OPCION", `Ninguna opción cumple el máximo de ${cfg.max_dias_entrega} días de entrega.`);
    return ex;
  }
  const pct = valorDeclarado ? (elegida.total / valorDeclarado) * 100 : 0;
  const limite = limiteFlete(cfg, destino?.codigo);
  if (limite === null) {
    // Lo que respondieron las APIs, tal cual: quién llega y quién no.
    const nombreT = (t) => (t === "tcc" ? "TCC" : t === "estelar" ? "Estelar" : t);
    const detalle = cotizaciones
      .map((q) => (q.ok ? `${nombreT(q.transportadora)} sí llega ($${fmt(q.total)}, ${q.dias ?? "?"} días)` : `${nombreT(q.transportadora)}: ${q.error}`))
      .join(" · ");
    add(
      "SIN_PORCENTAJE",
      `${destino?.nombre || "Este municipio"} no está en la tabla de porcentajes. ${detalle}. Ingresa el porcentaje máximo de flete para este municipio.`,
    );
  } else if (pct > limite)
    add("FLETE_ALTO", `El flete ($${fmt(elegida.total)}) es el ${pct.toFixed(1)}% del valor de la factura (límite para ${destino.nombre}: ${limite}%).`);
  if (elegida.reexpedicion) add("REEXPEDICION", `Destino con reexpedición: ${elegida.dias} días estimados.`, false);
  return ex;
}

export function direccionSospechosa(dir) {
  const d = String(dir || "").trim();
  if (d.length < 6) return true;
  if (!/\d/.test(d) && d.split(" ").length < 3) return true;
  // texto superpuesto en el PDF produce palabras largas con muchas
  // consonantes seguidas ("HCELRPRRAINDCUIRPAAL"); abreviaturas como BRR o
  // CRR son cortas y no cuentan.
  const palabras = d.split(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]+/).filter((p) => p.length >= 8);
  if (palabras.some((p) => /[BCDFGHJKLMNPQRSTVWXZ]{5,}/i.test(p))) return true;
  if (/(.)\1\1\1/.test(d)) return true;
  return false;
}

function fmt(n) {
  return Number(n || 0).toLocaleString("es-CO");
}
