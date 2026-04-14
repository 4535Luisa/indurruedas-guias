/**
 * BOT ESTELAR EXPRESS (GELOTRA)
 * Ejecutado por GitHub Actions 3 veces al día
 * Requiere: Node.js 18+, playwright, @supabase/supabase-js
 *
 * Variables de entorno necesarias (GitHub Secrets):
 *   GELOTRA_URL, GELOTRA_USER, GELOTRA_PASS
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY
 */

import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

const MAPEO_ESTADOS = {
  'en tránsito':       'en_transito',
  'en transito':       'en_transito',
  'entregado':         'entregado',
  'entregada':         'entregado',
  'pendiente':         'pendiente',
  'en bodega':         'pendiente',
  'novedad':           'novedad',
  'con novedad':       'novedad',
  'devuelto':          'novedad',
  'devolución':        'novedad',
}

function normalizarEstado(rawEstado) {
  if (!rawEstado) return 'en_transito'
  const lower = rawEstado.toLowerCase().trim()
  for (const [key, val] of Object.entries(MAPEO_ESTADOS)) {
    if (lower.includes(key)) return val
  }
  return 'en_transito'
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

async function main() {
  console.log('🤖 Bot Estelar Express iniciando —', new Date().toISOString())

  let browser
  let guiasNuevas = 0
  let guiasActualizadas = 0
  let errores = 0
  const detalles = []

  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    })

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 }
    })

    const page = await context.newPage()

    // ── 1. LOGIN ────────────────────────────────────────────────────
    console.log('📋 Iniciando sesión en Gelotra...')
    await page.goto(process.env.GELOTRA_URL, { waitUntil: 'networkidle', timeout: 30000 })
    await sleep(1500)

    // Llenar credenciales (ajustar selectores según la página real de Gelotra)
    await page.fill('input[name="usuario"], input[type="text"]', process.env.GELOTRA_USER)
    await page.fill('input[name="password"], input[type="password"]', process.env.GELOTRA_PASS)
    await page.click('button[type="submit"], input[type="submit"]')
    await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 20000 })
    console.log('✅ Sesión iniciada')

    // ── 2. OBTENER GUÍAS ACTIVAS DE SUPABASE ────────────────────────
    const { data: guiasActivas, error: dbError } = await supabase
      .from('guias')
      .select('id, numero_guia, estado')
      .eq('transportadora', 'estelar')
      .eq('activa', true)

    if (dbError) throw new Error('Error consultando Supabase: ' + dbError.message)
    console.log(`📦 ${guiasActivas.length} guías activas de Estelar a verificar`)

    // ── 3. BUSCAR GUÍAS NUEVAS EN GELOTRA ───────────────────────────
    // Navegar a la sección de remesas/guías generadas
    try {
      await page.click('a[href*="remesa"], a[href*="guia"], a:has-text("Remesas"), a:has-text("Guías")')
      await page.waitForLoadState('networkidle')
      await sleep(1000)
    } catch {
      console.log('⚠️  No se encontró enlace de remesas, continuando con rastreo individual')
    }

    // ── 4. RASTREAR CADA GUÍA ACTIVA ────────────────────────────────
    for (const guia of guiasActivas) {
      try {
        console.log(`🔍 Rastreando guía ${guia.numero_guia}...`)

        // Navegar al rastreo de la guía
        const urlRastreo = `${process.env.GELOTRA_URL}/rastreo?guia=${guia.numero_guia}`
        await page.goto(urlRastreo, { waitUntil: 'networkidle', timeout: 15000 })
        await sleep(800)

        // Extraer estado actual (ajustar selector según HTML real de Gelotra)
        let estadoRaw = null
        try {
          estadoRaw = await page.textContent(
            '.estado-guia, .status, [class*="estado"], [class*="status"], .tracking-status',
            { timeout: 5000 }
          )
        } catch {
          // Intentar buscar en tabla de rastreo
          try {
            const rows = await page.$$('table tr, .timeline-item, .tracking-item')
            if (rows.length > 0) {
              estadoRaw = await rows[rows.length - 1].textContent()
            }
          } catch {
            console.log(`  ⚠️  No se pudo leer estado de ${guia.numero_guia}`)
            errores++
            continue
          }
        }

        const nuevoEstado = normalizarEstado(estadoRaw)

        // Actualizar solo si cambió
        if (nuevoEstado !== guia.estado) {
          const { error } = await supabase
            .from('guias')
            .update({
              estado: nuevoEstado,
              activa: nuevoEstado !== 'entregado',
              updated_at: new Date().toISOString()
            })
            .eq('id', guia.id)

          if (!error) {
            guiasActualizadas++
            detalles.push({ guia: guia.numero_guia, de: guia.estado, a: nuevoEstado })
            console.log(`  ✅ ${guia.numero_guia}: ${guia.estado} → ${nuevoEstado}`)
          } else {
            errores++
            console.log(`  ❌ Error actualizando ${guia.numero_guia}:`, error.message)
          }
        } else {
          console.log(`  — ${guia.numero_guia}: sin cambios (${guia.estado})`)
        }

        await sleep(500) // pausa para no saturar el servidor
      } catch (err) {
        errores++
        console.log(`  ❌ Error procesando ${guia.numero_guia}:`, err.message)
      }
    }

    // ── 5. BUSCAR GUÍAS NUEVAS ───────────────────────────────────────
    // Obtener números de guías ya registradas
    const { data: registradas } = await supabase
      .from('guias')
      .select('numero_guia')
      .eq('transportadora', 'estelar')
    const registradasSet = new Set((registradas || []).map(g => g.numero_guia))

    try {
      // Navegar a listado de guías generadas hoy / últimos 7 días
      await page.goto(`${process.env.GELOTRA_URL}/remesas`, { waitUntil: 'networkidle', timeout: 15000 })
      await sleep(1000)

      // Extraer tabla de guías
      const filas = await page.$$('table tbody tr, .remesa-row, .guia-row')

      for (const fila of filas) {
        try {
          const celdas = await fila.$$('td')
          if (celdas.length < 3) continue

          const numeroGuia = (await celdas[0].textContent()).trim()
          if (!numeroGuia || registradasSet.has(numeroGuia)) continue

          const fechaRaw = celdas[1] ? (await celdas[1].textContent()).trim() : null
          const destinatario = celdas[2] ? (await celdas[2].textContent()).trim() : null
          const ciudad = celdas[3] ? (await celdas[3].textContent()).trim() : null
          const estadoRaw = celdas[4] ? (await celdas[4].textContent()).trim() : null
          const factura = celdas[5] ? (await celdas[5].textContent()).trim() : null

          // Buscar cliente en Supabase por nombre destinatario
          let clienteId = null
          if (destinatario) {
            const palabras = destinatario.split(' ').slice(0, 2).join(' ')
            const { data: match } = await supabase
              .from('clientes')
              .select('id')
              .ilike('nombre', `%${palabras}%`)
              .limit(1)
            if (match?.[0]) clienteId = match[0].id
          }

          const { error } = await supabase.from('guias').insert({
            numero_guia: numeroGuia,
            transportadora: 'estelar',
            factura_indurruedas: factura || null,
            cliente_id: clienteId,
            destinatario,
            ciudad_destino: ciudad,
            estado: normalizarEstado(estadoRaw),
            fecha_guia: fechaRaw ? parsearFecha(fechaRaw) : new Date().toISOString().split('T')[0],
            activa: true
          })

          if (!error) {
            guiasNuevas++
            console.log(`  🆕 Nueva guía registrada: ${numeroGuia}`)
          }
        } catch (err) {
          errores++
        }
      }
    } catch (err) {
      console.log('⚠️  No se pudo obtener listado de nuevas guías:', err.message)
    }

  } catch (err) {
    console.error('❌ Error crítico del bot:', err.message)
    errores++
  } finally {
    if (browser) await browser.close()
  }

  // ── 6. REGISTRAR EN SYNC_LOG ─────────────────────────────────────
  await supabase.from('sync_log').insert({
    transportadora: 'estelar',
    guias_nuevas: guiasNuevas,
    guias_actualizadas: guiasActualizadas,
    errores,
    detalle: { cambios: detalles, timestamp: new Date().toISOString() }
  })

  console.log('\n📊 RESUMEN:')
  console.log(`   Guías nuevas:       ${guiasNuevas}`)
  console.log(`   Guías actualizadas: ${guiasActualizadas}`)
  console.log(`   Errores:            ${errores}`)
  console.log('✅ Bot finalizado —', new Date().toISOString())
}

function parsearFecha(str) {
  if (!str) return null
  // Soporta dd/mm/yyyy y yyyy-mm-dd
  if (str.includes('/')) {
    const [d, m, y] = str.split('/')
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`
  }
  return str.split('T')[0]
}

main().catch(err => {
  console.error('Error fatal:', err)
  process.exit(1)
})
