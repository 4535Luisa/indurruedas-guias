// Cálculo de bultos a partir de los productos de la factura y el catálogo.
//
// Catálogo (tabla `productos`), una fila por referencia:
//   peso_unidad_kg        peso de UNA unidad de venta (la que dice la factura:
//                         UND, PAR, KIT, C25...)
//   unidades_por_empaque  cuántas unidades de venta trae el empaque master
//   largo/ancho/alto_cm   medidas del empaque master
//   peso_empaque_kg       peso del empaque master lleno (si se deja vacío se
//                         calcula: unidades × peso unidad)
//   especial              frágil/peligroso/sobredimensionado → revisión humana
//
// Reglas:
//   1. Empaques master completos: cada uno es un bulto con sus medidas reales.
//   2. Unidades sueltas (lo que no completa un master): NO se supone ninguna
//      caja. Quedan en `sueltas` y la persona ingresa cuántas cajas armó, con
//      medidas y peso (`cajasManuales`). Mientras no lo haga, no se cotiza.

const r2 = (n) => Math.round(n * 100) / 100;

export function pesoVolumen(bulto, factorKgM3) {
  const m3 = (bulto.largo_cm * bulto.ancho_cm * bulto.alto_cm) / 1_000_000;
  return r2(m3 * factorKgM3);
}

/** Cajas válidas: las cuatro cifras mayores que cero. */
export function cajasValidas(cajas) {
  return (cajas || []).filter((c) => ["largo_cm", "ancho_cm", "alto_cm", "peso_kg"].every((k) => Number(c[k]) > 0));
}

export function calcularBultos(items, catalogo, cfg, cajasManuales = null) {
  const porRef = new Map(catalogo.map((p) => [String(p.referencia).trim(), p]));
  const bultos = [];
  const faltantes = [];
  const especiales = [];
  const sueltas = [];

  for (const it of items) {
    const p = porRef.get(String(it.referencia).trim());
    if (!p) {
      faltantes.push(it);
      continue;
    }
    if (p.especial) especiales.push({ ...it, motivo: p.nota_especial || "Producto marcado como especial" });

    const upe = Math.max(1, parseInt(p.unidades_por_empaque) || 1);
    const pesoU = Number(p.peso_unidad_kg) || 0;
    const pesoCaja = Number(p.peso_empaque_kg) || r2(upe * pesoU);
    const dims = { largo_cm: Number(p.largo_cm) || 0, ancho_cm: Number(p.ancho_cm) || 0, alto_cm: Number(p.alto_cm) || 0 };
    const cant = Number(it.cantidad) || 0;
    const completos = Math.floor(cant / upe);
    const resto = r2(cant - completos * upe);
    const valorU = it.cantidad ? (it.valor_total || 0) / it.cantidad : 0;

    for (let i = 0; i < completos; i++) {
      bultos.push({
        tipo: "completo",
        tipo_empaque: p.tipo_empaque || "CAJA",
        ...dims,
        peso_kg: pesoCaja,
        valor: Math.round(valorU * upe),
        contenido: [{ referencia: it.referencia, descripcion: it.descripcion, cantidad: upe }],
      });
    }
    if (resto > 0)
      sueltas.push({
        referencia: it.referencia,
        descripcion: it.descripcion,
        cantidad: resto,
        unidades_por_empaque: upe,
        peso_kg: r2(resto * pesoU), // según el catálogo, solo como referencia
        valor: Math.round(valorU * resto),
      });
  }

  // Cajas que la persona armó para las sueltas.
  const manuales = sueltas.length ? cajasValidas(cajasManuales) : [];
  const valorSueltas = sueltas.reduce((s, l) => s + l.valor, 0);
  manuales.forEach((c, i) => {
    bultos.push({
      tipo: "manual",
      tipo_empaque: "CAJA",
      largo_cm: Number(c.largo_cm),
      ancho_cm: Number(c.ancho_cm),
      alto_cm: Number(c.alto_cm),
      peso_kg: Number(c.peso_kg),
      // el valor de las sueltas se reparte entre las cajas; el ajuste va en la primera
      valor: Math.floor(valorSueltas / manuales.length) + (i === 0 ? valorSueltas % manuales.length : 0),
      contenido: i === 0 ? sueltas.map((l) => ({ referencia: l.referencia, descripcion: l.descripcion, cantidad: l.cantidad })) : [],
    });
  });

  for (const b of bultos) b.peso_volumen_kg = pesoVolumen(b, cfg.factor_volumetrico_tcc);
  const totales = {
    bultos: bultos.length,
    peso_real_kg: r2(bultos.reduce((s, b) => s + b.peso_kg, 0)),
    peso_volumen_kg: r2(bultos.reduce((s, b) => s + b.peso_volumen_kg, 0)),
    peso_sueltas_catalogo_kg: r2(sueltas.reduce((s, l) => s + l.peso_kg, 0)),
  };
  totales.peso_cobrable_kg = r2(bultos.reduce((s, b) => s + Math.max(b.peso_kg, b.peso_volumen_kg), 0));
  const sueltasPendientes = sueltas.length > 0 && manuales.length === 0;
  return { bultos, faltantes, especiales, sueltas, sueltasPendientes, totales };
}
