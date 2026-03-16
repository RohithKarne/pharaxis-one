import createModuleApp from '../../shared/utils/createModuleApp'
import ContentPage from './pages/ContentPage'

export default createModuleApp({
  MainPage: ContentPage,
  appName: 'Content Management',
  appTagline: 'MIMS Content & Templates',
  moduleKey: 'content_mgmt',
  storageKeyPrefix: 'mims_content',
  fallbackPrefixes: ['mims'],
})
