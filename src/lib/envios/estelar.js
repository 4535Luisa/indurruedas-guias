// Estelar Express: pendiente de su documentación de API.
// Cuando llegue, implementar aquí `cotizarEstelar` y `generarGuiaEstelar`
// con la misma forma de respuesta que tcc.js (leerLiquidacion / leerDespacho)
// y agregar las rutas en netlify/functions/estelar.mjs.

export const ESTELAR_DISPONIBLE = false;

export async function cotizarEstelar() {
  return { transportadora: "estelar", ok: false, error: "Integración pendiente (falta la API de Estelar)", pendiente: true };
}

export async function generarGuiaEstelar() {
  return { ok: false, error: "Integración con Estelar Express pendiente" };
}
