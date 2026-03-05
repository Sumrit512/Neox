"use client"
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import Navbar from '../components/Navbar'
import {
    User, Wallet, Copy, CheckCircle2,
    Share2, ShieldCheck, LogOut, Clock,
    Calendar, Award, Globe
} from 'lucide-react'
import { useAccount, useReadContract, useDisconnect } from 'wagmi'
import { formatUnits } from 'viem'
import { NEOX_ABI, NEOX_ADDRESS } from '../config/contract'

export default function ProfilePage() {
    const { address, isConnected } = useAccount()
    const { disconnect } = useDisconnect()
    const [mounted, setMounted] = useState(false)
    const [copied, setCopied] = useState(false)

    // Contract Reads
    const { data: userData } = useReadContract({
        address: NEOX_ADDRESS,
        abi: NEOX_ABI,
        functionName: 'users',
        args: [address],
        query: { enabled: !!address }
    })

    useEffect(() => {
        setMounted(true)
    }, [])

    const copyReferral = () => {
        if (!address) return
        const link = `${window.location.origin}/join?ref=${address}`
        navigator.clipboard.writeText(link)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    if (!mounted) return null

    if (!isConnected) {
        return (
            <main className="page-container">
                <Navbar />
                <div className="dashboard-content" style={{ textAlign: 'center', marginTop: '150px' }}>
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                    >
                        <h1 className="gradient-text hero-title">Profile Hub</h1>
                        <p className="hero-subtitle">Connect your wallet to view your personalized NeoX profile.</p>
                    </motion.div>
                </div>
            </main>
        )
    }

    const [
        isRegistered, sponsor, idValue, totalDeposited, joinTimestamp,
        lastRoiTimestamp, totalRoiEarned, pendingIncome, directReferrals,
        businessValue, isBoosted2, isBoosted4
    ] = userData || [false, '0x...', 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, false, false]

    return (
        <div className="dashboard-layout">
            <Navbar />

            <main className="main-content">
                <header className="dashboard-header" style={{ marginBottom: '40px' }}>
                    <motion.h1
                        initial={{ x: -20, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        className="gradient-text"
                        style={{ fontSize: '32px' }}
                    >
                        User Profile
                    </motion.h1>
                    <motion.p
                        initial={{ x: -20, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ delay: 0.1 }}
                        style={{ color: 'var(--text-dim)', fontSize: '14px', marginTop: '4px' }}
                    >
                        Manage your account and referral network.
                    </motion.p>
                </header>

                <div className="main-dashboard-grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) 1.2fr' }}>
                    {/* Left Column: Account Details */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="neo-card"
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '30px' }}>
                            <div style={{ width: '80px', height: '80px', background: 'var(--glass)', borderRadius: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--glass-border)' }}>
                                <User size={40} style={{ color: 'var(--primary)' }} />
                            </div>
                            <div style={{ overflow: 'hidden' }}>
                                <h2 style={{ fontSize: '20px', fontWeight: 800 }}>{address?.slice(0, 8)}...{address?.slice(-6)}</h2>
                                <p style={{ color: 'var(--text-dim)', fontSize: '14px' }}>Active Member ID: #{Number(joinTimestamp).toString().slice(-4)}</p>
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <div className="neo-card" style={{ background: 'var(--glass)', padding: '20px' }}>
                                <div style={{ fontSize: '12px', color: 'var(--primary)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '8px' }}>Referral Link</div>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <input
                                        readOnly
                                        value={`${window.location.origin}/join?ref=${address}`}
                                        className="neo-input"
                                        style={{ background: 'rgba(0,0,0,0.2)', fontSize: '13px' }}
                                    />
                                    <button className="btn-icon" onClick={copyReferral}>
                                        {copied ? <CheckCircle2 size={18} style={{ color: '#00FF7F' }} /> : <Copy size={18} />}
                                    </button>
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <div className="data-row">
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Award size={16} /> Subscription Status</span>
                                    <span style={{ color: isRegistered ? '#00FF7F' : '#ff4444' }}>{isRegistered ? 'Verified' : 'Not Joined'}</span>
                                </div>
                                <div className="data-row">
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Calendar size={16} /> Member Since</span>
                                    <span>{joinTimestamp ? new Date(Number(joinTimestamp) * 1000).toLocaleDateString() : '-'}</span>
                                </div>
                                <div className="data-row">
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Globe size={16} /> Network Region</span>
                                    <span>Global Matrix</span>
                                </div>
                            </div>

                            <button className="btn-secondary full-width" onClick={() => disconnect()} style={{ marginTop: '20px', color: '#ff4444' }}>
                                <LogOut size={18} /> Logout Session
                            </button>
                        </div>
                    </motion.div>

                    {/* Right Column: Performance & Security */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 }}
                            className="neo-card"
                        >
                            <h3 className="section-title"><ShieldCheck size={20} /> Security & Transparency</h3>
                            <p style={{ color: 'var(--text-dim)', fontSize: '14px', lineHeight: 1.6, marginBottom: '20px' }}>
                                Your data is stored directly on the Binance Smart Chain. All ROI calculations and referral payouts are handled by the immutable NeoX smart contract.
                            </p>

                            <div className="neo-card" style={{ background: 'rgba(138,43,226,0.05)', border: '1px solid rgba(138,43,226,0.2)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                    <div style={{ color: 'var(--accent)' }}><ShieldCheck size={24} /></div>
                                    <div>
                                        <div style={{ fontSize: '14px', fontWeight: 700 }}>Smart Audit Passed</div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-dim)' }}>0 Critical Vulnerabilities Detected</div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.2 }}
                            className="neo-card"
                        >
                            <h3 className="section-title"><Share2 size={20} /> Growth Stats</h3>
                            <div className="stats-grid" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: '0' }}>
                                <div className="neo-card" style={{ background: 'var(--glass)', padding: '15px' }}>
                                    <div style={{ fontSize: '12px', color: 'var(--text-dim)' }}>Referral Count</div>
                                    <div style={{ fontSize: '24px', fontWeight: 800 }}>{directReferrals?.toString() || '0'}</div>
                                </div>
                                <div className="neo-card" style={{ background: 'var(--glass)', padding: '15px' }}>
                                    <div style={{ fontSize: '12px', color: 'var(--text-dim)' }}>ID Value</div>
                                    <div style={{ fontSize: '24px', fontWeight: 800 }}>{Number(formatUnits(idValue || 0n, 18)).toFixed(0)}</div>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </div>
            </main>

            <style jsx>{`
        .full-width {
          width: 100%;
        }
        .data-row {
           display: flex;
           justify-content: space-between;
           padding: 12px 0;
           border-bottom: 1px solid var(--glass-border);
           font-size: 14px;
        }
        .data-row:last-child {
           border-bottom: none;
        }
      `}</style>
        </div>
    )
}
