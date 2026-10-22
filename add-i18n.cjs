const fs = require('fs');
let s = fs.readFileSync('src/i18n/useI18n.jsx', 'utf8');
const add = [
  "  sleepTimerHint: 'La música se detendrá automáticamente',",
  "  sleepFreeNote: 'Temporizador disponible para todos. Funciones avanzadas exclusivas de Pro.',",
  "  cancel: 'Cancelar',",
  "  account: 'Cuenta',",
  "  devices: 'Dispositivos',",
  "  login: 'Iniciar sesión',",
  "  logout: 'Cerrar sesión',",
  "  createAccount: 'Crear cuenta',",
  "  loginHint: 'Inicia sesión para sincronizar tu biblioteca entre dispositivos.',",
  "  loggedIn: 'Sesión iniciada',",
  "  loggedOut: 'Sesión cerrada',",
  "  syncNow: 'Sincronizar ahora',",
  "  syncDone: 'Sincronización completada',",
  "  lastSync: 'Última sincronización',",
  "  syncHint: 'Sincroniza me gusta, playlists e historial',",
  "  linkedDevicesHint: 'Dispositivos donde has iniciado sesión con esta cuenta',",
  "  loginToLinkDevices: 'Inicia sesión para ver y gestionar dispositivos vinculados',",
  "  thisDevice: 'Este dispositivo',",
  "  active: 'Activo',",
  "  lastActive: 'Última actividad',",
  "  signOutDevice: 'Cerrar sesión en este dispositivo',",
  "  linkDevice: 'Vincular otro dispositivo',",
  "  deviceRemoved: 'Dispositivo desconectado',",
  "  deviceLinked: 'Dispositivo vinculado (simulado)',",
  "  logoutConfirm: '¿Cerrar sesión en todos los dispositivos?',",
  "  logoutAllDevices: 'Cierra sesión en todos los dispositivos vinculados',",
  "  email: 'Correo electrónico',",
  "  freePlan: 'Gratis',",
  "  proPlans: 'Planes Premium',",
  "  included: 'Incluido',",
  "  familyMembers: 'Miembros de la familia',",
  "  noMembersYet: 'Sin miembros aún',",
  "  inviteMember: 'Invitar miembro',",
  "  inviteComing: 'Invitaciones próximamente',",
  "  upgradeToPro: 'Mejorar a Pro',"
].join('\n') + '\n';
if (!s.includes('sleepTimerHint')) {
  s = s.replace('const dict = {\n', 'const dict = {\n' + add);
}
fs.writeFileSync('src/i18n/useI18n.jsx', s);
console.log('done');
