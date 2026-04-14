import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { PageHeader, Btn, Table, Th, Td } from '../components/UI'

const POR_PAGINA = 50

export default function Clientes() {
  const [clientes, setClientes] = useState([])
  const [asesores, setAsesores] = useState([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [pagina, setPagina] = useState(1)
  const [filtroTexto, setFiltroTexto] = useState('')
  const [filtroAsesor, setFiltroAsesor] = useState('')
  const [reasignando, setReasignando] = useState(null)
  const [nuevoAsesorId, setNuevoAsesorId] = useState('')
  const [saving, setSaving] = useState(false)
  const [busqueda, setBusqueda] = useState('')

  useEffect(() => { cargarAsesores() }, [])
  useEffect(() => { cargarClientes() }, [pagina, busqueda, filtroAsesor])

  async function cargarAsesores() {
    const { data } = await supabase.from('usuarios').select('id, nombre').eq('rol', 'asesor').eq('activo', true).order('nombre')
    setAsesores(data || [])
  }

  async function cargarClientes() {
    setLoading(true)
    const desde = (pagina - 1) * POR_PAGINA
    const hasta = desde + POR_PAGINA - 1

    let query = supabase.from('clientes')
      .select('id, nit, nombre, asesor_id, usuarios(id, nombre), sedes(id, nombre_establecimiento, ciudad, departamento, direccion)', { count: 'exact' })
      .order('nombre')
      .range(desde, hasta)

    if (busqueda) query = query.or(`nombre.ilike.%${busqueda}%,nit.ilike.%${busqueda}%`)
    if (filtroAsesor === 'sin_asignar') query = query.is('asesor_id', null)
    else if (filtroAsesor) query = query.eq('asesor_id', filtroAsesor)

    const { data, count } = await query
    setClientes(data || [])
    setTotal(count || 0)
    setLoading(false)
  }

  useEffect(() => {
    const timer = setTimeout(() => { setBusqueda(filtroTexto); setPagina(1) }, 400)
    return () => clearTimeout(timer)
  }, [filtroTexto])

  useEffect(() => { setPagina(1) }, [filtroAsesor])

  async function reasignar(clienteId) {
    if (!nuevoAsesorId) return
    setSaving(true)
    const { error } = await supabase.from('clientes').update({ asesor_id: nuevoAsesorId }).eq('id', clienteId)
    if (!error) {
      const asesor = asesores.find(a => a.id === nuevoAsesorId)
      setClientes(prev => prev.map(c => c.id === clienteId ? { ...c, asesor_id: nuevoAsesorId, usuarios: asesor } : c))
      setReasignando(null)
      setNuevoAsesorId('')
    }
    setSaving(false)
  }

  const totalPaginas = Math.ceil(total / POR_PAGINA)

  return (
    <div>
      <PageHeader title="Clientes" subtitle={`${total.toLocaleString()} clientes · página ${pagina} de ${totalPaginas}`} />

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <input value={filtroTexto} onChange={e => setFiltroTexto(e.target.value)}
          placeholder="Buscar por NIT o nombre..." style={{ flex: 1, minWidth: '200px' }} />
        <select value={filtroAsesor} onChange={e => { setFiltroAsesor(e.target.value); setPagina(1) }} style={{ minWidth: '220px' }}>
          <option value="">Todos los asesores</option>
          <option value="sin_asignar">Sin asignar</option>
          {asesores.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
        </select>
      </div>

      {loading ? (
        <div style={{ color: 'var(--m)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>Cargando clientes...</div>
      ) : (
        <>
          <div style={{ background: 'var(--blk2)', border: '1px solid var(--blk4)', borderRadius: '10px', overflow: 'hidden' }}>
            <Table>
              <thead>
                <tr>
                  <Th>NIT</Th><Th>Nombre cliente</Th><Th>Sedes</Th><Th>Ciudad principal</Th><Th>Asesor asignado</Th><Th></Th>
                </tr>
              </thead>
              <tbody>
                {clientes.map(c => (
                  <>
                    <tr key={c.id}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--blk3)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <Td style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--gray)' }}>{c.nit}</Td>
                      <Td style={{ color: 'var(--wht)', fontWeight: '500' }}>{c.nombre}</Td>
                      <Td>
                        {c.sedes?.length > 1
                          ? <span style={{ fontSize: '11px', color: 'var(--m)', fontWeight: '500', cursor: 'pointer' }}
                              onClick={() => setReasignando(reasignando === c.id ? null : c.id)}>
                              {c.sedes.length} sedes ▾
                            </span>
                          : <span style={{ fontSize: '11px', color: 'var(--gray)' }}>1 sede</span>}
                      </Td>
                      <Td style={{ color: 'var(--wht2)', fontSize: '12px' }}>{c.sedes?.[0]?.ciudad || '—'}</Td>
                      <Td>
                        {c.usuarios
                          ? <span style={{ fontSize: '12px', color: 'var(--wht2)' }}>{c.usuarios.nombre}</span>
                          : <span style={{ fontSize: '11px', color: 'var(--danger)' }}>Sin asignar</span>}
                      </Td>
                      <Td>
                        <button onClick={() => { setReasignando(reasignando === c.id ? null : c.id); setNuevoAsesorId(c.asesor_id || '') }}
                          style={{ fontSize: '10px', padding: '3px 9px', border: c.usuarios ? '1px solid var(--blk5)' : '1px solid #440000',
                            borderRadius: '4px', background: 'transparent', color: c.usuarios ? 'var(--gray)' : 'var(--danger)', cursor: 'pointer' }}>
                          {c.usuarios ? 'Reasignar' : 'Asignar'}
                        </button>
                      </Td>
                    </tr>
                    {reasignando === c.id && (
                      <tr key={c.id + '-panel'}>
                        <td colSpan={6} style={{ padding: '0 12px 12px', background: 'var(--blk3)', borderBottom: '1px solid var(--blk4)' }}>
                          <div style={{ paddingTop: '12px' }}>
                            {c.sedes?.length > 1 && (
                              <div style={{ marginBottom: '12px' }}>
                                <p style={{ fontSize: '10px', color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '8px' }}>Sedes del cliente</p>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                  {c.sedes.map(s => (
                                    <div key={s.id} style={{ background: 'var(--blk4)', border: '1px solid var(--blk5)', borderRadius: '6px', padding: '6px 10px', fontSize: '11px' }}>
                                      <div style={{ color: 'var(--wht2)', fontWeight: '500' }}>{s.nombre_establecimiento || s.ciudad}</div>
                                      <div style={{ color: 'var(--gray)', fontSize: '10px' }}>{s.ciudad}{s.direccion ? ` · ${s.direccion}` : ''}</div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <span style={{ fontSize: '11px', color: 'var(--gray)' }}>Asignar a:</span>
                              <select value={nuevoAsesorId} onChange={e => setNuevoAsesorId(e.target.value)} style={{ minWidth: '220px' }}>
                                <option value="">— Seleccionar asesor —</option>
                                {asesores.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                              </select>
                              <Btn variant="primary" onClick={() => reasignar(c.id)} disabled={saving || !nuevoAsesorId}>
                                {saving ? 'Guardando...' : 'Guardar'}
                              </Btn>
                              <Btn onClick={() => { setReasignando(null); setNuevoAsesorId('') }}>Cancelar</Btn>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </Table>
            {clientes.length === 0 && (
              <div style={{ padding: '32px', textAlign: 'center', color: 'var(--gray)', fontSize: '12px' }}>
                No se encontraron clientes
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '14px', flexWrap: 'wrap', gap: '8px' }}>
            <span style={{ fontSize: '11px', color: 'var(--gray)' }}>
              Mostrando {((pagina-1)*POR_PAGINA)+1}–{Math.min(pagina*POR_PAGINA, total)} de {total.toLocaleString()} clientes
            </span>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <Btn onClick={() => setPagina(1)} disabled={pagina === 1}>«</Btn>
              <Btn onClick={() => setPagina(p => p-1)} disabled={pagina === 1}>‹ Ant</Btn>
              {Array.from({ length: Math.min(5, totalPaginas) }, (_, i) => {
                let p
                if (totalPaginas <= 5) p = i + 1
                else if (pagina <= 3) p = i + 1
                else if (pagina >= totalPaginas - 2) p = totalPaginas - 4 + i
                else p = pagina - 2 + i
                return (
                  <button key={p} onClick={() => setPagina(p)} style={{
                    padding: '6px 10px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer',
                    background: p === pagina ? 'var(--m)' : 'transparent',
                    color: p === pagina ? 'var(--blk)' : 'var(--gray)',
                    border: p === pagina ? '1px solid var(--m)' : '1px solid var(--blk5)',
                    fontWeight: p === pagina ? '500' : '400'
                  }}>{p}</button>
                )
              })}
              <Btn onClick={() => setPagina(p => p+1)} disabled={pagina === totalPaginas}>Sig ›</Btn>
              <Btn onClick={() => setPagina(totalPaginas)} disabled={pagina === totalPaginas}>»</Btn>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
