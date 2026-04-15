/**
 * BOT RASTREO ESTELAR EXPRESS
 * Entra a la pagina publica de rastreo, busca cada guia activa
 * y actualiza el estado en Supabase
 *
 * Ejecutar: node estelar-bot.js
 * GitHub Actions: 3 veces al dia automaticamente
 */

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
);

const URL_RASTREO =
  "https://estelarexpress.co/index.php/atencion-al-cliente/rastreo-de-guia";

// Mapeo de estados de trazabilidad Estelar → sistema
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

function mapearEstado(textoTrazabilidad) {
  if (!textoTrazabilidad) return null;
  const lower = textoTrazabilidad.toLowerCase();
  for (const [clave, estado] of Object.entries(MAPEO_ESTADOS)) {
    if (lower.includes(clave)) return estado;
  }
  return null;
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function rastrearGuia(page, numeroGuia) {
  try {
    // Ir a la pagina de rastreo
    await page.goto(URL_RASTREO, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await sleep(2000);

    // Buscar el campo de texto - puede estar en iframe
    let campo = null;
    let frame = page;

    // Intentar encontrar el campo en iframes
    const iframes = page.frames();
    for (const f of iframes) {
      try {
        const input = await f.$(
          'input[type="text"], input[placeholder*="guia"], input[placeholder*="guía"], input[name*="guia"], input[name*="remision"]',
        );
        if (input) {
          campo = input;
          frame = f;
          break;
        }
      } catch {}
    }

    // Si no encontro en iframe, buscar en pagina principal
    if (!campo) {
      campo = await page.$(
        'input[type="text"], input[placeholder*="guia"], input[placeholder*="guía"]',
      );
    }

    if (!campo) {
      console.log(`  ⚠️  ${numeroGuia}: no se encontro campo de busqueda`);
      return null;
    }

    // Limpiar e ingresar el numero de guia
    await campo.click({ clickCount: 3 });
    await campo.fill(numeroGuia);
    await sleep(500);

    // Buscar y hacer clic en el boton de rastrear
    let boton = null;
    try {
      boton = await frame.$(
        'button:has-text("Rastrear"), button:has-text("rastrear"), input[type="submit"], button[type="submit"]',
      );
    } catch {}

    if (boton) {
      await boton.click();
    } else {
      await campo.press("Enter");
    }

    await sleep(3000);

    // Leer la trazabilidad - buscar los items del historial
    let ultimoEstadoTexto = null;

    // Intentar en el frame donde esta el formulario
    const frames2 = page.frames();
    for (const f of frames2) {
      try {
        // Buscar elementos de trazabilidad
        const items = await f.$$(
          ".trazabilidad tr td, .tracking-item, li, .timeline-item, table tr",
        );
        if (items.length > 0) {
          // Tomar el ultimo item (estado mas reciente)
          const textos = [];
          for (const item of items) {
            const texto = await item.textContent();
            if (
              texto &&
              texto.trim().length > 5 &&
              texto.toLowerCase().includes("mercanc")
            ) {
              textos.push(texto.trim());
            }
          }
          if (textos.length > 0) {
            ultimoEstadoTexto = textos[textos.length - 1];
            break;
          }
        }
      } catch {}
    }

    // Si no encontro en items especificos, buscar texto en pagina
    if (!ultimoEstadoTexto) {
      for (const f of frames2) {
        try {
          const contenido = await f.textContent("body");
          if (contenido && contenido.toLowerCase().includes("trazabilidad")) {
            // Extraer lineas con estados conocidos
            const lineas = contenido
              .split("\n")
              .map((l) => l.trim())
              .filter((l) => l.length > 10);
            const lineasEstado = lineas.filter(
              (l) =>
                l.toLowerCase().includes("mercanc") ||
                l.toLowerCase().includes("reparto") ||
                l.toLowerCase().includes("cumplido") ||
                l.toLowerCase().includes("entregad") ||
                l.toLowerCase().includes("devuelto"),
            );
            if (lineasEstado.length > 0) {
              ultimoEstadoTexto = lineasEstado[lineasEstado.length - 1];
              break;
            }
          }
        } catch {}
      }
    }

    if (!ultimoEstadoTexto) {
      console.log(`  ⚠️  ${numeroGuia}: no se pudo leer trazabilidad`);
      return null;
    }

    const estado = mapearEstado(ultimoEstadoTexto);
    console.log(
      `  📦 ${numeroGuia}: "${ultimoEstadoTexto.substring(0, 60)}" → ${estado || "sin mapeo"}`,
    );
    return estado;
  } catch (err) {
    console.log(`  ❌ ${numeroGuia}: error - ${err.message.substring(0, 80)}`);
    return null;
  }
}

async function main() {
  const inicio = new Date();
  console.log("🤖 Bot Estelar Express iniciando —", inicio.toISOString());

  let actualizadas = 0;
  let sinCambios = 0;
  let errores = 0;
  const cambios = [];

  // Obtener guias activas de Estelar que NO esten entregadas
  const { data: guias, error } = await supabase
    .from("guias")
    .select("id, numero_guia, estado")
    .eq("transportadora", "estelar")
    .eq("activa", true)
    .neq("estado", "entregado");

  if (error) {
    console.error("Error consultando Supabase:", error.message);
    process.exit(1);
  }

  console.log(`📋 ${guias.length} guias activas de Estelar a rastrear`);

  if (guias.length === 0) {
    console.log("✅ No hay guias activas para rastrear");
    return;
  }

  // Lanzar Playwright
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

  // Procesar guias en lotes para no sobrecargar el servidor
  const LOTE = 5;
  for (let i = 0; i < guias.length; i++) {
    const guia = guias[i];
    console.log(
      `\n[${i + 1}/${guias.length}] Rastreando ${guia.numero_guia}...`,
    );

    const nuevoEstado = await rastrearGuia(page, guia.numero_guia);

    if (!nuevoEstado) {
      errores++;
      continue;
    }

    if (nuevoEstado === guia.estado) {
      sinCambios++;
      continue;
    }

    // Actualizar en Supabase
    const { error: updateError } = await supabase
      .from("guias")
      .update({
        estado: nuevoEstado,
        activa: nuevoEstado !== "entregado",
        updated_at: new Date().toISOString(),
      })
      .eq("id", guia.id);

    if (!updateError) {
      // Registrar en historial
      await supabase.from("historial_estados").insert({
        guia_id: guia.id,
        estado_anterior: guia.estado,
        estado_nuevo: nuevoEstado,
        fuente: "bot",
      });
      actualizadas++;
      cambios.push({ guia: guia.numero_guia, de: guia.estado, a: nuevoEstado });
      console.log(`  ✅ Actualizada: ${guia.estado} → ${nuevoEstado}`);
    } else {
      errores++;
      console.log(`  ❌ Error guardando:`, updateError.message);
    }

    // Pausa entre guias para no saturar el servidor
    if ((i + 1) % LOTE === 0 && i < guias.length - 1) {
      console.log(`\n⏳ Pausa de 3 segundos...`);
      await sleep(3000);
    } else {
      await sleep(1000);
    }
  }

  await browser.close();

  // Registrar en sync_log
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
  console.log(`   Total rastreadas: ${guias.length}`);
  console.log(`   Actualizadas:     ${actualizadas}`);
  console.log(`   Sin cambios:      ${sinCambios}`);
  console.log(`   Errores:          ${errores}`);
  console.log(`   Duracion:         ${duracion}s`);
  console.log("✅ Bot finalizado —", new Date().toISOString());
}

main().catch((err) => {
  console.error("Error fatal:", err);
  process.exit(1);
});
