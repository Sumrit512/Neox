"use client"
import Link from 'next/link'
import { useWeb3Modal } from '@web3modal/wagmi/react'
import { useAccount, useDisconnect, useReadContract } from 'wagmi'
import { LogOut, User as UserIcon, LayoutDashboard, Home, UserPlus, RefreshCw } from 'lucide-react'
import { NEOX_ABI, NEOX_ADDRESS } from '../config/contract'

import { useState, useEffect } from 'react'

export default function Navbar() {
  const [mounted, setMounted] = useState(false)
  const { open } = useWeb3Modal()
  const { isConnected, address } = useAccount()
  const { disconnect } = useDisconnect()

  // Membership status
  const { data: userData } = useReadContract({
    address: NEOX_ADDRESS,
    abi: NEOX_ABI,
    functionName: 'users',
    args: [address],
    query: { enabled: !!address && isConnected }
  })

  // First element of userData array from NEOX.sol is bool isRegistered
  const isRegistered = userData ? userData[0] : false

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return (
    <nav className="navbar">
      <div className="nav-container">
        <Link href="/" className="logo gradient-text">NeoX</Link>
        <div className="nav-links">
          <Link href="/"><Home size={20} /> Home</Link>
        </div>
        <div className="nav-actions">
          <button className="btn-primary">Connect Wallet</button>
        </div>
      </div>
    </nav>
  )

  return (
    <nav className="navbar">
      <div className="nav-container">
        <Link href="/" className="logo gradient-text">NeoX</Link>

        <button className="nav-toggle" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
          <RefreshCw size={24} className={mobileMenuOpen ? 'rotate-45' : ''} />
        </button>

        <div className={`nav-links ${mobileMenuOpen ? 'mobile-open' : ''}`} onClick={() => setMobileMenuOpen(false)}>
          <Link href="/"><Home size={20} /> Home</Link>

          {isConnected && isRegistered && (
            <>
              <Link href="/dashboard"><LayoutDashboard size={20} /> Dashboard</Link>
              <Link href="/profile"><UserIcon size={20} /> Profile</Link>
            </>
          )}

          {isConnected && !isRegistered && (
            <Link href="/join"><UserPlus size={20} /> Get Started</Link>
          )}
        </div>
        <div className="nav-actions">
          {!isConnected ? (
            <button onClick={() => open()} className="btn-primary">Connect Wallet</button>
          ) : (
            <div className="account-info">
              <span className="address-pill">{address?.slice(0, 6)}...{address?.slice(-4)}</span>
              <button onClick={() => disconnect()} className="btn-icon">
                <LogOut size={20} />
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  )
}
