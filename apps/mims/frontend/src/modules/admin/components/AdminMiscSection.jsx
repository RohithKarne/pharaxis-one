import AdminProductsPanel from './AdminProductsPanel'
import AdminEmailAccountsPanel from './AdminEmailAccountsPanel'
import AdminContactMasterPanel from './AdminContactMasterPanel'
import AdminCaseNumberingPanel from './AdminCaseNumberingPanel'

export default function AdminMiscSection({ contentSection, H, flash }) {
  switch (contentSection) {
    case 'products':
      return <AdminProductsPanel H={H} flash={flash} />
    case 'email-accounts':
      return <AdminEmailAccountsPanel H={H} flash={flash} />
    case 'contact-master':
      return <AdminContactMasterPanel H={H} flash={flash} />
    case 'case-numbering':
      return <AdminCaseNumberingPanel H={H} flash={flash} />
    default:
      return null
  }
}
