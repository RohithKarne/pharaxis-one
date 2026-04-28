import createModuleApp from '../../shared/utils/createModuleApp'
import SuperadminPage from './pages/SuperadminPage'

export default createModuleApp({
  MainPage: SuperadminPage,
  appName: 'Superadmin',
  appTagline: 'Module Access Control',
  moduleKey: 'superadmin_console',
  storageKeyPrefix: 'mims_superadmin',
  fallbackPrefixes: [],
  allowUsername: true,
})
