import { createClient } from '@supabase/supabase-js'

const MIN_PASSWORD_LENGTH = 8
const RECOVERY_PATH = '/recuperar-clave'

let accessToken = ''
let client = null

function missingConfigMessage() {
  return 'Falta la clave anon del frontend. En Supabase: Project Settings → API → copiá Project URL y la key anon public (no la service_role). Pegala en frontend/.env como VITE_SUPABASE_ANON_KEY y reiniciá npm run dev.'
}

function friendlyAuthMessage(error) {
  const text = String(error?.message || '').toLowerCase()
  if (text.includes('invalid login') || text.includes('invalid credentials')) {
    return 'Correo o clave incorrectos.'
  }
  if (text.includes('email not confirmed')) {
    return 'Tenés que confirmar el correo antes de entrar.'
  }
  if (text.includes('user already registered')) {
    return 'Ese correo ya tiene una cuenta.'
  }
  if (text.includes('password should be') || text.includes('password is known')) {
    return `La clave tiene que tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`
  }
  if (text.includes('same password')) {
    return 'La clave nueva no puede ser igual a la anterior.'
  }
  if (text.includes('provider is not enabled') || text.includes('unsupported provider')) {
    return 'Google no está prendido en Supabase. Authentication → Providers → Google.'
  }
  if (text.includes('redirect')) {
    return 'Falta autorizar la URL de esta app en Supabase (Redirect URLs).'
  }
  return error?.message || 'No se pudo completar la operación.'
}

async function getClient() {
  if (client) return client
  const url = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    throw new Error(missingConfigMessage())
  }
  client = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })
  const { data } = await client.auth.getSession()
  accessToken = data.session?.access_token || ''
  client.auth.onAuthStateChange((event, session) => {
    if (session?.access_token) {
      accessToken = session.access_token
      return
    }
    if (event === 'SIGNED_OUT') accessToken = ''
  })
  return client
}

export function getAccessToken() {
  return accessToken
}

export const authService = {
  minPasswordLength: MIN_PASSWORD_LENGTH,

  async ensureClient() {
    return getClient()
  },

  async getSession() {
    const supabase = await getClient()
    const { data, error } = await supabase.auth.getSession()
    if (error) throw new Error(friendlyAuthMessage(error))
    if (data.session?.access_token) accessToken = data.session.access_token
    return data.session
  },

  onAuthStateChange(handler) {
    return getClient().then((supabase) => supabase.auth.onAuthStateChange(handler))
  },

  async refreshSession() {
    const supabase = await getClient()
    const { data, error } = await supabase.auth.refreshSession()
    if (error) throw new Error(friendlyAuthMessage(error))
    if (data.session?.access_token) accessToken = data.session.access_token
    return data.session
  },

  async signInWithPassword(credentials) {
    const supabase = await getClient()
    const { error } = await supabase.auth.signInWithPassword({
      email: credentials.email.trim(),
      password: credentials.password,
    })
    if (error) throw new Error(friendlyAuthMessage(error))
    const session = await this.getSession()
    return session
  },

  async signOut() {
    accessToken = ''
    if (!client && (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY)) {
      return
    }
    const supabase = await getClient()
    const { error } = await supabase.auth.signOut()
    if (error) throw new Error(friendlyAuthMessage(error))
  },

  async requestPasswordReset(email) {
    const supabase = await getClient()
    const redirectTo = `${window.location.origin}${RECOVERY_PATH}`
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo })
    if (error) throw new Error(friendlyAuthMessage(error))
  },

  async updatePassword(password) {
    if (!password || password.length < MIN_PASSWORD_LENGTH) {
      throw new Error(`La clave tiene que tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`)
    }
    const supabase = await getClient()
    const { error } = await supabase.auth.updateUser({ password })
    if (error) throw new Error(friendlyAuthMessage(error))
  },

  async signInWithGoogle() {
    const supabase = await getClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/login`,
        queryParams: { prompt: 'select_account' },
      },
    })
    if (error) throw new Error(friendlyAuthMessage(error))
  },
}
