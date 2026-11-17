// Pruebas de la lógica de generación de guías. Ejecutar: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { parsearFactura } from "../src/lib/envios/factura.js";
import { resolverMunicipio } from "../src/lib/envios/municipios.js";
import { calcularBultos, pesoVolumen } from "../src/lib/envios/empaque.js";
import { direccionSospechosa, excepcionesPreCotizacion } from "../src/lib/envios/reglas.js";
import { payloadDespacho, leerDespacho, leerLiquidacion, tipoIdentificacion } from "../src/lib/envios/tcc.js";
import { elegirCotizacion } from "../src/lib/envios/motor.js";
import { CONFIG_DEFECTO as CFG } from "../src/lib/envios/config.js";

// Fragmentos con las mismas posiciones que la factura PDF real.
const it = (x, y, str) => ({ p: 1, x, y, str });
const FACTURA_ITEMS = [
  it(24, 681, "Cliente:"), it(88, 681, "PEREZ GOMEZ ANA"), it(260, 681, "NIT:"), it(310, 681, "52123456"), it(418, 681, "7"),
  it(260, 668, "Teléfono:"), it(458, 668, "DE VENTA"), it(513, 668, "BTAS"), it(549, 668, "50001"),
  it(24, 667, "Nombre Cial:"), it(87, 668, "FERRETERIA EL MARTILLO"), it(87, 659, "DEL NORTE"),
  it(260, 655, "Sede:"), it(310, 655, "SUCURSAL BOGOTA"),
  it(24, 654, "Dirección:"), it(88, 654, "CL 10 20 30"), it(453, 654, "Fecha Factura:"), it(526, 654, "05-11-2026"),
  it(24, 642, "Ciudad:"), it(88, 642, "Neiva"),
  it(262, 631, "Celular:"), it(310, 631, "3001234567"),
  it(24, 629, "Correo:"), it(88, 629, "ana@example.com"), it(456, 625, "O.C:"), it(520, 625, "COT-1"),
  it(41, 607, "Referencia"),
  it(24, 592, "1"), it(47, 592, "100001"), it(100, 592, "30"), it(126, 592, "UND"), it(154, 592, "TORNILLO X"), it(425, 592, "19 %"), it(474, 592, "$1.000"),
  it(385, 591, "20,0 %"), it(550, 591, "$24.000"),
  it(24, 578, "2"), it(47, 578, "100002"), it(100, 578, "2"), it(129, 578, "KIT"), it(154, 578, "CARRETILLA"), it(385, 578, "20,0 %"), it(423, 578, "19 %"), it(470, 578, "$100.000"), it(546, 578, "$160.000"),
  it(24, 290, "Condición pago:"), it(140, 290, "CREDITO 30 DIAS"), it(451, 278, "Valor Bruto"), it(537, 278, "$ 230.000"),
  it(451, 254, "Valor Subtotal:"), it(533, 254, "$ 184.000"), it(451, 195, "Total a pagar:"), it(533, 195, "$ 218.960"),
];

test("lee cabecera, nombre en dos renglones, productos y totales", () => {
  const f = parsearFactura(FACTURA_ITEMS);
  assert.equal(f.codigo, "FBG-50001");
  assert.equal(f.fecha, "2026-11-05");
  assert.equal(f.cliente.nombre_comercial, "FERRETERIA EL MARTILLO DEL NORTE");
  assert.equal(f.cliente.nit, "52123456");
  assert.equal(f.cliente.dv, "7");
  assert.equal(f.cliente.ciudad, "Neiva");
  assert.equal(f.cliente.celular, "3001234567");
  assert.equal(f.items.length, 2);
  assert.deepEqual([f.items[1].referencia, f.items[1].cantidad, f.items[1].unidad, f.items[1].valor_total], ["100002", 2, "KIT", 160000]);
  assert.equal(f.totales.subtotal, 184000);
  assert.equal(f.validacion.cuadra, true);
  assert.equal(f.condicion_pago, "CREDITO 30 DIAS");
});

test("municipios: nombres con tilde, Bogotá D.C. y ambiguos", () => {
  assert.equal(resolverMunicipio("Neiva").codigo, "41001000");
  assert.equal(resolverMunicipio("Bogotá, D.C.").codigo, "11001000");
  assert.equal(resolverMunicipio("Belén De Los Andaquíes").codigo, "18094000");
  assert.equal(resolverMunicipio("Belén").estado, "ambiguo");
  assert.equal(resolverMunicipio("Belén", "Nariño").codigo, "52083000");
  assert.equal(resolverMunicipio("Ciudad Inventada").estado, "no_encontrado");
});

test("dirección: detecta texto superpuesto pero acepta abreviaturas", () => {
  assert.equal(direccionSospechosa("HCELRPRRAINDCUIRPAAL SAN LUCAS"), true);
  assert.equal(direccionSospechosa("CR 3 03 36 BRR CENTRO"), false);
  assert.equal(direccionSospechosa("CL PRINCIPAL SAN LUCAS"), false);
  assert.equal(direccionSospechosa("CR 4"), true);
});

const CATALOGO = [
  { referencia: "100001", peso_unidad_kg: 0.5, unidades_por_empaque: 12, largo_cm: 30, ancho_cm: 20, alto_cm: 20, peso_empaque_kg: 6.5, mezclable: true },
  { referencia: "100002", peso_unidad_kg: 15, unidades_por_empaque: 1, largo_cm: 120, ancho_cm: 60, alto_cm: 30, mezclable: false },
];

test("bultos: masters completos solos; las sueltas esperan las cajas que ingrese la persona", () => {
  const items = [
    { referencia: "100001", descripcion: "TORNILLO X", cantidad: 30, valor_total: 30000 },
    { referencia: "100002", descripcion: "CARRETILLA", cantidad: 2, valor_total: 200000 },
  ];
  // Sin cajas ingresadas: no se supone ninguna caja para las 6 sueltas.
  const r = calcularBultos(items, CATALOGO, CFG);
  assert.deepEqual(r.bultos.map((b) => b.tipo), ["completo", "completo", "completo", "completo"]);
  assert.equal(r.sueltasPendientes, true);
  assert.deepEqual(r.sueltas.map((l) => [l.referencia, l.cantidad]), [["100001", 6]]);
  assert.equal(r.totales.peso_sueltas_catalogo_kg, 3);
  assert.equal(r.faltantes.length, 0);

  // Con las cajas que se armaron: se usan tal cual.
  const cajas = [{ largo_cm: 30, ancho_cm: 20, alto_cm: 15, peso_kg: 3.4 }, { largo_cm: 10, ancho_cm: 10, alto_cm: 10, peso_kg: 0.5 }];
  const r2 = calcularBultos(items, CATALOGO, CFG, cajas);
  assert.equal(r2.sueltasPendientes, false);
  const manuales = r2.bultos.filter((b) => b.tipo === "manual");
  assert.deepEqual(manuales.map((b) => [b.largo_cm, b.ancho_cm, b.alto_cm, b.peso_kg]), [[30, 20, 15, 3.4], [10, 10, 10, 0.5]]);
  assert.equal(manuales.reduce((s, b) => s + b.valor, 0), 6000, "el valor de las sueltas se reparte completo");
  assert.equal(r2.totales.bultos, 6);

  // Caja incompleta no cuenta.
  assert.equal(calcularBultos(items, CATALOGO, CFG, [{ largo_cm: 30, ancho_cm: 20, alto_cm: "", peso_kg: 3 }]).sueltasPendientes, true);
});

test("excepción EMPAQUE_MANUAL bloquea y no se puede forzar", async () => {
  const { NO_FORZABLES } = await import("../src/lib/envios/procesar.js").catch(() => ({ NO_FORZABLES: null }));
  const factura = parsearFactura(FACTURA_ITEMS);
  const empaque = calcularBultos(factura.items, CATALOGO, CFG);
  const ex = excepcionesPreCotizacion({ factura, empaque, destino: resolverMunicipio("Neiva"), cfg: CFG, yaGenerada: null });
  const e = ex.find((x) => x.codigo === "EMPAQUE_MANUAL");
  assert.ok(e?.bloquea);
  assert.match(e.mensaje, /6 × 100001 TORNILLO X/);
  if (NO_FORZABLES) assert.ok(NO_FORZABLES.includes("EMPAQUE_MANUAL"));
});

test("bultos: referencia faltante se reporta", () => {
  const r = calcularBultos([{ referencia: "999999", cantidad: 1 }], CATALOGO, CFG);
  assert.equal(r.faltantes.length, 1);
  assert.equal(r.bultos.length, 0);
});

test("peso volumen con factor configurable", () => {
  assert.equal(pesoVolumen({ largo_cm: 50, ancho_cm: 40, alto_cm: 30 }, 400), 24);
});

test("elige la más barata y respeta el máximo de días", () => {
  const q = [
    { transportadora: "tcc", ok: true, total: 100000, dias: 6 },
    { transportadora: "estelar", ok: true, total: 120000, dias: 2 },
    { transportadora: "x", ok: false },
  ];
  assert.equal(elegirCotizacion(q, { ...CFG, criterio: "mas_barata" }).transportadora, "tcc");
  assert.equal(elegirCotizacion(q, { ...CFG, criterio: "mas_barata_max_dias", max_dias_entrega: 5 }).transportadora, "estelar");
});

test("payload TCC: valor declarado repartido exacto y referencia de factura", () => {
  const factura = parsearFactura(FACTURA_ITEMS);
  const { bultos } = calcularBultos(factura.items, CATALOGO, CFG);
  const p = payloadDespacho({ cfg: CFG, factura, destinoDane: "41001000", bultos, valorDeclarado: 184000 });
  const d = p.destinatarios[0];
  assert.equal(d.unidades.reduce((s, u) => s + Number(u.valormercancia), 0), 184000);
  assert.equal(d.documentosreferencia[0].numerodocumento, "FBG-50001");
  assert.equal(d.tipoidentificaciondestinatario, "CC");
  assert.equal(p.cuentaremitente, undefined, "la cuenta la pone el servidor");
});

test("tipo de identificación", () => {
  assert.equal(tipoIdentificacion("830056396"), "NIT");
  assert.equal(tipoIdentificacion("55171295"), "CC");
});

test("respuestas de TCC", () => {
  const ok = leerDespacho({ codigoresultado: "0", remesas: [{ codigoresultado: "0", numeroremesa: "446876366 446876367" }], urlrotulos: "https://x/ a" });
  assert.equal(ok.numero_remesa, "446876366");
  assert.equal(ok.url_rotulos, "https://x/a");
  assert.equal(leerDespacho({ codigoresultado: "-1", mensajeresultado: "Error" }).ok, false);
  assert.equal(leerLiquidacion({ codigoResultado: "0", total: { totaldespacho: 1000, diasestimadosentrega: "2", esreexpedicion: "NO" } }).total, 1000);
});

test("excepciones: duplicada, descuadre y producto nuevo bloquean", () => {
  const factura = parsearFactura(FACTURA_ITEMS);
  factura.validacion.cuadra = false;
  const empaque = calcularBultos([{ referencia: "999999", cantidad: 1 }], CATALOGO, CFG);
  const ex = excepcionesPreCotizacion({ factura, empaque, destino: resolverMunicipio("Neiva"), cfg: CFG, yaGenerada: "123" });
  const codigos = ex.map((e) => e.codigo);
  for (const c of ["DUPLICADA", "DESCUADRE", "PRODUCTO_NUEVO"]) assert.ok(codigos.includes(c), c);
  assert.ok(ex.every((e) => e.bloquea));
});

test("porcentaje de flete por municipio: lectura y límite", async () => {
  const { leerPorcentaje, procesarFilasPorcentajes } = await import("../src/lib/envios/porcentajes.js");
  const { limiteFlete } = await import("../src/lib/envios/config.js");
  const { excepcionesPostCotizacion } = await import("../src/lib/envios/reglas.js");
  assert.equal(leerPorcentaje(0.05), 5);
  assert.equal(leerPorcentaje("5.0%"), 5);
  assert.equal(leerPorcentaje(0.025), 2.5);
  assert.equal(leerPorcentaje(7.5), 7.5);

  const { tabla, errores, avisos } = procesarFilasPorcentajes([
    { fila: 2, municipio: "NEIVA", departamento: "HUILA", porcentaje: 0.05 },
    { fila: 3, municipio: "GIRARDOT", departamento: "TOLIMA", porcentaje: 0.05 },
    { fila: 4, municipio: "VILLANUEVA", departamento: "META", porcentaje: 0.04 },
    { fila: 5, municipio: "CALI", departamento: "VALLE DEL CAUCA", porcentaje: 0.05 },
  ]);
  assert.equal(tabla["41001000"].pct, 5);
  assert.ok(tabla["25307000"], "Girardot se asigna a Cundinamarca");
  assert.equal(avisos.length, 1);
  assert.equal(errores.length, 1); // Villanueva no existe en el Meta
  assert.ok(tabla["76001000"], "Cali por alias");

  const cfg = { ...CFG, pct_flete_municipios: tabla };
  assert.equal(limiteFlete(cfg, "41001000"), 5);
  assert.equal(limiteFlete(cfg, "11001000"), null, "sin tabla no se supone ningún límite");

  const elegida = { ok: true, transportadora: "tcc", total: 6000, dias: 2 };
  const estelar = { ok: false, transportadora: "estelar", error: "Integración pendiente (falta la API de Estelar)" };
  const cotizaciones = [elegida, estelar];
  const destino = { codigo: "41001000", nombre: "NEIVA" };
  const ex = excepcionesPostCotizacion({ cotizaciones, elegida, valorDeclarado: 100000, cfg, destino });
  assert.ok(ex.some((e) => e.codigo === "FLETE_ALTO" && e.bloquea), "6% supera el 5% de Neiva");
  const ok = excepcionesPostCotizacion({ cotizaciones, elegida, valorDeclarado: 200000, cfg, destino });
  assert.ok(!ok.length, "3% está dentro del 5%");

  // Municipio fuera de la tabla: se bloquea, dice quién llega según la API y pide el %.
  const ex2 = excepcionesPostCotizacion({ cotizaciones, elegida, valorDeclarado: 100000, cfg, destino: { codigo: "11001000", nombre: "BOGOTÁ" } });
  const sp = ex2.find((e) => e.codigo === "SIN_PORCENTAJE");
  assert.ok(sp?.bloquea);
  assert.match(sp.mensaje, /TCC sí llega/);
  assert.match(sp.mensaje, /Estelar: Integración pendiente/);
  assert.ok(!ex2.some((e) => e.codigo === "FLETE_ALTO"));

  // Si ninguna llega, no se pide porcentaje: queda SIN_COBERTURA.
  const ex3 = excepcionesPostCotizacion({ cotizaciones: [estelar], elegida: null, valorDeclarado: 100000, cfg, destino: { codigo: "11001000", nombre: "BOGOTÁ" } });
  assert.deepEqual(ex3.map((e) => e.codigo), ["SIN_COBERTURA"]);
});
