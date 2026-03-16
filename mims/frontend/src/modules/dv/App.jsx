import createModuleApp from '../../shared/utils/createModuleApp'
import DVPage from './pages/DVPage'

export default createModuleApp({
  MainPage: DVPage,
  appName: 'Data Visualization',
  appTagline: 'MIMS Analytics & Reports',
  moduleKey: 'data_visualization',
  storageKeyPrefix: 'mims_dv',
  fallbackPrefixes: ['mims'],
})
