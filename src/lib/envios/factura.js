// Lector de facturas electrónicas de Indurruedas (representación gráfica PDF).
//
// `parsearFactura` recibe los fragmentos de texto del PDF con su posición
// ({ x, y, str }, como los entrega pdfjs) y devuelve la factura estructurada.
// No depende del navegador, así se puede probar con Node.

const TOL_Y = 3; // tolerancia vertical (los valores de una fila quedan ±1-2 pt)

function dinero(str) {
  if (!str) return null;
  const limpio = String(str).replace(/[^\d]/g, "");
  return limpio ? parseInt(limpio, 10) : null;
}

function limpiarEspacios(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function fechaISO(ddmmyyyy) {
  const m = String(ddmmyyyy || "").match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
}

// Asigna cada valor a la etiqueta de su columna: la etiqueta más baja
// que esté a la altura del valor o por encima. Así un nombre que ocupa dos
// renglones queda completo con su etiqueta.
function camposPorEtiqueta(items, etiquetas, xMin, xMax) {
  const labels = items
    .filter((it) => etiquetas.includes(it.str.trim()))
    .map((it) => ({ nombre: it.str.trim(), y: it.y, x: it.x }))
    .sort((a, b) => a.y - b.y);
  if (!labels.length) return {};
  const yTope = Math.max(...labels.map((l) => l.y)) + TOL_Y;
  const yFondo = Math.min(...labels.map((l) => l.y)) - 14;
  const res = {};
  const valores = items
    .filter((it) => it.x >= xMin && it.x < xMax && it.y <= yTope && it.y > yFondo)
    .filter((it) => !etiquetas.includes(it.str.trim()))
    .sort((a, b) => b.y - a.y || a.x - b.x);
  for (const v of valores) {
    const label = labels.find((l) => l.y >= v.y - TOL_Y);
    if (!label) continue;
    (res[label.nombre] ||= []).push(v.str.trim());
  }
  for (const k of Object.keys(res)) res[k] = limpiarEspacios(res[k].join(" "));
  return res;
}

function valorALaDerecha(items, etiqueta, xMinValor = 0, xMaxValor = Infinity) {
  const label = items.find((it) => it.str.trim() === etiqueta);
  if (!label) return null;
  const v = items
    .filter((it) => Math.abs(it.y - label.y) <= TOL_Y && it.x > label.x && it.x >= xMinValor && it.x < xMaxValor && it.str.trim() !== etiqueta)
    .sort((a, b) => a.x - b.x);
  return v.length ? limpiarEspacios(v.map((i) => i.str).join(" ")) : null;
}

// Columnas de la tabla de productos (coordenada x en puntos PDF).
const COL = {
  ref: [40, 90],
  cant: [88, 122],
  unid: [122, 152],
  desc: [152, 380],
  pctDesc: [380, 416],
  iva: [416, 452],
  vunit: [452, 520],
  vtotal: [520, 620],
};
const enCol = (it, [a, b]) => it.x >= a && it.x < b;

function leerItems(items) {
  const encabezado = items.find((it) => it.str.trim() === "Referencia");
  const finTabla = items.find((it) => /^Condición pago:?$|^Valor Bruto$/.test(it.str.trim()));
  if (!encabezado) return [];
  const yIni = encabezado.y - 2;
  const yFin = finTabla ? finTabla.y : -Infinity;
  const enTabla = items.filter((it) => it.y < yIni && it.y > yFin);

  const anclas = enTabla
    .filter((it) => enCol(it, COL.ref) && /^\d{4,8}$/.test(it.str.trim()))
    .sort((a, b) => b.y - a.y);

  return anclas.map((a, i) => {
    // La fila va desde esta referencia hasta la siguiente; el valor total
    // suele quedar 1 pt más abajo que la referencia.
    const ySig = anclas[i + 1] ? anclas[i + 1].y : yFin;
    const fila = enTabla.filter((it) => it.y <= a.y + TOL_Y && it.y > ySig + TOL_Y);
    const col = (c) => limpiarEspacios(fila.filter((it) => enCol(it, c)).sort((p, q) => p.x - q.x).map((it) => it.str).join(" "));
    return {
      referencia: a.str.trim(),
      cantidad: parseFloat(col(COL.cant).replace(",", ".")) || 0,
      unidad: col(COL.unid) || "UND",
      descripcion: col(COL.desc),
      descuento_pct: parseFloat(col(COL.pctDesc).replace(",", ".")) || 0,
      iva_pct: parseFloat(col(COL.iva)) || 0,
      valor_unitario: dinero(col(COL.vunit)),
      valor_total: dinero(col(COL.vtotal)),
    };
  });
}

export function parsearFactura(todos) {
  const paginas = [...new Set(todos.map((it) => it.p || 1))].sort((a, b) => a - b);
  const deLaPagina = (n) => todos.filter((it) => (it.p || 1) === n);
  const items = deLaPagina(paginas[0]);
  const ultima = deLaPagina(paginas[paginas.length - 1]);
  const izq = camposPorEtiqueta(items, ["Cliente:", "Nombre Cial:", "Dirección:", "Ciudad:", "Correo:"], 80, 255);
  const der = camposPorEtiqueta(items, ["NIT:", "Teléfono:", "Sede:", "Vendedor:", "Celular:"], 300, 445);

  const [nit, dv] = (der["NIT:"] || "").split(" ");
  const btas = items.find((it) => it.str.trim() === "BTAS");
  const numero = btas
    ? items.find((it) => Math.abs(it.y - btas.y) <= TOL_Y && it.x > btas.x && /^\d+$/.test(it.str.trim()))
    : null;

  const factura = {
    numero: numero ? numero.str.trim() : null,
    prefijo_dian: btas ? "BTAS" : null,
    fecha: fechaISO(valorALaDerecha(items, "Fecha Factura:")),
    orden_compra: valorALaDerecha(items, "O.C:"),
    condicion_pago: valorALaDerecha(ultima, "Condición pago:", 0, 440),
    medio_pago: valorALaDerecha(ultima, "Medio pago:", 0, 440),
    cliente: {
      nombre: izq["Cliente:"] || null,
      nombre_comercial: izq["Nombre Cial:"] || null,
      nit: nit || null,
      dv: dv || null,
      direccion: izq["Dirección:"] || null,
      ciudad: izq["Ciudad:"] || null,
      correo: izq["Correo:"] || null,
      telefono: (der["Teléfono:"] || "").replace(/\D/g, "") || null,
      celular: (der["Celular:"] || "").replace(/\D/g, "") || null,
    },
    vendedor: der["Vendedor:"] || null,
    sede_venta: der["Sede:"] || null,
    items: paginas.flatMap((n) => leerItems(deLaPagina(n))),
    totales: {
      bruto: dinero(valorALaDerecha(ultima, "Valor Bruto")),
      subtotal: dinero(valorALaDerecha(ultima, "Valor Subtotal:")),
      total: dinero(valorALaDerecha(ultima, "Total a pagar:")),
    },
  };

  const suma = factura.items.reduce((s, it) => s + (it.valor_total || 0), 0);
  factura.validacion = {
    suma_items: suma,
    cuadra: factura.totales.subtotal != null && suma === factura.totales.subtotal,
  };
  // Código interno con el que la app ya registra las facturas (planillas).
  factura.codigo = factura.numero ? `FBG-${factura.numero}` : null;
  return factura;
}

// Extrae los fragmentos de texto de un PDF con pdfjs (navegador o Node).
export async function extraerItemsPDF(pdfjsLib, data) {
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const items = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    for (const it of content.items) {
      if (!it.str || !it.str.trim()) continue;
      items.push({ p, x: Math.round(it.transform[4]), y: Math.round(it.transform[5]), str: it.str });
    }
  }
  return { items, paginas: pdf.numPages };
}
