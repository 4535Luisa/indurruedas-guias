// Valores por defecto de la configuración de envíos. Lo que se guarde en la
// tabla `config_envios` (pantalla Configuración de envíos) los reemplaza.
export const CONFIG_DEFECTO = {
  // Remitente (Indurruedas, sucursal Bogotá)
  remitente_razon_social: "INDUSTRIA DE RUEDAS S.A.S.",
  remitente_nit: "890207956",
  remitente_direccion: "CALLE 23 N 116 - 31 PARQUE INDUSTRIAL PUERTO CENTRAL BODEGA 8",
  remitente_ciudad_dane: "11001000",
  remitente_telefono: "3174246014",
  remitente_email: "scliente2@indurruedas.com",
  remitente_contacto: "DESPACHOS",

  // TCC
  tcc_unidad_negocio: "1", // 1 Paquetería, 2 Mensajería
  // Factor de peso volumen (kg por m³). CONFIRMAR con TCC el de su contrato.
  factor_volumetrico_tcc: 400,
  valor_declarado: "subtotal", // 'subtotal' | 'total'

  // Unidades sueltas (lo que no completa un empaque master): no hay caja
  // estándar; en cada factura se piden cuántas cajas, medidas y peso.

  // Elección de transportadora
  criterio: "mas_barata", // 'mas_barata' | 'mas_barata_max_dias'
  max_dias_entrega: 5,

  // Cuándo se pide revisión humana
  max_kg_bulto: 60,
  max_kg_despacho: 500,
  max_bultos_despacho: 30,
  // Flete máximo por municipio de destino (Excel "PORCENTAJE DE ENVIOS").
  // No hay límite general: si el destino no está, se pide el porcentaje.
  // { "<código DANE>": { pct, municipio, departamento } }
  pct_flete_municipios: {},

  // Si es true, las facturas sin excepciones generan la guía solas.
  generacion_automatica: true,
};

export function mezclarConfig(fila) {
  const cfg = { ...CONFIG_DEFECTO };
  for (const [k, v] of Object.entries(fila || {})) if (v !== null && v !== undefined && v !== "" && k in cfg) cfg[k] = v;
  return cfg;
}

/** Límite de flete (%) del municipio de destino, o null si no está en la tabla. */
export function limiteFlete(cfg, codigoDane) {
  const t = codigoDane && cfg.pct_flete_municipios?.[codigoDane];
  return t && Number(t.pct) > 0 ? Number(t.pct) : null;
}
