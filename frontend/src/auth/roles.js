export const ROLE_ADMIN = 'admin'
export const ROLE_CO_ADMIN = 'co_admin'

export const PERMISSION_FINANZAS_VER = 'finanzas.ver'
export const PERMISSION_CUENTA_EDITAR = 'cuenta.editar'
export const PERMISSION_USUARIOS_GESTIONAR = 'usuarios.gestionar'

export const ROLE_PERMISSIONS = {
  [ROLE_ADMIN]: [PERMISSION_FINANZAS_VER, PERMISSION_CUENTA_EDITAR, PERMISSION_USUARIOS_GESTIONAR],
  [ROLE_CO_ADMIN]: [PERMISSION_CUENTA_EDITAR],
}

export const ROLE_LABEL = {
  [ROLE_ADMIN]: 'Administrador',
  [ROLE_CO_ADMIN]: 'Co-administrador',
}

export function can(user, permission) {
  if (!user?.role || !permission) return false
  const granted = ROLE_PERMISSIONS[user.role] || []
  return granted.includes(permission)
}
