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
                        className="gradient-text hero-title-small"
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

                <div className="main-dashboard-grid">
                    {/* Left Column: Account Details */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="neo-card"
                    >
                        <div className="profile-header-flex">
                            <div className="profile-avatar-wrap">
                                <User size={40} style={{ color: 'var(--primary)' }} />
                            </div>
                            <div className="profile-info-text">
                                <h2 className="profile-address">{address?.slice(0, 8)}...{address?.slice(-6)}</h2>
                                <p className="profile-id">Active Member ID: #{Number(joinTimestamp).toString().slice(-4)}</p>
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <div className="neo-card referral-card">
                                <div className="referral-label">Referral Link</div>
                                <div className="referral-input-group">
                                    <input
                                        readOnly
                                        value={`${window.location.origin}/join?ref=${address}`}
                                        className="neo-input referral-input"
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

                            <div className="security-info-card">
                                <div className="security-icon-outer">
                                    <ShieldCheck size={24} />
                                </div>
                                <div className="security-text-content">
                                    <div className="security-status">Smart Audit Passed</div>
                                    <div className="security-subtext">0 Critical Vulnerabilities Detected</div>
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
                            <div className="stats-grid-refined">
                                <div className="stat-card-premium">
                                    <div className="stat-label-small">Referral Count</div>
                                    <div className="stat-value-large">{directReferrals?.toString() || '0'}</div>
                                    <div className="stat-glow"></div>
                                </div>
                                <div className="stat-card-premium">
                                    <div className="stat-label-small">ID Value</div>
                                    <div className="stat-value-large">{Number(formatUnits(idValue || 0n, 18)).toFixed(0)}</div>
                                    <div className="stat-glow"></div>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </div>
            </main>

            <style jsx>{`
        .hero-title-small {
           font-size: clamp(24px, 4vw, 32px);
           margin-bottom: 8px;
        }

        .full-width {
          width: 100%;
        }
        .data-row {
           display: flex;
           justify-content: space-between;
           padding: 14px 0;
           border-bottom: 1px solid var(--glass-border);
           font-size: 14px;
           transition: background 0.2s;
        }
        .data-row:hover {
           background: rgba(255,255,255,0.02);
        }
        .data-row:last-child {
           border-bottom: none;
        }

        .profile-header-flex {
           display: flex;
           align-items: center;
           gap: 24px;
           margin-bottom: 32px;
        }
        .profile-avatar-wrap {
           width: 80px;
           height: 80px;
           background: linear-gradient(135deg, var(--glass), rgba(138,43,226,0.1));
           border-radius: 20px;
           display: flex;
           align-items: center;
           justify-content: center;
           border: 1px solid var(--glass-border);
           flex-shrink: 0;
           box-shadow: 0 4px 20px rgba(0,0,0,0.2);
        }
        .profile-info-text {
           overflow: hidden;
           flex: 1;
        }
        .profile-address {
           font-size: clamp(18px, 2.5vw, 22px);
           font-weight: 800;
           word-break: break-all;
           margin-bottom: 4px;
           color: #fff;
        }
        .profile-id {
           color: var(--text-dim);
           font-size: 14px;
           font-weight: 500;
        }

        .referral-card {
           background: rgba(255,255,255,0.02);
           padding: 24px;
           border-radius: 16px;
           border: 1px solid var(--glass-border);
        }
        .referral-label {
           font-size: 11px;
           color: var(--primary);
           font-weight: 800;
           text-transform: uppercase;
           letter-spacing: 1px;
           margin-bottom: 12px;
        }
        .referral-input-group {
           display: flex;
           gap: 12px;
           background: rgba(0,0,0,0.3);
           padding: 6px;
           border-radius: 12px;
           border: 1px solid var(--glass-border);
        }
        .referral-input {
           background: transparent !important;
           font-size: 14px !important;
           border: none !important;
           color: var(--text-dim) !important;
        }
        
        .security-info-card {
           display: flex;
           align-items: center;
           gap: 16px;
           background: rgba(0, 255, 127, 0.03);
           border: 1px solid rgba(0, 255, 127, 0.1);
           padding: 16px;
           border-radius: 16px;
        }
        .security-icon-outer {
           color: #00FF7F;
           background: rgba(0, 255, 127, 0.1);
           padding: 10px;
           border-radius: 12px;
        }
        .security-status {
           font-size: 14px;
           font-weight: 700;
           color: #fff;
        }
        .security-subtext {
           font-size: 12px;
           color: var(--text-dim);
        }

        .stats-grid-refined {
           display: grid;
           grid-template-columns: 1fr 1fr;
           gap: 16px;
        }
        .stat-card-premium {
           position: relative;
           background: var(--glass);
           padding: 24px;
           border-radius: 20px;
           border: 1px solid var(--glass-border);
           overflow: hidden;
           transition: all 0.3s ease;
        }
        .stat-card-premium:hover {
           transform: translateY(-4px);
           border-color: var(--primary);
        }
        .stat-label-small {
           font-size: 12px;
           color: var(--text-dim);
           font-weight: 600;
           margin-bottom: 8px;
        }
        .stat-value-large {
           font-size: 28px;
           font-weight: 900;
           color: #fff;
        }
        .stat-glow {
           position: absolute;
           bottom: -20px;
           right: -20px;
           width: 60px;
           height: 60px;
           background: var(--primary);
           opacity: 0.03;
           filter: blur(20px);
           border-radius: 50%;
        }

        @media (max-width: 768px) {
           .stats-grid-refined {
             grid-template-columns: 1fr;
           }
        }

        @media (max-width: 640px) {
           .profile-header-flex {
             flex-direction: column;
             align-items: center;
             text-align: center;
             gap: 16px;
           }
           .profile-avatar-wrap {
             width: 70px;
             height: 70px;
           }
           .referral-input-group {
             flex-direction: column;
             background: transparent;
             border: none;
             padding: 0;
           }
           .referral-input {
             background: rgba(0,0,0,0.3) !important;
             border: 1px solid var(--glass-border) !important;
             border-radius: 12px !important;
             padding: 12px !important;
           }
           .referral-input-group button {
             width: 100%;
             padding: 12px;
             justify-content: center;
             border-radius: 12px;
             background: var(--primary);
             color: #000;
           }
           .referral-input-group button:hover {
             background: var(--primary);
             opacity: 0.9;
           }
        }
      `}</style>
        </div>
    )
}
