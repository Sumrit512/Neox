"use client"
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense } from 'react'
import Navbar from '../components/Navbar'
import { CheckCircle2, AlertCircle, Loader2, ShieldCheck } from 'lucide-react'
import { NEOX_ABI, NEOX_ADDRESS, USDT_ABI, USDT_ADDRESS_TESTNET } from '../config/contract'
import { parseUnits } from 'viem'

function JoinForm() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const ref = searchParams.get('ref')
  const [sponsor, setSponsor] = useState('')
  const [mounted, setMounted] = useState(false)
  const { address, isConnected } = useAccount()

  const JOIN_FEE = parseUnits('10', 18)

  useEffect(() => {
    if (ref) setSponsor(ref)
  }, [ref])

  // Check Membership status for redirection
  const { data: userData } = useReadContract({
    address: NEOX_ADDRESS,
    abi: NEOX_ABI,
    functionName: 'users',
    args: [address],
    query: { enabled: !!address && isConnected }
  })
  const isRegistered = userData ? userData[0] : false

  useEffect(() => {
    if (isConnected && isRegistered) {
      router.push('/dashboard')
    }
  }, [isConnected, isRegistered, router])

  // Check USDT Allowance
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDT_ADDRESS_TESTNET,
    abi: USDT_ABI,
    functionName: 'allowance',
    args: [address, NEOX_ADDRESS],
    query: { enabled: !!address }
  })

  const [activeTxType, setActiveTxType] = useState(null) // 'approve' | 'join'
  const { writeContract, data: hash, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (isSuccess) {
      refetchAllowance()
      if (activeTxType === 'join') {
        const timer = setTimeout(() => {
          router.push('/dashboard')
        }, 3000)
        return () => clearTimeout(timer)
      } else if (activeTxType === 'approve') {
        // Reset state after approval so they can click join
        setActiveTxType(null)
      }
    }
  }, [isSuccess, refetchAllowance, router, activeTxType])

  const handleApprove = () => {
    setActiveTxType('approve')
    writeContract({
      address: USDT_ADDRESS_TESTNET,
      abi: USDT_ABI,
      functionName: 'approve',
      args: [NEOX_ADDRESS, JOIN_FEE],
    })
  }

  const handleJoin = () => {
    if (!sponsor || sponsor.length < 42) return
    setActiveTxType('join')
    writeContract({
      address: NEOX_ADDRESS,
      abi: NEOX_ABI,
      functionName: 'join',
      args: [sponsor],
    })
  }

  if (!mounted || (isConnected && isRegistered)) {
    return (
      <div className="join-card-container">
        <div className="neo-card join-card" style={{ textAlign: 'center', padding: '100px' }}>
          <Loader2 className="animate-spin" size={48} style={{ margin: '0 auto', color: 'var(--primary)' }} />
          <p style={{ marginTop: '20px' }}>{isRegistered ? 'Already a member! Redirecting...' : 'Checking subscription...'}</p>
        </div>
      </div>
    )
  }

  const needsApproval = allowance !== undefined && allowance < JOIN_FEE

  return (
    <div className="join-card-container">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="neo-card join-card"
      >
        <h2 className="gradient-text card-title">Join NeoX</h2>
        <p className="card-desc">Enter your sponsor's wallet address to join the NeoX ecosystem and start earning ROI.</p>

        {!isConnected ? (
          <div className="alert-box warning">
            <AlertCircle size={20} />
            <span>Please connect your wallet first.</span>
          </div>
        ) : (
          <div className="join-form">
            <div className="input-group">
              <label>Sponsor Wallet Address</label>
              <input
                type="text"
                placeholder="0x..."
                value={sponsor}
                onChange={(e) => setSponsor(e.target.value)}
                className="neo-input"
              />
            </div>

            {isSuccess && activeTxType === 'join' ? (
              <div className="alert-box success">
                <CheckCircle2 size={20} />
                <span>Successfully joined! Redirecting to dashboard...</span>
              </div>
            ) : needsApproval ? (
              <button
                onClick={handleApprove}
                disabled={isPending || isConfirming}
                className="btn-primary full-width"
                style={{ background: 'var(--secondary)', color: '#fff' }}
              >
                {isPending || isConfirming && activeTxType === 'approve' ? <Loader2 className="animate-spin" /> : <><ShieldCheck size={18} /> Approve USDT</>}
              </button>
            ) : (
              <button
                onClick={handleJoin}
                disabled={isPending || isConfirming || !sponsor}
                className="btn-primary full-width"
              >
                {isPending || isConfirming && activeTxType === 'join' ? <Loader2 className="animate-spin" /> : 'Join Now (10 USDT)'}
              </button>
            )}
          </div>
        )}
      </motion.div>
    </div>
  )
}

export default function JoinPage() {
  return (
    <main className="page-container">
      <Navbar />
      <Suspense fallback={
        <div className="join-card-container">
          <div className="neo-card join-card" style={{ textAlign: 'center', padding: '100px' }}>
            <Loader2 className="animate-spin" size={48} style={{ margin: '0 auto', color: 'var(--primary)' }} />
            <p style={{ marginTop: '20px' }}>Loading joining portal...</p>
          </div>
        </div>
      }>
        <JoinForm />
      </Suspense>
    </main>
  )
}
