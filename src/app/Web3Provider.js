"use client"
import { useState, useEffect } from 'react'
import { createWeb3Modal } from '@web3modal/wagmi/react'
import { defaultWagmiConfig } from '@web3modal/wagmi/react/config'
import { WagmiProvider, http } from 'wagmi'
import { bsc, bscTestnet } from 'wagmi/chains'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient()

const projectId = '0e23b709952480f8d9a5b43aa0d57d95'

const metadata = {
    name: 'NeoX',
    description: 'NeoX Web 3.0 Platform',
    url: 'http://localhost:3000', // Matches dev environment origin
    icons: ['https://avatars.githubusercontent.com/u/37784886']
}

const chains = [bsc, bscTestnet]
const config = defaultWagmiConfig({
    chains,
    projectId,
    metadata,
    ssr: true,
    transports: {
        [bsc.id]: http(),
        [bscTestnet.id]: http('https://bsc-testnet.publicnode.com') // Using a reliable public node
    }
})

if (typeof window !== 'undefined') {
    createWeb3Modal({
        wagmiConfig: config,
        projectId,
        enableAnalytics: true
    })
}

export function Web3Provider({ children }) {
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    return (
        <WagmiProvider config={config}>
            <QueryClientProvider client={queryClient}>
                {mounted ? children : <div style={{ visibility: 'hidden' }}>{children}</div>}
            </QueryClientProvider>
        </WagmiProvider>
    )
}
