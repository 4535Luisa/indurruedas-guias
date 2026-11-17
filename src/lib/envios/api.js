import { supabase } from "../supabase";

// Llama a la función de Netlify que habla con TCC. Envía el token de sesión
// de Supabase para que la función verifique que el usuario es admin.
export async function llamarTCC(accion, payload) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  const res = await fetch("/.netlify/functions/tcc", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ accion, payload }),
  });
  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error(`La función TCC respondió ${res.status} sin datos. ¿Está corriendo "netlify dev"?`);
  }
  if (!res.ok) throw new Error(json?.error || `Error ${res.status}`);
  return json;
}
