// Puente seguro entre la app y la API REST de TCC.
//
// Variables de entorno (Netlify → Site configuration → Environment variables):
//   TCC_AMBIENTE      "pruebas" (por defecto) o "produccion"
//   TCC_ACCESS_TOKEN  token de producción entregado por TCC (en pruebas se usa el genérico)
//   TCC_CUENTA        cuenta remitente de producción (en pruebas: 1485100 paquetería)
//   VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY  (ya existen para la app)
//
// Solo usuarios con rol "admin" pueden usarla.

const TOKEN_PRUEBAS = "CLITCC20240OLPBZGKAK";
const CUENTA_PRUEBAS = "1485100";

const RUTAS = {
  liquidar: "/api/clientes/tarifas/v6/consultarliquidacion",
  grabar: "/api/clientes/remesas/grabardespacho8",
  rotulos: "/api/clientes/remesas/impresionrotulosV2",
  anular: "/api/clientes/remesas/anulardespacho",
  tracking: "/api/clientes/remesas/consultarestatusremesasv3",
};

function config() {
  const produccion = (process.env.TCC_AMBIENTE || "pruebas").toLowerCase() === "produccion";
  return {
    ambiente: produccion ? "produccion" : "pruebas",
    base: produccion ? "https://somos.tcc.com.co" : "https://testsomos.tcc.com.co",
    token: produccion ? process.env.TCC_ACCESS_TOKEN : process.env.TCC_ACCESS_TOKEN_PRUEBAS || TOKEN_PRUEBAS,
    cuenta: produccion ? process.env.TCC_CUENTA : process.env.TCC_CUENTA_PRUEBAS || CUENTA_PRUEBAS,
  };
}

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function esAdmin(req) {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const anon = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  const auth = req.headers.get("authorization") || "";
  if (!url || !anon || !auth.startsWith("Bearer ") || auth.length < 20) return false;
  const u = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: auth } });
  if (!u.ok) return false;
  const user = await u.json();
  const p = await fetch(`${url}/rest/v1/usuarios?id=eq.${encodeURIComponent(user.id)}&select=rol`, {
    headers: { apikey: anon, Authorization: auth },
  });
  if (!p.ok) return false;
  const filas = await p.json();
  return filas?.[0]?.rol === "admin";
}

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "Método no permitido" });
  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Cuerpo inválido" });
  }
  const { accion, payload = {} } = body || {};
  const cfg = config();

  if (!(await esAdmin(req))) return json(401, { error: "No autorizado" });
  if (accion === "estado") return json(200, { ambiente: cfg.ambiente });
  if (!RUTAS[accion]) return json(400, { error: `Acción desconocida: ${accion}` });
  if (!cfg.token || !cfg.cuenta)
    return json(500, { error: "Faltan TCC_ACCESS_TOKEN o TCC_CUENTA para producción en Netlify" });

  // La cuenta siempre la pone el servidor.
  const p = structuredClone(payload);
  if (accion === "liquidar") p.cuenta = cfg.cuenta;
  if (accion === "grabar") p.cuentaremitente = cfg.cuenta;
  if (accion === "anular") p.cuentaremitente = cfg.cuenta;

  try {
    const r = await fetch(cfg.base + RUTAS[accion], {
      method: "POST",
      headers: { "Content-Type": "application/json", AccessToken: cfg.token },
      body: JSON.stringify(p),
      signal: AbortSignal.timeout(25000),
    });
    const texto = await r.text();
    let data;
    try {
      data = JSON.parse(texto);
    } catch {
      data = { error: `TCC respondió ${r.status}: ${texto.slice(0, 300)}` };
    }
    data._ambiente = cfg.ambiente;
    return json(r.ok ? 200 : 502, data);
  } catch (e) {
    return json(504, { error: `No hubo respuesta de TCC (${e.name === "TimeoutError" ? "tiempo agotado" : e.message})`, _ambiente: cfg.ambiente });
  }
};
