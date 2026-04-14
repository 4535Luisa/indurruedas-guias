import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function Layout() {
  const { perfil, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const [ultimaSync, setUltimaSync] = useState(null)

  useEffect(() => {
    supabase.from('sync_log').select('created_at, guias_nuevas, guias_actualizadas')
      .order('created_at', { ascending: false }).limit(1)
      .then(({ data }) => { if (data?.[0]) setUltimaSync(data[0]) })
  }, [])

  const iniciales = perfil?.nombre?.split(' ').map(n => n[0]).slice(0,2).join('') || 'AD'

  function linkStyle({ isActive }) {
    return {
      display:'flex', alignItems:'center', gap:'10px', padding:'9px 10px',
      borderRadius:'7px', fontSize:'12px',
      color: isActive ? 'var(--m)' : 'var(--gray)',
      textDecoration:'none', marginBottom:'2px', transition:'all .15s',
      background: isActive ? 'var(--m-dim)' : 'transparent',
      fontWeight: isActive ? '500' : '400'
    }
  }

  return (
    <div style={{ display:'flex', minHeight:'100vh', background:'var(--blk)' }}>
      <aside style={{ width:'220px', background:'var(--blk2)', borderRight:'1px solid var(--blk4)', display:'flex', flexDirection:'column', flexShrink:0 }}>
        
        <div style={{ padding:'20px 16px 16px', borderBottom:'1px solid var(--blk4)' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'10px' }}>
            <div style={{ width:'36px', height:'36px', background:'var(--m)', borderRadius:'8px', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'14px', fontWeight:'700', color: theme === 'dark' ? '#0E0E0E' : '#FFFFFF', fontFamily:'var(--font-mono)' }}>M</div>
            <button onClick={toggleTheme} title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
              style={{ background:'transparent', border:'1px solid var(--blk5)', borderRadius:'6px', color:'var(--gray)', fontSize:'14px', padding:'4px 8px', cursor:'pointer', lineHeight:1 }}>
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
          </div>
          <div style={{ fontSize:'13px', fontWeight:'500', color:'var(--wht)', lineHeight:1.2 }}>Indurruedas SAS</div>
          <div style={{ fontSize:'10px', color:'var(--gray)', marginTop:'2px' }}>Sistema de guías</div>
        </div>

        <nav style={{ flex:1, padding:'12px 8px' }}>
          <NavLink to="/dashboard" style={linkStyle}><span>▦</span> Dashboard</NavLink>
          <NavLink to="/guias" style={linkStyle}><span>◈</span> Guías</NavLink>
          <NavLink to="/clientes" style={linkStyle}><span>◉</span> Clientes</NavLink>
        </nav>

        <div style={{ margin:'8px', padding:'10px', background:'var(--blk3)', border:'1px solid var(--blk4)', borderRadius:'8px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'6px', marginBottom:'4px' }}>
            <div style={{ width:'6px', height:'6px', borderRadius:'50%', background:'var(--m)' }}></div>
            <span style={{ fontSize:'10px', color:'var(--m)' }}>Carga manual activa</span>
          </div>
          {ultimaSync ? (
            <div style={{ fontSize:'10px', color:'var(--gray)', lineHeight:1.6 }}>
              Última carga: {new Date(ultimaSync.created_at).toLocaleString('es-CO', { dateStyle:'short', timeStyle:'short' })}<br/>
              <span style={{ color:'var(--m)' }}>+{ultimaSync.guias_nuevas} nuevas</span> · {ultimaSync.guias_actualizadas} actualizadas
            </div>
          ) : (
            <div style={{ fontSize:'10px', color:'var(--gray)' }}>Sin cargas aún</div>
          )}
        </div>

        <div style={{ padding:'12px 8px', borderTop:'1px solid var(--blk4)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'8px', padding:'8px 10px' }}>
            <div style={{ width:'28px', height:'28px', borderRadius:'50%', background:'var(--m-dim)', border:'1px solid var(--m-dim2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'10px', color:'var(--m)', fontWeight:'700', flexShrink:0 }}>{iniciales}</div>
            <span style={{ fontSize:'11px', color:'var(--wht2)', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{perfil?.nombre}</span>
            <button style={{ background:'transparent', border:'none', color:'var(--gray)', fontSize:'11px', cursor:'pointer', padding:'4px 8px', borderRadius:'4px' }}
              onClick={() => { logout(); navigate('/login') }}>Salir</button>
          </div>
        </div>
      </aside>

      <main style={{ flex:1, overflow:'auto' }}>
        <div style={{ padding:'24px' }}>
          <Outlet />
        </div>
      </main>
    </div>
  )
}
