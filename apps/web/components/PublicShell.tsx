import SiteNav from './SiteNav'; import SiteFooter from './SiteFooter'; export default function PublicShell({children}:{children:React.ReactNode}){return <><SiteNav/>{children}<SiteFooter/></>}
