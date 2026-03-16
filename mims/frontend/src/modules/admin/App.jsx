import createModuleApp from '../../shared/utils/createModuleApp'
import AdminConsolePage from './pages/AdminConsolePage'

export default createModuleApp({
  MainPage: AdminConsolePage,
  appName: 'Admin Console',
  appTagline: 'MIMS System Configuration',
  moduleKey: 'admin_console',
  storageKeyPrefix: 'mims_admin',
  fallbackPrefixes: ['mims'],
})
