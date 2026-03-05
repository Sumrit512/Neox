import { Web3Provider } from './Web3Provider'
import AuthGuard from './components/AuthGuard'
import './globals.css'

export const metadata = {
  title: 'NeoX | Web 3.0 Platform',
  description: 'Production-ready, secured, and optimized Web 3.0 platform on BSC.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Web3Provider>
          <AuthGuard>
            {children}
          </AuthGuard>
        </Web3Provider>
      </body>
    </html>
  )
}
