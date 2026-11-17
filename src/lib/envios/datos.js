// Acceso a Supabase para el módulo de generación de guías.
import { supabase } from "../supabase";
import { mezclarConfig } from "./config.js";
import { normalizar } from "./municipios.js";

// Traduce el error de Supabase cuando aún no se crearon las tablas nuevas.
export function explicarError(e) {
  const m = String(e?.message || e || "");
  if (/relation .* does not exist|Could not find the table|schema cache|42P01/i.test(m) || e?.code === "42P01" || e?.code === "PGRST205")
    return "Faltan las tablas nuevas en Supabase. Ejecuta el archivo supabase/migrations/20261113_generacion_guias.sql en el SQL Editor y recarga la página.";
  return m;
}

export async function cargarConfig() {
  const { data, error } = await supabase.from("config_envios").select("datos").eq("id", 1).maybeSingle();
  if (error) throw new Error(explicarError(error));
  return mezclarConfig(data?.datos);
}

export async function guardarConfig(datos) {
  const { error } = await supabase.from("config_envios").upsert({ id: 1, datos });
  if (error) throw error;
}

export async function cargarCatalogo() {
  const filas = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase.from("productos").select("*").order("referencia").range(desde, desde + 999);
    if (error) throw new Error(explicarError(error));
    filas.push(...data);
    if (data.length < 1000) break;
  }
  return filas;
}

export async function guardarProductos(filas) {
  for (let i = 0; i < filas.length; i += 500) {
    const { error } = await supabase.from("productos").upsert(filas.slice(i, i + 500), { onConflict: "referencia" });
    if (error) throw error;
  }
}

export async function remesaVigente(factura, ambiente) {
  const { data } = await supabase
    .from("despachos")
    .select("numero_remesa")
    .eq("factura", factura)
    .eq("ambiente", ambiente)
    .eq("estado", "generada")
    .limit(1);
  return data?.[0]?.numero_remesa || null;
}

// Busca el cliente por NIT (con o sin dígito de verificación) y el
// departamento de su sede en esa ciudad, para resolver ciudades repetidas.
export async function pistaCliente(nit, dv, ciudad) {
  if (!nit) return {};
  const variantes = [nit, dv ? `${nit}${dv}` : null, dv ? `${nit}-${dv}` : null].filter(Boolean);
  const { data } = await supabase
    .from("clientes")
    .select("id, nombre, sedes(ciudad, departamento, principal)")
    .in("nit", variantes)
    .limit(1);
  const c = data?.[0];
  if (!c) return {};
  const sedes = c.sedes || [];
  const sede =
    sedes.find((s) => normalizar(s.ciudad) && normalizar(ciudad).startsWith(normalizar(s.ciudad))) ||
    sedes.find((s) => s.principal) ||
    sedes[0];
  return { cliente_id: c.id, departamento: sede?.departamento || null };
}

export async function guardarDespacho(fila) {
  const q = fila.id
    ? supabase.from("despachos").update(fila).eq("id", fila.id).select().single()
    : supabase.from("despachos").insert(fila).select().single();
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function listarDespachos({ estado, texto, limite = 200 } = {}) {
  let q = supabase
    .from("despachos")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limite);
  if (estado) q = q.eq("estado", estado);
  if (texto) q = q.or(`factura.ilike.%${texto}%,cliente_nombre.ilike.%${texto}%,numero_remesa.ilike.%${texto}%`);
  const { data, error } = await q;
  if (error) throw new Error(explicarError(error));
  return data || [];
}

// Registra la remesa en la tabla `guias` para que aparezca en el dashboard
// y entre al rastreo. Solo en producción.
export async function registrarGuia({ despacho, factura, clienteId }) {
  const { data, error } = await supabase
    .from("guias")
    .insert({
      numero_guia: despacho.numero_remesa,
      transportadora: despacho.transportadora,
      factura_indurruedas: factura.codigo,
      estado: "en_transito",
      estado_transportadora: "REMESA DIGITADA",
      cliente_id: clienteId || null,
      destinatario: factura.cliente.nombre_comercial || factura.cliente.nombre,
      direccion_entrega: factura.cliente.direccion,
      ciudad_destino: despacho.ciudad,
      peso_kg: despacho.peso_cobrable_kg,
      fecha_guia: new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date()),
      activa: true,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}
