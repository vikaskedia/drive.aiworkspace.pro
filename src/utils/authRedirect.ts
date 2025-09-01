// Utility + cookie helpers for cross-subdomain auth sharing

const APEX_DOMAIN = (import.meta as any).env?.VITE_APEX_DOMAIN || 'aiworkspace.pro'

function isLocalHost(host: string) {
  return host === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(host)
}

function isUnderApex(host: string) {
  return host === APEX_DOMAIN || host.endsWith(`.${APEX_DOMAIN}`)
}

function cookieSummary(names: string[]) {
  const all = document.cookie.split(';').map(s => s.trim())
  const filtered = all.filter(c => names.some(n => c.startsWith(n + '=')))
  return filtered
}

export function setSessionCookie(name: string, value: string, maxAgeSec = 60 * 60 * 24 * 365) {
  const host = location.hostname
  const isLocal = isLocalHost(host)
  if (isLocal) {
    document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSec}; SameSite=Lax`
    console.log('[auth][cookie][set][local]', { host, name, valuePreview: value.slice(0,20) + '...' })
    console.log('[auth][cookie][after]', cookieSummary([name]))
    return
  }
  // Force apex domain cookie
  document.cookie = `${name}=${encodeURIComponent(value)}; Domain=.${APEX_DOMAIN}; Path=/; Max-Age=${maxAgeSec}; SameSite=Lax; Secure`
  // Remove possible host-only duplicate
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`
  console.log('[auth][cookie][set][apex]', { host, apex: APEX_DOMAIN, name, valuePreview: value.slice(0,20) + '...' })
  console.log('[auth][cookie][after]', cookieSummary([name]))
}

export function getCookie(name: string): string | null {
  const pattern = new RegExp('(?:^|; )' + name.replace(/[$()*+.[\]?^{}|\\/-]/g, '\\$&') + '=([^;]*)')
  const m = document.cookie.match(pattern)
  return m ? decodeURIComponent(m[1]) : null
}

export function clearSessionCookie(name: string) {
  const host = location.hostname
  const isLocal = isLocalHost(host)
  if (isLocal) {
    document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`
    console.log('[auth][cookie][clear][local]', { host, name })
    return
  }
  document.cookie = `${name}=; Domain=.${APEX_DOMAIN}; Path=/; Max-Age=0; SameSite=Lax; Secure`
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax` // host-only cleanup
  console.log('[auth][cookie][clear][apex]', { host, apex: APEX_DOMAIN, name })
  console.log('[auth][cookie][after]', cookieSummary([name]))
}

export function ensureCrossSubdomainCookies(names: string[]) {
  const host = location.hostname
  if (isLocalHost(host)) {
    console.log('[auth][cookie][promote] skip (local host)', host)
    return
  }
  if (!isUnderApex(host)) {
    console.log('[auth][cookie][promote] skip (not under apex)', { host, apex: APEX_DOMAIN })
    return
  }
  console.log('[auth][cookie][promote] start', { host, apex: APEX_DOMAIN, names })
  names.forEach(n => {
    const v = getCookie(n)
    if (v) {
      setSessionCookie(n, v, 60 * 60 * 24 * 365) // Use 1 year expiration instead of default 7 days
    } else {
      console.log('[auth][cookie][promote] missing', n)
    }
  })
  console.log('[auth][cookie][promote] done', cookieSummary(names))
}

export function buildOAuthRedirectUrl() {
  return `${window.location.origin}/callback`
}

export function getPostLoginBase(): string {
  try {
    const params = new URLSearchParams(location.search)
    const paramKey = ['redirect','redirect_to','returnTo','next'].find(k => params.get(k))
    let candidate = paramKey ? params.get(paramKey)! : ''
    if (!candidate) {
      candidate = sessionStorage.getItem('post-login-redirect') || localStorage.getItem('post-login-redirect') || ''
    }
    if (!candidate) candidate = (import.meta as any).env?.VITE_DEFAULT_POST_LOGIN_URL || '/'
    if (candidate.startsWith('http')) {
      try {
        const u = new URL(candidate)
        if (isUnderApex(u.hostname) || isLocalHost(u.hostname)) return candidate
        return '/'
      } catch { return '/' }
    }
    if (!candidate.startsWith('/')) candidate = '/' + candidate
    return candidate
  } catch {
    return '/'
  }
}

export const ACCESS_COOKIE = 'sb-access-token'
export const REFRESH_COOKIE = 'sb-refresh-token'
export const LS_ACCESS_KEY = 'sb-access-token'
export const LS_REFRESH_KEY = 'sb-refresh-token'

export function syncCookiesToLocalStorage() {
  try {
    const at = getCookie(ACCESS_COOKIE)
    const rt = getCookie(REFRESH_COOKIE)
    if (at) localStorage.setItem(LS_ACCESS_KEY, at)
    if (rt) localStorage.setItem(LS_REFRESH_KEY, rt)
    console.log('[auth][cookie->ls] sync', {
      hasAccess: !!at,
      hasRefresh: !!rt
    })
  } catch (e) {
    console.log('[auth][cookie->ls] error', e)
  }
}

export function clearLocalStorageTokens() {
  try {
    localStorage.removeItem(LS_ACCESS_KEY)
    localStorage.removeItem(LS_REFRESH_KEY)
    console.log('[auth][cookie->ls] cleared localStorage')
  } catch (e) {
    console.log('[auth][cookie->ls] clear error', e)
  }
}
