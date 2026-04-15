import logoIcon from '@/assets/images/logo-icon.png'
import { useAuthStore } from '@/store/auth'

const AI_STYLE: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: '50%',
  flexShrink: 0,
  background: 'linear-gradient(145deg, #081a14 0%, #0d2a1e 60%, #071520 100%)',
  border: '1.5px solid rgba(82, 183, 136, 0.45)',
  boxShadow: '0 0 10px rgba(82, 183, 136, 0.18), inset 0 0 8px rgba(82, 183, 136, 0.06)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const USER_STYLE: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: '50%',
  flexShrink: 0,
  background: 'linear-gradient(145deg, #6b3f0a 0%, #c49435 60%, #d4a853 100%)',
  border: '1.5px solid rgba(212, 168, 83, 0.5)',
  boxShadow: '0 0 10px rgba(212, 168, 83, 0.2), inset 0 0 8px rgba(212, 168, 83, 0.08)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 14,
  fontWeight: 700,
  color: '#fff',
  letterSpacing: '0.02em',
}

const ERROR_STYLE: React.CSSProperties = {
  ...AI_STYLE,
  background: 'linear-gradient(145deg, #1f0808 0%, #2a0d0d 100%)',
  border: '1.5px solid rgba(239, 68, 68, 0.4)',
  boxShadow: '0 0 8px rgba(239, 68, 68, 0.15)',
}

export function AiAvatar() {
  return (
    <div style={AI_STYLE}>
      <img src={logoIcon} alt="AI" style={{ width: 21, height: 21, objectFit: 'contain' }} />
    </div>
  )
}

export function AiErrorAvatar() {
  return (
    <div style={ERROR_STYLE}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke="rgba(239,68,68,0.8)" strokeWidth="1.8" />
        <line x1="12" y1="7" x2="12" y2="13" stroke="rgba(239,68,68,0.9)" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="12" cy="16.5" r="1" fill="rgba(239,68,68,0.9)" />
      </svg>
    </div>
  )
}

export function UserAvatar() {
  const user = useAuthStore((s) => s.user)
  const initial = user?.realName?.charAt(0) ?? user?.username?.charAt(0) ?? '我'

  return (
    <div style={USER_STYLE}>
      {initial}
    </div>
  )
}
