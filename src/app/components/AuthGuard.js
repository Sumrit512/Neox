"use client"
import { useAccount, useReadContract } from 'wagmi'
import { useRouter, usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { NEOX_ABI, NEOX_ADDRESS } from '../config/contract'
import { Loader2 } from 'lucide-react'

export default function AuthGuard({ children }) {
    const { address, isConnected, isConnecting } = useAccount()
    const { push } = useRouter()
    const pathname = usePathname()
    const [mounted, setMounted] = useState(false)

    // Membership status
    const { data: userData, isLoading: isUserLoading } = useReadContract({
        address: NEOX_ADDRESS,
        abi: NEOX_ABI,
        functionName: 'users',
        args: [address],
        query: { enabled: !!address && isConnected }
    })

    const isRegistered = userData ? userData[0] : false
    const isPublicPage = pathname === '/' || pathname === '/join'

    useEffect(() => {
        setMounted(true)
    }, [])

    useEffect(() => {
        if (!mounted || isConnecting || isUserLoading) return

        // If trying to access protected page while NOT connected or NOT registered
        if (!isPublicPage) {
            if (!isConnected || !isRegistered) {
                push('/join')
            }
        }
    }, [mounted, isConnected, isRegistered, isConnecting, isUserLoading, pathname, isPublicPage, push])

    // While initializing or checking status on protected routes, show loader
    if (!mounted || ((isConnecting || isUserLoading) && !isPublicPage)) {
        return (
            <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#050A18' }}>
                <Loader2 className="animate-spin" size={48} style={{ color: '#FFD700' }} />
            </div>
        )
    }

    return children
}
