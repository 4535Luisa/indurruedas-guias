/**
 * BOT RASTREO ESTELAR EXPRESS
 * URL directa: https://estelarexpress.gelotra.com/rastrearguia?iframe=SI
 * Corre cada 3 horas L-S 7AM-5PM Colombia
 */

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
);

const URL_RASTREO = "https://estelarexpress.gelotra.com/rastrearguia?iframe=SI";

const MAPEO_ESTADOS = {
  aforada: "en_transito",
  despachada: "en_transito",
  despachado: "en_transito",
  "en muellex": "en_transito",
  muellex: "en_transito",
  "transito nacional": "en_transito",
  transito: "en_transito",
  "reparto urbano": "en_transito",
  reparto: "en_transito",
  "recibido en destino": "en_transito",
  recibido: "en_transito",
  cumplido: "entregado",
  entregada: "entregado",
  entregado: "entregado",
  novedad: "novedad",
  devuelto: "novedad",
  devolucion: "novedad",
};

function mapearEstado(texto) {
  if (!texto) return null;
  const lower = texto.toLowerCase();
  for (const [clave, estado] of Object.entries(MAPEO_ESTADOS)) {
    if (lower.includes(clave)) return estado;
  }
  return null;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function rastrearGuia(page, numeroGuia) {
  try {
    await page.goto(URL_RASTREO, { waitUntil: "networkidle", timeout: 45000 });
    await sleep(3000);

    // Buscar campo de texto con timeout generoso
    const campo = await page
      .waitForSelector(
        'input[type="text"], input[name*="guia"], input[placeholder*="guia"], input[placeholder*="guía"], input[id*="guia"]',
        { timeout: 15000 },
      )
      .catch(() => null);

    if (!campo) {
      console.log(`  ⚠️  ${numeroGuia}: no se encontró campo de búsqueda`);
      return null;
    }

    await campo.click({ timeout: 10000 });
    await campo.fill(numeroGuia);
    await sleep(500);

    // Buscar botón rastrear con timeout
    const boton = await page
      .$(
        'button[type="submit"], input[type="submit"], button:has-text("Rastrear"), button:has-text("rastrear"), button:has-text("Buscar")',
      )
      .catch(() => null);
    if (boton) {
      await boton.click({ timeout: 10000 });
    } else {
      await campo.press("Enter");
    }

    // Esperar que cargue la respuesta
    await sleep(5000);

    // Leer trazabilidad
    const contenido = await page.textContent("body").catch(() => "");
    if (!contenido) return null;

    const lineas = contenido
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 5);
    const lineasEstado = lineas.filter((l) => {
      const lower = l.toLowerCase();
      return (
        lower.includes("mercanc") ||
        lower.includes("reparto") ||
        lower.includes("cumplido") ||
        lower.includes("entregad") ||
        lower.includes("devuelto") ||
        lower.includes("novedad") ||
        lower.includes("aforad") ||
        lower.includes("despachad") ||
        lower.includes("muellex") ||
        lower.includes("recibido")
      );
    });

    if (lineasEstado.length === 0) {
      console.log(`  ⚠️  ${numeroGuia}: sin trazabilidad encontrada`);
      return null;
    }

    const ultimoEstado = lineasEstado[lineasEstado.length - 1];
    const estado = mapearEstado(ultimoEstado);
    console.log(
      `  📦 ${numeroGuia}: "${ultimoEstado.substring(0, 60)}" → ${estado || "sin mapeo"}`,
    );
    return { estado, textoOriginal: ultimoEstado };
  } catch (err) {
    console.log(`  ❌ ${numeroGuia}: ${err.message.substring(0, 80)}`);
    return null;
  }
}

async function main() {
  const inicio = new Date();
  console.log("🤖 Bot Estelar Express —", inicio.toISOString());

  // Obtener guías activas de Estelar que NO estén entregadas
  const { data: guias, error } = await supabase
    .from("guias")
    .select("id, numero_guia, estado")
    .eq("transportadora", "estelar")
    .neq("estado", "entregado")
    .neq("estado", "anulada")
    .not("fecha_guia", "is", null);

  if (error) {
    console.error("Error Supabase:", error.message);
    process.exit(1);
  }
  console.log(`📋 ${guias.length} guías activas de Estelar`);
  if (guias.length === 0) {
    console.log("✅ Nada que rastrear");
    return;
  }

  const browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
    ],
  });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  let actualizadas = 0,
    sinCambios = 0,
    errores = 0;
  const cambios = [];

  for (let i = 0; i < guias.length; i++) {
    const guia = guias[i];
    console.log(`\n[${i + 1}/${guias.length}] ${guia.numero_guia}`);

    const resultado = await rastrearGuia(page, guia.numero_guia);

    if (!resultado?.estado) {
      errores++;
      continue;
    }
    if (resultado.estado === guia.estado) {
      sinCambios++;
      continue;
    }

    // Actualizar en Supabase
    const updates = {
      estado: resultado.estado,
      activa: resultado.estado !== "entregado",
      updated_at: new Date().toISOString(),
    };

    const { error: updateError } = await supabase
      .from("guias")
      .update(updates)
      .eq("id", guia.id);

    if (!updateError) {
      await supabase.from("historial_estados").insert({
        guia_id: guia.id,
        estado_anterior: guia.estado,
        estado_nuevo: resultado.estado,
        fuente: "bot",
      });
      actualizadas++;
      cambios.push({
        guia: guia.numero_guia,
        de: guia.estado,
        a: resultado.estado,
      });
      console.log(`  ✅ ${guia.estado} → ${resultado.estado}`);
    } else {
      errores++;
      console.log(`  ❌ Error guardando: ${updateError.message}`);
    }

    // Pausa entre guías para no saturar el servidor
    await sleep(2500);
  }

  await browser.close();

  const duracion = Math.round((new Date() - inicio) / 1000);

  await supabase.from("sync_log").insert({
    transportadora: "estelar",
    guias_nuevas: 0,
    guias_actualizadas: actualizadas,
    errores,
    detalle: {
      tipo: "bot_rastreo",
      total_rastreadas: guias.length,
      sin_cambios: sinCambios,
      duracion_segundos: duracion,
      cambios,
    },
  });

  console.log("\n📊 RESUMEN:");
  console.log(`   Rastreadas:   ${guias.length}`);
  console.log(`   Actualizadas: ${actualizadas}`);
  console.log(`   Sin cambios:  ${sinCambios}`);
  console.log(`   Errores:      ${errores}`);
  console.log(`   Duración:     ${duracion}s`);
  console.log("✅ Bot finalizado —", new Date().toISOString());
}

main().catch((err) => {
  console.error("Error fatal:", err);
  process.exit(1);
});
