"use client"
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import ThreeScene from './components/ThreeScene'
import Navbar from './components/Navbar'
import { useAccount, useReadContract } from 'wagmi'
import { useWeb3Modal } from '@web3modal/wagmi/react'
import { NEOX_ABI, NEOX_ADDRESS } from './config/contract'
import { useState, useEffect } from 'react'
import { TrendingUp, Zap, Users, Shield, BarChart3, Globe, ArrowRight, ChevronRight, PlayCircle } from 'lucide-react'

export default function Home() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Hook calls must be at the top level, but their return values
  // should ideally only be used after mount if they rely on window objects.
  const { isConnected, address } = useAccount()
  const { open } = useWeb3Modal()

  const { data: userData } = useReadContract({
    address: NEOX_ADDRESS,
    abi: NEOX_ABI,
    functionName: 'users',
    args: [address],
    query: { enabled: !!address && isConnected && mounted } // First element of userData array from NEOX.sol is bool isRegistered
  })

  // If named return, it will be in userData.isRegistered
  const isRegistered = userData ? (Array.isArray(userData) ? userData[0] : userData.isRegistered) : false

  if (!mounted) {
    return (
      <main className="landing">
        <div className="loading-screen">
          <div className="loader-ring"></div>
        </div>
      </main>
    )
  }

  return (
    <main className="landing">
      <ThreeScene />
      <Navbar />

      <div className="landing-container">
        {/* Hero Section */}
        <section className="hero">
          <div className="hero-grid">
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
              className="hero-text"
            >
              <div className="badge-modern">
                <span className="pulse-dot"></span>
                V2 PROTOCOL LIVE ON BSC
              </div>
              <h1 className="hero-title">
                Revolutionize Your <br />
                <span className="gradient-text">Digital Wealth.</span>
              </h1>
              <p className="hero-subtitle">
                NeoX is the next-generation algorithmic yield platform.
                Secured by genetic smart contract logic and optimized for consistent growth.
              </p>

              <div className="hero-btns-group">
                {!isConnected ? (
                  <button onClick={() => open()} className="btn-primary large-btn hero-main-btn shadow-glow">
                    Start Earning Now <PlayCircle size={20} />
                  </button>
                ) : isRegistered ? (
                  <Link href="/dashboard" className="btn-primary large-btn hero-main-btn shadow-glow">
                    Open Dashboard <ChevronRight size={20} />
                  </Link>
                ) : (
                  <Link href="/join" className="btn-primary large-btn hero-main-btn shadow-glow">
                    Initialize Account <Zap size={20} />
                  </Link>
                )}

                <button className="btn-secondary large-btn">
                  Read Whitepaper
                </button>
              </div>

              <div className="hero-stats-mini">
                <div className="mini-stat">
                  <span className="stat-label">DAILY YIELD</span>
                  <span className="stat-value">Up to 2%</span>
                </div>
                <div className="stat-divider"></div>
                <div className="mini-stat">
                  <span className="stat-label">NETWORK CAP</span>
                  <span className="stat-value">Infinite</span>
                </div>
                <div className="stat-divider"></div>
                <div className="mini-stat">
                  <span className="stat-label">SECURITY</span>
                  <span className="stat-value">Audited</span>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Income Ecosystem */}
        <section className="incomes-section">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="section-header-center"
          >
            <h2 className="massive-title">Earnings <span className="gradient-text">Ecosystem.</span></h2>
            <p className="section-desc">Multiple integrated revenue streams designed to maximize your portfolio growth automatically.</p>
          </motion.div>

          <div className="income-grid">
            <PremiumIncomeCard
              icon={TrendingUp}
              title="Yield Harvest (ROI)"
              description="Continuous algorithmic growth. Earn consistent daily returns directly on your stake value."
              stats="2x Cap | 2% Daily"
              color="var(--primary)"
              delay={0.1}
            />
            <PremiumIncomeCard
              icon={Zap}
              title="Business Dev Fund"
              description="Reward for network architects. Earn fixed daily USDT based on your total business volume."
              stats="100 Days | Tiered"
              color="var(--secondary)"
              delay={0.2}
            />
            <PremiumIncomeCard
              icon={Users}
              title="Team Matching"
              description="Balance your genetic matrix. Activate massive rewards by matching downline legs effectively."
              stats="Leg Balanced | 100 Days"
              color="var(--accent)"
              delay={0.3}
            />
          </div>
        </section>

        {/* Feature Grid */}
        <section className="features-section">
          <div className="features-grid">
            <FeatureCard
              icon={Shield}
              title="Genetic Security"
              text="Our logic is immutable and verified on-chain, protecting every transaction."
            />
            <FeatureCard
              icon={BarChart3}
              title="Growth Metrics"
              text="Real-time transparency into your network performance and income velocity."
            />
            <FeatureCard
              icon={Globe}
              title="Global Protocol"
              text="A borderless financial ecosystem powered by the BSC network."
            />
          </div>
        </section>

        <footer className="modern-footer">
          <div className="footer-content">
            <div className="footer-logo gradient-text">NeoX</div>
            <div className="footer-links">
              <a href="#">Privacy</a>
              <a href="#">Terms</a>
              <a href="#">Docs</a>
            </div>
            <div className="footer-copy">© 2026 NeoX V2 Protocol. All rights reserved.</div>
          </div>
        </footer>
      </div>
    </main>
  )
}

function PremiumIncomeCard({ icon: Icon, title, description, stats, color, delay }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      transition={{ delay }}
      whileHover={{ y: -15 }}
      className="premium-card"
    >
      <div className="card-glass-glow" style={{ background: color }}></div>
      <div className="card-content">
        <div className="icon-wrapper" style={{ background: color + '22', color }}>
          <Icon size={32} />
        </div>
        <h3>{title}</h3>
        <p>{description}</p>
        <div className="card-footer-stats" style={{ color: color }}>
          <Zap size={14} /> {stats}
        </div>
      </div>
    </motion.div>
  )
}

function FeatureCard({ icon: Icon, title, text }) {
  return (
    <div className="modern-feature-card">
      <div className="feature-icon-box">
        <Icon size={24} />
      </div>
      <h5>{title}</h5>
      <p>{text}</p>
    </div>
  )
}
