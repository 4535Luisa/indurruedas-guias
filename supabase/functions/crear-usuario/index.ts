import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { email, password, nombre, rol, transportadora_id } = await req.json();

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    const { data: { user: caller } } = await supabaseAdmin.auth.getUser(token);
    const { data: perfil } = await supabaseAdmin.from("usuarios").select("rol").eq("id", caller?.id).single();
    if (perfil?.rol !== "admin") {
      return new Response(JSON.stringify({ error: "Solo administradores" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Crear con email_confirm: true — no necesita confirmar email
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nombre }
    });

    if (createError) throw createError;

    const { error: insertError } = await supabaseAdmin.from("usuarios").insert({
      id: newUser.user.id,
      email: email.toLowerCase(),
      nombre: nombre.toUpperCase(),
      rol,
      activo: true,
      ...(rol === "transportador" && transportadora_id ? { transportadora_id } : {})
    });

    if (insertError) throw insertError;

    return new Response(JSON.stringify({ ok: true, id: newUser.user.id }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});