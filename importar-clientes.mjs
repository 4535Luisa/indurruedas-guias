/**
 * IMPORTADOR DE CLIENTES
 * Carga el Excel CLIENTES_INDURRUEDAS_2026.xls a Supabase
 *
 * Uso:
 *   1. Copiar este archivo a la raíz del proyecto
 *   2. Crear archivo .env con SUPABASE_URL y SUPABASE_SERVICE_KEY
 *   3. node importar-clientes.mjs
 *
 * Requiere: npm install xlsx @supabase/supabase-js dotenv
 */

import { readFileSync } from 'fs'
import XLSX from 'xlsx'
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

async function main() {
  console.log('📂 Leyendo Excel de clientes...')

  const wb = XLSX.readFile('./CLIENTES_INDURRUEDAS_2026__1_.xls')
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })

  console.log(`📊 ${rows.length} registros encontrados`)

  // Obtener o crear asesores en tabla usuarios
  const asesorMap = {}
  const asesoresUnicos = [...new Set(rows.map(r => String(r['asesor'] || '').trim()).filter(Boolean))]

  console.log(`👥 ${asesoresUnicos.length} asesores únicos`)

  for (const nombre of asesoresUnicos) {
    // Determinar si es un nombre de persona (asesor) o categoría especial
    const esPersona = nombre.includes(' ') && !nombre.includes('S.A.S') && !nombre.includes('VENTA') && !nombre.includes('PUNTO')

    const email = esPersona
      ? nombre.toLowerCase().replace(/\s+/g, '.').replace(/[áéíóú]/g, c => ({á:'a',é:'e',í:'i',ó:'o',ú:'u'}[c])) + '@indurruedas.com'
      : 'admin+' + nombre.toLowerCase().replace(/\s+/g, '_').substring(0, 20) + '@indurruedas.com'

    // Verificar si ya existe
    const { data: existe } = await supabase.from('usuarios').select('id').eq('email', email).single()

    if (existe) {
      asesorMap[nombre] = existe.id
    } else {
      const { data: nuevo } = await supabase.from('usuarios').insert({
        email,
        nombre,
        rol: esPersona ? 'asesor' : 'admin',
        activo: true
      }).select('id').single()

      if (nuevo) asesorMap[nombre] = nuevo.id
    }
  }

  console.log('✅ Asesores procesados')

  // Agrupar por NIT para detectar sedes múltiples
  const clientesPorNit = {}
  for (const row of rows) {
    const nit = String(row['nit'] || '').trim()
    const nombre = String(row['nombre_cliente'] || '').trim()
    const establecimiento = String(row['Nombre establecimiento'] || '').trim()
    const ciudad = String(row['Ciudad'] || '').trim()
    const depto = String(row['Depto/Estado'] || '').trim()
    const asesorNombre = String(row['asesor'] || '').trim()

    if (!nit || !nombre) continue

    if (!clientesPorNit[nit]) {
      clientesPorNit[nit] = { nit, nombre, asesorNombre, sedes: [] }
    }

    clientesPorNit[nit].sedes.push({ establecimiento, ciudad, depto })
  }

  const clientes = Object.values(clientesPorNit)
  console.log(`🏢 ${clientes.length} clientes únicos a importar`)

  let importados = 0
  let errores = 0

  // Importar en lotes de 50
  const LOTE = 50
  for (let i = 0; i < clientes.length; i += LOTE) {
    const lote = clientes.slice(i, i + LOTE)

    for (const c of lote) {
      try {
        const asesorId = asesorMap[c.asesorNombre] || null

        // Verificar si ya existe el cliente
        const { data: existe } = await supabase.from('clientes').select('id').eq('nit', c.nit).single()

        let clienteId
        if (existe) {
          clienteId = existe.id
          // Actualizar asesor si cambió
          await supabase.from('clientes').update({ asesor_id: asesorId }).eq('id', clienteId)
        } else {
          const { data: nuevo, error } = await supabase.from('clientes').insert({
            nit: c.nit,
            nombre: c.nombre,
            asesor_id: asesorId
          }).select('id').single()

          if (error) { errores++; continue }
          clienteId = nuevo.id
        }

        // Insertar sedes (deduplicadas por ciudad+direccion)
        const sedesUnicas = []
        const sedesVistas = new Set()
        for (const s of c.sedes) {
          const key = `${s.ciudad}|${s.establecimiento}`
          if (!sedesVistas.has(key)) {
            sedesVistas.add(key)
            sedesUnicas.push(s)
          }
        }

        for (let idx = 0; idx < sedesUnicas.length; idx++) {
          const s = sedesUnicas[idx]
          await supabase.from('sedes').upsert({
            cliente_id: clienteId,
            nombre_establecimiento: s.establecimiento || c.nombre,
            ciudad: s.ciudad,
            departamento: s.depto,
            principal: idx === 0
          }, { onConflict: 'cliente_id,ciudad,nombre_establecimiento' })
        }

        importados++
      } catch (err) {
        errores++
      }
    }

    process.stdout.write(`\r  Progreso: ${Math.min(i + LOTE, clientes.length)}/${clientes.length} clientes`)
  }

  console.log(`\n\n✅ Importación completada`)
  console.log(`   Importados: ${importados}`)
  console.log(`   Errores:    ${errores}`)
}

main().catch(err => {
  console.error('Error fatal:', err)
  process.exit(1)
})
