import { ESTADOS, TRANSPORTADORAS } from '../lib/supabase'

export function PillEstado({ estado }) {
  const cfg = ESTADOS[estado] || ESTADOS['en_transito']
  return (
    <span style={{
      display:'inline-block', padding:'2px 9px', borderRadius:'20px',
      fontSize:'10px', fontWeight:'500',
      color: cfg.color, background: cfg.bg, border:`1px solid ${cfg.border}`
    }}>
      {cfg.label}
    </span>
  )
}

export function PillTransportadora({ transportadora }) {
  const cfg = TRANSPORTADORAS[transportadora] || {}
  return (
    <span style={{
      display:'inline-block', padding:'2px 7px', borderRadius:'4px',
      fontSize:'10px', fontWeight:'500',
      color: cfg.color, background: cfg.bg, border:`1px solid ${cfg.border}`
    }}>
      {cfg.label}
    </span>
  )
}

export function DiasActiva({ dias }) {
  const n = parseInt(dias) || 0
  const color = n >= 10 ? '#FF4444' : n >= 6 ? '#FFAA00' : '#AAFF00'
  return <span style={{ color, fontWeight:'500', fontFamily:'var(--font-mono)', fontSize:'12px' }}>{n}</span>
}

export function KPICard({ label, value, sub, accent }) {
  return (
    <div style={{
      background:'var(--blk2)', border:'1px solid var(--blk4)',
      borderRadius:'8px', padding:'14px'
    }}>
      <div style={{ fontSize:'10px', color:'var(--gray)', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:'6px' }}>{label}</div>
      <div style={{ fontSize:'26px', fontWeight:'500', fontFamily:'var(--font-mono)', color: accent || 'var(--wht)', lineHeight:1 }}>{value}</div>
      {sub && <div style={{ fontSize:'10px', color:'var(--gray)', marginTop:'5px' }}>{sub}</div>}
    </div>
  )
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'20px', flexWrap:'wrap', gap:'12px' }}>
      <div>
        <h1 style={{ fontSize:'18px', fontWeight:'500', color:'var(--wht)', fontFamily:'var(--font-mono)' }}>{title}</h1>
        {subtitle && <p style={{ fontSize:'12px', color:'var(--gray)', marginTop:'3px' }}>{subtitle}</p>}
      </div>
      {children && <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>{children}</div>}
    </div>
  )
}

export function Btn({ children, onClick, variant='default', disabled, style={} }) {
  const variants = {
    default: { background:'transparent', border:'1px solid var(--blk5)', color:'var(--wht3)' },
    primary: { background:'var(--m)', border:'1px solid var(--m)', color:'var(--blk)', fontWeight:'500' },
    danger:  { background:'transparent', border:'1px solid #440000', color:'#FF4444' },
  }
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding:'7px 14px', borderRadius:'6px', fontSize:'12px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? .5 : 1,
        fontFamily:'var(--font-body)',
        transition:'all .15s',
        ...variants[variant], ...style
      }}
      onMouseEnter={e => { if (!disabled && variant === 'default') e.target.style.borderColor = 'var(--m)'; if (!disabled && variant === 'default') e.target.style.color = 'var(--m)' }}
      onMouseLeave={e => { if (variant === 'default') { e.target.style.borderColor = 'var(--blk5)'; e.target.style.color = 'var(--wht3)' } }}
    >
      {children}
    </button>
  )
}

export function Input({ style={}, ...props }) {
  return <input style={{ width:'100%', ...style }} {...props} />
}

export function Select({ style={}, children, ...props }) {
  return <select style={{ width:'100%', ...style }} {...props}>{children}</select>
}

export function Table({ children }) {
  return (
    <div style={{ overflowX:'auto' }}>
      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px' }}>
        {children}
      </table>
    </div>
  )
}

export function Th({ children, style={} }) {
  return (
    <th style={{
      textAlign:'left', padding:'8px 12px',
      fontSize:'10px', fontWeight:'500', color:'var(--gray)',
      borderBottom:'1px solid var(--blk4)',
      textTransform:'uppercase', letterSpacing:'.05em',
      whiteSpace:'nowrap', ...style
    }}>
      {children}
    </th>
  )
}

export function Td({ children, style={} }) {
  return (
    <td style={{
      padding:'9px 12px', borderBottom:'1px solid var(--blk3)',
      color:'var(--wht2)', verticalAlign:'middle', ...style
    }}>
      {children}
    </td>
  )
}
