// Armado de solicitudes a la API REST de TCC y lectura de sus respuestas.
// Las llamadas reales pasan por la función de Netlify `/.netlify/functions/tcc`,
// que guarda el token y la cuenta (nunca viajan al navegador).

const ceil = (n) => String(Math.max(1, Math.ceil(Number(n) || 0)));
const txt = (s, max) => String(s ?? "").normalize("NFC").replace(/\s+/g, " ").trim().slice(0, max);

export function tipoIdentificacion(nit) {
  // NIT de persona jurídica: 9 dígitos que empiezan por 8 o 9
  return /^[89]\d{8}$/.test(String(nit || "")) ? "NIT" : "CC";
}

export function hoyBogota() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
}

export function payloadLiquidacion({ cfg, destinoDane, valorDeclarado, bultos, fecha }) {
  return {
    tipoenvio: "1",
    idciudadorigen: cfg.remitente_ciudad_dane,
    idciudaddestino: destinoDane,
    valormercancia: String(Math.round(valorDeclarado)),
    boomerang: "0",
    tipoboomerang: "",
    identificacion: cfg.remitente_nit,
    tipoidentificacion: "NIT",
    // `cuenta` la pone el servidor
    fecharemesa: fecha || hoyBogota(),
    idunidadnegocio: String(cfg.tcc_unidad_negocio),
    recaudo: "",
    unidades: bultos.map((b) => ({
      numerounidades: "1",
      pesoreal: ceil(b.peso_kg),
      pesovolumen: ceil(b.peso_volumen_kg),
      alto: ceil(b.alto_cm),
      largo: ceil(b.largo_cm),
      ancho: ceil(b.ancho_cm),
      tipoempaque: "",
    })),
  };
}

export function leerLiquidacion(resp) {
  if (!resp || String(resp.codigoResultado) !== "0" || !resp.total)
    return { transportadora: "tcc", ok: false, error: resp?.mensajeResultado || resp?.error || "Sin respuesta de TCC" };
  const t = resp.total;
  return {
    transportadora: "tcc",
    ok: true,
    total: Number(t.totaldespacho),
    dias: parseInt(t.diasestimadosentrega) || null,
    reexpedicion: t.esreexpedicion === "SI",
    servicio: `${t.unidadnegocio} ${t.tipoenvio} ${t.tiposervicio}`.trim(),
    peso_facturado: Number(t.totalpesofacturado),
    conceptos: (resp.conceptos || []).map((c) => ({ descripcion: c.descripcion, valor: c.valor })),
    id_liquidacion: resp.idliquidacion,
  };
}

const CLASE_EMPAQUE = { CAJA: "CLEM_CAJA", SOBRE: "CLEM_SOBRE" };

export function payloadDespacho({ cfg, factura, destinoDane, bultos, valorDeclarado, fecha }) {
  const c = factura.cliente;
  const valorBultos = bultos.reduce((s, b) => s + (b.valor || 0), 0) || 1;
  // reparte el valor declarado entre bultos según lo que contiene cada uno
  let asignado = 0;
  const valores = bultos.map((b, i) => {
    if (i === bultos.length - 1) return Math.round(valorDeclarado) - asignado;
    const v = Math.round((valorDeclarado * (b.valor || 0)) / valorBultos);
    asignado += v;
    return v;
  });

  return {
    numerodespacho: null,
    fechadespacho: fecha || hoyBogota(),
    solicitudrecogida: { numero: null, fecha: null, ventanainicio: null, ventanafin: null },
    unidadnegocio: String(cfg.tcc_unidad_negocio),
    // `cuentaremitente` la pone el servidor
    sederemitente: null,
    razonsocialremitente: txt(cfg.remitente_razon_social, 100),
    contactoremitente: txt(cfg.remitente_contacto, 60) || null,
    tipoidentificacionremitente: "NIT",
    identificacionremitente: cfg.remitente_nit,
    direccionremitente: txt(cfg.remitente_direccion, 120),
    ciudadorigen: cfg.remitente_ciudad_dane,
    telefonoremitente: cfg.remitente_telefono,
    emailremitente: cfg.remitente_email,
    destinatarios: [
      {
        numerocontrol: "1",
        numeroremesa: null,
        numeroreferenciacliente: factura.codigo,
        tipoidentificaciondestinatario: tipoIdentificacion(c.nit),
        identificaciondestinatario: c.nit,
        sededestinatario: null,
        razonsocialdestinatario: txt(c.nombre_comercial || c.nombre, 100),
        contactodestinatario: txt(c.nombre, 60),
        direcciondestinatario: txt(c.direccion, 120),
        telefonodestinatario: c.celular || c.telefono,
        ciudaddestino: destinoDane,
        formapago: null,
        llevabodega: null,
        recogebodega: null,
        centrocostos: null,
        tiposervicio: null,
        observaciones: txt(`FACTURA ${factura.codigo}${factura.orden_compra ? " OC " + factura.orden_compra : ""}`, 200),
        recaudoproducto: null,
        unidades: bultos.map((b, i) => ({
          tipounidad: "TIPO_UND_PAQ",
          tipoempaque: null,
          claseempaque: CLASE_EMPAQUE[String(b.tipo_empaque || "").toUpperCase()] || "CLEM_CAJA",
          dicecontener: txt(resumenContenido(b), 60) || "HERRAMIENTAS Y FERRETERIA",
          kilosreales: ceil(b.peso_kg),
          largo: ceil(b.largo_cm),
          alto: ceil(b.alto_cm),
          ancho: ceil(b.ancho_cm),
          pesovolumen: ceil(b.peso_volumen_kg),
          valormercancia: String(valores[i]),
          codigobarras: null,
          numerobolsa: null,
          referencias: null,
          unidadesinternas: String(Math.round(b.contenido.reduce((s, x) => s + x.cantidad, 0))),
        })),
        documentosreferencia: [{ tipodocumento: "FA", numerodocumento: factura.codigo, fechadocumento: factura.fecha || "" }],
      },
    ],
  };
}

function resumenContenido(b) {
  if (b.contenido.length === 1) return b.contenido[0].descripcion;
  return `HERRAMIENTAS VARIAS (${b.contenido.length} REF)`;
}

export function leerDespacho(resp) {
  const r = resp?.remesas?.[0];
  if (!resp || String(resp.codigoresultado) !== "0" || !r || String(r.codigoresultado) !== "0")
    return { ok: false, error: r?.mensajeresultado || resp?.mensajeresultado || resp?.error || "TCC no confirmó la remesa" };
  const numeros = String(r.numeroremesa || "").trim().split(/\s+/).filter(Boolean);
  return {
    ok: true,
    numero_remesa: numeros[0],
    remesas: numeros,
    url_rotulos: (resp.urlrotulos || "").replace(/\s+/g, ""),
    url_relacion: (resp.urlrelacionenvio || "").replace(/\s+/g, ""),
    mensaje: r.mensajeresultado,
  };
}
