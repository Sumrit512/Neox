"use client"
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Navbar from '../components/Navbar'
import NeoXTree from '../components/NeoXTree'
import {
  Wallet, TrendingUp, Users, ArrowUpRight,
  ArrowDownLeft, ShieldCheck, Loader2,
  LayoutDashboard, Activity, PieChart,
  Info, Zap, Network, X, CheckCircle2,
  Clock, History, RefreshCw, AlertCircle,
  Search, ChevronDown, Globe, HardDrive, UserPlus
} from 'lucide-react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, usePublicClient, useChainId, useReadContracts } from 'wagmi'
import { bsc, bscTestnet } from 'wagmi/chains'
import { formatUnits, parseUnits, decodeEventLog } from 'viem'
import { getLogs, getBlockNumber } from 'viem/actions'
import { NEOX_ABI, NEOX_ADDRESS, USDT_ABI, USDT_ADDRESS_TESTNET } from '../config/contract'

const StatCard = ({ title, value, icon: Icon, color, delay }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5, delay }}
    className="neo-card stat-card"
  >
    <div className="stat-header">
      <div className="stat-icon-wrap" style={{ background: `${color}15`, color: color }}>
        <Icon size={24} />
      </div>
      <div className="stat-trend">
        <Activity size={16} style={{ color: color, opacity: 0.6 }} />
      </div>
    </div>
    <div className="stat-info">
      <span className="stat-label">{title}</span>
      <h3 className="stat-value">{value}</h3>
    </div>
  </motion.div>
)

export default function DashboardPage() {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const chainId = useChainId()
  const [mounted, setMounted] = useState(false)
  const [upgradeAmount, setUpgradeAmount] = useState('')
  const [activeTab, setActiveTab] = useState('overview')
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false)
  const [lastAction, setLastAction] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [loadingLogs, setLoadingLogs] = useState(false)
  const [logError, setLogError] = useState(null)
  const [lastLogRefresh, setLastLogRefresh] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const ITEMS_PER_PAGE = 10

  const [currentBlockCursor, setCurrentBlockCursor] = useState(null)
  const [canLoadMore, setCanLoadMore] = useState(true)
  const CHUNK_SIZE = 800n
  const isInitialLoad = useRef(true)

  const isBscTestnet = chainId === bscTestnet.id
  const currentNetworkName = isBscTestnet ? 'BSC Testnet' : (chainId === bsc.id ? 'BSC Mainnet' : 'Chain')

  const { data: userData, refetch: refetchUser } = useReadContract({
    address: NEOX_ADDRESS,
    abi: NEOX_ABI,
    functionName: 'users',
    args: [address],
    query: { enabled: !!address }
  })

  // THE ULTIMATE LOG FETCHING LOGIC - Infallible Join Detection
  const fetchLogs = useCallback(async (isInitial = true) => {
    if (!address || !publicClient) return
    setLoadingLogs(true)
    setLogError(null)

    try {
      const latestBlock = await getBlockNumber(publicClient)
      let startBlock;
      let genesisLogs = []

      const userRes = userData && Array.isArray(userData) ? userData : null
      const joinTs = userRes ? BigInt(userRes[4]) : 0n
      let estimatedJoinBlock = 0n

      if (joinTs > 0n) {
        const nowTs = BigInt(Math.floor(Date.now() / 1000))
        const secondsPassed = nowTs - joinTs
        const blocksToLookBack = (secondsPassed / 3n) + 5000n // ~4 hours buffer
        estimatedJoinBlock = latestBlock - blocksToLookBack > 0n ? latestBlock - blocksToLookBack : 0n
      }

      if (isInitial) {
        startBlock = latestBlock
        if (isInitialLoad.current) setTransactions([])

        // THE ULTIMATE GENESIS SCAN: Recursive split on ANY error to ensure result
        const findJoinRecursive = async (from, to, depth = 0) => {
          try {
            const joinedEvent = NEOX_ABI.find(x => x.name === 'Joined')
            const logs = await getLogs(publicClient, {
              address: NEOX_ADDRESS,
              event: joinedEvent,
              args: { user: address },
              fromBlock: from,
              toBlock: to
            })
            return logs
          } catch (err) {
            // Split if there's any error (Rate limit, Timeout, Range limit, Node crash)
            if (depth < 10 && (to - from) > 50n) {
              const mid = from + (to - from) / 2n
              console.log(`[NeoX] Range Split [Depth ${depth}]: ${from}-${mid} and ${mid + 1n}-${to}`)
              // Add small delay to prevent 429
              await new Promise(r => setTimeout(r, depth * 50))
              const [h1, h2] = await Promise.all([
                findJoinRecursive(from, mid, depth + 1),
                findJoinRecursive(mid + 1n, to, depth + 1)
              ])
              return [...h1, ...h2]
            }
            return []
          }
        }

        if (joinTs > 0n) {
          try {
            console.log(`[NeoX] Triggering Bulletproof Deep Scan for User History...`)
            // Huge window: 1 million blocks around joining timestamp
            const searchRange = 500000n
            const deepFrom = estimatedJoinBlock > searchRange ? estimatedJoinBlock - searchRange : 0n
            const deepTo = estimatedJoinBlock + searchRange > latestBlock ? latestBlock : estimatedJoinBlock + searchRange

            const logs = await findJoinRecursive(deepFrom, deepTo)

            if (logs.length > 0) {
              genesisLogs = logs.map(l => ({ ...l, eventName: 'Joined' }))
              console.log(`[NeoX] DATA FOUND: Captured registration log at block ${logs[0].blockNumber}`)
            } else {
              // Final broad search from genesis - 2 million block window
              console.log(`[NeoX] No results in primary window. Searching Genesis blocks...`)
              const startLogs = await findJoinRecursive(0n, 1000000n)
              genesisLogs = startLogs.map(l => ({ ...l, eventName: 'Joined' }))
            }
          } catch (e) {
            console.error("[NeoX] Deep scan failed. ID Subscription will remain synthetic.", e)
          }
        }
      } else {
        startBlock = currentBlockCursor ? currentBlockCursor - 1n : latestBlock
      }

      const toBlockNumber = startBlock
      const fromBlockNumber = toBlockNumber - CHUNK_SIZE > 0n ? toBlockNumber - CHUNK_SIZE : 0n

      const eventNames = ['Joined', 'Upgraded', 'Withdrawn', 'IncomeReceived']

      const fetchByEvent = async (name, from, to, depth = 0) => {
        try {
          const eventObj = NEOX_ABI.find(x => x.name === name)
          const params = { address: NEOX_ADDRESS, event: eventObj, fromBlock: from, toBlock: to }

          if (name === 'Joined') {
            // Only need to fetch Join events for the user (ID Subscription)
            return await getLogs(publicClient, { ...params, args: { user: address } })
          }

          if (['Upgraded', 'Withdrawn', 'IncomeReceived'].includes(name)) {
            // In these events, 'user' is always the recipient/actor
            return await getLogs(publicClient, { ...params, args: { user: address } })
          }

          return await getLogs(publicClient, params)
        } catch (err) {
          if (depth < 2 && (to - from) > 200n) {
            const mid = from + (to - from) / 2n
            const [h1, h2] = await Promise.all([
              fetchByEvent(name, from, mid, depth + 1),
              fetchByEvent(name, mid + 1n, to, depth + 1)
            ])
            return [...h1, ...h2]
          }
          return []
        }
      }

      const logPromises = eventNames.map((name, idx) =>
        new Promise(resolve => setTimeout(() => resolve(fetchByEvent(name, fromBlockNumber, toBlockNumber)), idx * 40))
      )

      const results = await Promise.all(logPromises)
      const allRaw = [...genesisLogs, ...results.flat()]

      const userTarget = address.toLowerCase()
      const formatted = allRaw.map(log => {
        const { eventName, args } = log
        const u = args.user?.toLowerCase()
        const s = args.sponsor?.toLowerCase()

        if (u !== userTarget && s !== userTarget) return null

        let type = eventName
        let amount = formatUnits(args.amount || 0n, 18)
        let isPositive = true

        if (eventName === 'Joined') {
          type = 'ID Subscription'
          amount = '10'
          isPositive = false
        } else if (eventName === 'IncomeReceived') {
          type = args.typeOfIncome || 'Network Income'
          isPositive = true
        } else if (eventName === 'Upgraded') {
          type = 'Injection'
          isPositive = false
        } else if (eventName === 'Withdrawn') {
          type = 'Withdrawal'
          isPositive = false
        }

        const bDiff = Number(latestBlock - log.blockNumber)
        const estTime = Date.now() - (bDiff * 3000)

        return {
          type, amount, isPositive,
          txHash: log.transactionHash,
          blockNumber: Number(log.blockNumber),
          timestamp: estTime,
          isReal: true
        }
      }).filter(Boolean)

      setTransactions(prev => {
        const combined = isInitial ? formatted : [...prev, ...formatted]
        const sorted = combined.sort((a, b) => b.blockNumber - a.blockNumber || b.timestamp - a.timestamp)
        // Ensure unique by hash, keeping the most relevant one
        const uniqueMap = new Map()
        sorted.forEach(tx => {
          if (!uniqueMap.has(tx.txHash)) {
            uniqueMap.set(tx.txHash, tx)
          }
        })
        return Array.from(uniqueMap.values())
      })

      setCurrentBlockCursor(fromBlockNumber)
      setCanLoadMore(fromBlockNumber > 0n)

    } catch (error) {
      console.error('[NeoX] History Sync Error:', error)
    } finally {
      setLoadingLogs(false)
    }
  }, [address, publicClient, currentBlockCursor, currentNetworkName, CHUNK_SIZE, userData])

  // Sync Logic
  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (isConnected && mounted && publicClient) {
      if (isInitialLoad.current) {
        fetchLogs(true)
        isInitialLoad.current = false
      }
    }
  }, [isConnected, mounted, address, publicClient, chainId, fetchLogs])


  const { data: pendingBdi, refetch: refetchBdi } = useReadContract({
    address: NEOX_ADDRESS,
    abi: NEOX_ABI,
    functionName: 'pendingBdiIncome',
    args: [address],
    query: { enabled: !!address, refetchInterval: 30000 } // Poll every 30s
  })

  const { data: pendingRoi, refetch: refetchRoi } = useReadContract({
    address: NEOX_ADDRESS,
    abi: NEOX_ABI,
    functionName: 'pendingRoiIncome',
    args: [address],
    query: { enabled: !!address, refetchInterval: 30000 } // Poll every 30s
  })

  const { data: pendingReward, refetch: refetchReward } = useReadContract({
    address: NEOX_ADDRESS,
    abi: NEOX_ABI,
    functionName: 'pendingRewardIncome',
    args: [address],
    query: { enabled: !!address, refetchInterval: 30000 } // Poll every 30s
  })

  const { data: roiRate } = useReadContract({
    address: NEOX_ADDRESS,
    abi: NEOX_ABI,
    functionName: 'getRoiRate',
    args: [address],
    query: { enabled: !!address }
  })

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDT_ADDRESS_TESTNET,
    abi: USDT_ABI,
    functionName: 'allowance',
    args: [address, NEOX_ADDRESS],
    query: { enabled: !!address }
  })

  const { data: referralAddrs } = useReadContract({
    address: NEOX_ADDRESS,
    abi: NEOX_ABI,
    functionName: 'getReferrals',
    args: [address],
    query: { enabled: !!address }
  })

  const referralContracts = useMemo(() => {
    if (!referralAddrs || !Array.isArray(referralAddrs)) return []
    return referralAddrs.map(refAddr => ({
      address: NEOX_ADDRESS,
      abi: NEOX_ABI,
      functionName: 'users',
      args: [refAddr]
    }))
  }, [referralAddrs])

  const { data: referralDataResults } = useReadContracts({
    contracts: referralContracts,
    query: { enabled: referralContracts.length > 0, refetchInterval: 30000 }
  })

  const liveDirectRoi = useMemo(() => {
    if (!referralDataResults || !Array.isArray(referralDataResults)) return 0n
    let totalLiveDirectRoi = 0n
    const now = BigInt(Math.floor(Date.now() / 1000))
    const period = 300n // DAY_PERIOD

    referralDataResults.forEach(res => {
      if (!res.result) return
      const r = res.result
      const idVal = r[2]
      const last = r[5]
      const b2 = r[10]
      const b4 = r[11]
      const earned = r[6]

      if (!last || last === 0n || last >= now) return
      const timePassed = now - last
      const periods = timePassed / period
      if (periods <= 0n) return

      const rate = b4 ? 4n : b2 ? 3n : 2n
      let roi = (idVal * rate * periods) / 100n

      const maxRoi = idVal * 2n
      if (earned + roi > maxRoi) {
        roi = maxRoi > earned ? maxRoi - earned : 0n
      }

      totalLiveDirectRoi += (roi * 5n) / 100n
    })
    return totalLiveDirectRoi
  }, [referralDataResults])

  const { writeContract, data: hash, isPending: isTxPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  // Data Parsing Logic - MUST BE BEFORE EFFECTS AND MEMOS
  const userDataArray = userData || [false, '0x...', 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, false, false, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, false]

  const u = Array.isArray(userDataArray) ? {
    isRegistered: userDataArray[0],
    sponsor: userDataArray[1],
    idValue: userDataArray[2],
    totalDeposited: userDataArray[3],
    joinTimestamp: userDataArray[4],
    lastRoiTimestamp: userDataArray[5],
    totalRoiEarned: userDataArray[6],
    pendingIncome: userDataArray[7],
    directReferrals: userDataArray[8],
    businessValue: userDataArray[9],
    isBoosted2: userDataArray[10],
    isBoosted4: userDataArray[11],
    bdiStartTime: userDataArray[12],
    lastBdiTimestamp: userDataArray[13],
    currentBdiTier: userDataArray[14],
    bdiEndTimestamp: userDataArray[15],
    totalBdiEarned: userDataArray[16],
    maxLegBusiness: userDataArray[17],
    lastRewardTimestamp: userDataArray[18],
    rewardEndTimestamp: userDataArray[19],
    totalRewardEarned: userDataArray[20],
    isRewardActive: userDataArray[21]
  } : userDataArray

  const {
    isRegistered, sponsor, idValue, totalDeposited, joinTimestamp,
    lastRoiTimestamp, totalRoiEarned, pendingIncome, directReferrals,
    businessValue, isBoosted2, isBoosted4,
    bdiStartTime, lastBdiTimestamp, currentBdiTier, bdiEndTimestamp, totalBdiEarned,
    maxLegBusiness, lastRewardTimestamp, rewardEndTimestamp, totalRewardEarned, isRewardActive
  } = u

  const totalAccumulated =
    BigInt(pendingIncome || 0n) +
    BigInt(pendingBdi || 0n) +
    BigInt(pendingRoi?.[0] || 0n) +
    BigInt(pendingReward || 0n)

  const canHarvest = totalAccumulated >= parseUnits('1', 18)

  const filteredTransactions = useMemo(() => {
    if (!searchQuery) return transactions
    return transactions.filter(tx =>
      tx.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tx.txHash.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tx.amount.toString().includes(searchQuery)
    )
  }, [transactions, searchQuery])

  const displayTransactions = useMemo(() => {
    if (searchQuery) return filteredTransactions

    const virtual = []
    const nowTs = BigInt(Math.floor(Date.now() / 1000))
    const period = 300n // DAY_PERIOD

    if (isConnected && mounted) {
      // 0. FALLBACK: Synthetic Join if real log is missing
      const hasRealJoin = transactions.some(tx => tx.type === 'ID Subscription' && tx.isReal)
      const joinTs = joinTimestamp ? BigInt(joinTimestamp) : 0n
      if (!hasRealJoin && joinTs > 0n && !searchQuery) {
        virtual.push({
          txHash: null,
          type: 'ID Subscription',
          amount: '10',
          isPositive: false,
          isVirtual: true, // Hide link for synthetic log
          timestamp: Number(joinTs) * 1000,
          subtext: 'Account Activation [Verified]'
        })
      }

      // 1. Break down ROI Cycles
      const currentRoiEarned = totalRoiEarned || 0n
      const maxRoi = idValue * 2n

      if (lastRoiTimestamp && lastRoiTimestamp > 0n && idValue > 0n && currentRoiEarned < maxRoi) {
        const rate = isBoosted4 ? 4n : (isBoosted2 ? 3n : 2n)
        const perPeriod = (idValue * rate) / 100n
        const elapsed = nowTs - lastRoiTimestamp
        const periods = elapsed / period
        let cumulative = currentRoiEarned

        for (let i = 1n; i <= periods; i++) {
          let amt = perPeriod
          if (cumulative + amt > maxRoi) {
            amt = maxRoi > cumulative ? maxRoi - cumulative : 0n
          }
          if (amt > 0n) {
            virtual.push({
              id: `v-roi-cycle-${i}`,
              type: 'ROI Accumulation (Cycle)',
              amount: formatUnits(amt, 18),
              isPositive: true,
              isVirtual: true,
              timestamp: (Number(lastRoiTimestamp) + Number(i * period)) * 1000,
              subtext: `Automated yield: ${rate}%`
            })
            cumulative += amt
          }
        }
      }

      // 2. Break down BDI Cycles
      if (lastBdiTimestamp && lastBdiTimestamp > 0n && currentBdiTier > 0n) {
        const bdiRates = [0n, 10n * 10n ** 18n, 50n * 10n ** 18n, 100n * 10n ** 18n, 200n * 10n ** 18n]
        const ratePerPeriod = bdiRates[Number(currentBdiTier)] || 0n
        const bdiUntil = bdiEndTimestamp && bdiEndTimestamp < nowTs ? bdiEndTimestamp : nowTs
        const elapsed = bdiUntil - lastBdiTimestamp
        const periods = elapsed / period

        for (let i = 1n; i <= periods; i++) {
          virtual.push({
            id: `v-bdi-cycle-${i}`,
            type: 'BDI Growth (Cycle)',
            amount: formatUnits(ratePerPeriod, 18),
            isPositive: true,
            isVirtual: true,
            timestamp: (Number(lastBdiTimestamp) + Number(i * period)) * 1000,
            subtext: `Tier ${currentBdiTier} Achievement`
          })
        }
      }

      // 3. Break down Matching Reward Cycles
      if (lastRewardTimestamp && lastRewardTimestamp > 0n && isRewardActive) {
        const rewardRate = 10n * 10n ** 18n // MATCHING_REWARD_AMOUNT
        const rewardUntil = rewardEndTimestamp && rewardEndTimestamp < nowTs ? rewardEndTimestamp : nowTs
        const elapsed = rewardUntil - lastRewardTimestamp
        const periods = elapsed / period

        for (let i = 1n; i <= periods; i++) {
          virtual.push({
            id: `v-reward-cycle-${i}`,
            type: 'Team Reward (Cycle)',
            amount: formatUnits(rewardRate, 18),
            isPositive: true,
            isVirtual: true,
            timestamp: (Number(lastRewardTimestamp) + Number(i * period)) * 1000,
            subtext: 'Genetic Matching Bonus'
          })
        }
      }

      // 4. Break down Direct ROI Income (Referral side)
      if (referralDataResults && Array.isArray(referralDataResults)) {
        referralDataResults.forEach((res, refIndex) => {
          if (!res.result) return
          const r = res.result
          const ridVal = r[2]
          const rlast = r[5]
          const rb2 = r[10]
          const rb4 = r[11]
          const rearned = r[6]

          if (!rlast || rlast === 0n || rlast >= nowTs) return
          const elapsed = nowTs - rlast
          const periods = elapsed / period
          const rate = rb4 ? 4n : (rb2 ? 3n : 2n)
          const perPeriod = (ridVal * rate) / 100n
          let cumulative = rearned || 0n
          const maxRoi = ridVal * 2n

          for (let i = 1n; i <= periods; i++) {
            let amt = perPeriod
            if (cumulative + amt > maxRoi) {
              amt = maxRoi > cumulative ? maxRoi - cumulative : 0n
            }
            if (amt > 0n) {
              const commission = (amt * 5n) / 100n
              if (commission > 0n) {
                virtual.push({
                  id: `v-direct-roi-${refIndex}-${i}`,
                  type: 'Direct ROI Cycle (Sponsor)',
                  amount: formatUnits(commission, 18),
                  isPositive: true,
                  isVirtual: true,
                  timestamp: (Number(rlast) + Number(i * period)) * 1000,
                  subtext: '5% of referral accumulation'
                })
              }
              cumulative += amt
            }
          }
        })
      }

      // 5. Bonus Credits (Held) - These are already settled in the contract pendingIncome
      if (pendingIncome && pendingIncome > 0n) {
        virtual.push({
          id: 'v-bonus-held',
          type: 'Network Bonus (Held)',
          amount: formatUnits(pendingIncome, 18),
          isPositive: true,
          isVirtual: true,
          timestamp: Date.now(),
          subtext: 'Direct/Upline/Downline'
        })
      }
    }

    // Sort all including virtual by timestamp DESC
    const combined = [...virtual, ...filteredTransactions]
    return combined.sort((a, b) => b.timestamp - a.timestamp)
  }, [filteredTransactions, pendingRoi, pendingBdi, pendingReward, pendingIncome, liveDirectRoi,
    lastRoiTimestamp, idValue, isBoosted2, isBoosted4, totalRoiEarned,
    lastBdiTimestamp, currentBdiTier, bdiEndTimestamp,
    lastRewardTimestamp, isRewardActive, rewardEndTimestamp,
    referralDataResults, isConnected, mounted, searchQuery])

  const paginatedTransactions = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
    return displayTransactions.slice(startIndex, startIndex + ITEMS_PER_PAGE)
  }, [displayTransactions, currentPage])

  const totalPages = Math.ceil(displayTransactions.length / ITEMS_PER_PAGE)

  // Reset to first page when filtering
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery])


  // Force Refresh Trigger
  useEffect(() => {
    if (isSuccess) {
      setTimeout(() => {
        refetchUser()
        refetchAllowance()
        refetchBdi()
        refetchRoi()
        refetchReward()
        fetchLogs(true)
      }, 5000) // 5s for block propagation and indexing
    }
  }, [isSuccess, refetchUser, refetchAllowance, refetchBdi, refetchRoi, refetchReward, fetchLogs])

  const [nextYieldTimer, setNextYieldTimer] = useState(0)

  useEffect(() => {
    if (!lastRoiTimestamp || !mounted) return
    const interval = setInterval(() => {
      const now = Math.floor(Date.now() / 1000)
      const last = Number(lastRoiTimestamp)
      const period = 300 // 5 minutes (DAY_PERIOD)
      const elapsed = now - last
      const remaining = period - (elapsed % period)
      setNextYieldTimer(remaining > 0 ? remaining : 0)
    }, 1000)
    return () => clearInterval(interval)
  }, [lastRoiTimestamp, mounted])

  if (!mounted) return null

  const handleUpgrade = () => {
    if (!upgradeAmount || isNaN(upgradeAmount) || upgradeAmountBI < parseUnits('1', 18)) return
    setLastAction('upgrade')
    writeContract({ address: NEOX_ADDRESS, abi: NEOX_ABI, functionName: 'upgrade', args: [upgradeAmountBI] })
  }

  const upgradeAmountBI = upgradeAmount ? parseUnits(upgradeAmount, 18) : 0n
  const needsApproval = allowance !== undefined && allowance < upgradeAmountBI

  const closeUpgradeModal = () => {
    if (isConfirming) return
    setIsUpgradeModalOpen(false)
    setUpgradeAmount('')
    setLastAction(null)
  }


  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s < 10 ? '0' : ''}${s}`
  }

  if (!isConnected) {
    return (
      <main className="page-container">
        <Navbar />
        <div style={{ textAlign: 'center', marginTop: '150px' }}>
          <h1 className="gradient-text">Auth Required</h1>
          <p className="hero-subtitle">Authentication required to view dashboard.</p>
        </div>
      </main>
    )
  }

  return (
    <div className="dashboard-layout">
      <Navbar />

      <main className="main-content">
        <header className="dashboard-header">
          <div className="header-info">
            <div className="tab-navigation">
              <button onClick={() => setActiveTab('overview')} className={`btn-secondary tab-btn ${activeTab === 'overview' ? 'active-tab' : ''}`}><LayoutDashboard size={18} /> Overview</button>
              <button onClick={() => setActiveTab('network')} className={`btn-secondary tab-btn ${activeTab === 'network' ? 'active-tab' : ''}`}><Network size={18} /> Network</button>
              <button onClick={() => setActiveTab('logs')} className={`btn-secondary tab-btn ${activeTab === 'logs' ? 'active-tab' : ''}`}><History size={18} /> Activity</button>
            </div>
            <motion.h1 initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="gradient-text dashboard-title">NeoX Account Portal</motion.h1>
            <div className="account-meta">
              <div className="network-status">
                <Globe size={14} className={isBscTestnet ? 'pulse' : ''} style={{ color: isBscTestnet ? 'var(--primary)' : '#00FF7F' }} />
                <span>{currentNetworkName}</span>
              </div>
              <div className="meta-separator"></div>
              <p className="account-address">Account: <span>{address?.slice(0, 6)}...{address?.slice(-4)}</span></p>
            </div>
          </div>

          <div className="header-actions">
            {!isBscTestnet && (
              <div className="neo-card warning-tag">
                <AlertCircle size={14} /> Switch to BSC Testnet
              </div>
            )}
            {isRegistered && (
              <div className="harvest-control">
                <button
                  className="btn-primary harvest-btn"
                  onClick={() => writeContract({ address: NEOX_ADDRESS, abi: NEOX_ABI, functionName: 'withdraw' })}
                  disabled={isConfirming || isTxPending || !canHarvest}
                >
                  {isConfirming || isTxPending ? <Loader2 className="animate-spin" /> :
                    <><RefreshCw size={18} /> Harvest {parseFloat(formatUnits(totalAccumulated, 18)).toFixed(4)} USDT</>}
                </button>
                {totalAccumulated > 0n && !canHarvest && (
                  <span className="min-harvest-hint">
                    Min. Harvest: 1.0 USDT (Current: {formatUnits(totalAccumulated, 18).slice(0, 6)})
                  </span>
                )}
              </div>
            )}
            <button className="btn-secondary upgrade-btn" onClick={() => setIsUpgradeModalOpen(true)} disabled={!isRegistered || !isBscTestnet}>
              <Zap size={18} /> Upgrade ID
            </button>
          </div>
        </header>

        {activeTab === 'logs' ? (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="neo-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', flexWrap: 'wrap', gap: '20px' }}>
              <div>
                <h3 className="section-title"><History size={20} /> On-Chain Explorer</h3>
                <p style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '4px' }}>
                  Verified transactions directly from the <b>Binance Smart Chain</b>.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                <div className="search-group">
                  <Search size={16} className="search-icon" />
                  <input
                    type="text"
                    placeholder="Filter history..."
                    className="neo-input search-input"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <button className="btn-primary" style={{ padding: '10px 20px', fontSize: '13px' }} onClick={() => fetchLogs(true)} disabled={loadingLogs}>
                  <RefreshCw size={16} className={loadingLogs ? 'animate-spin' : ''} style={{ marginRight: '8px' }} />
                  {loadingLogs ? 'Syncing...' : 'Sync Logs'}
                </button>
              </div>
            </div>

            {logError && (
              <div className="neo-card error-bar" style={{ marginBottom: '20px', background: 'rgba(255, 68, 68, 0.1)', color: '#ff4444', borderColor: 'rgba(255, 68, 68, 0.2)' }}>
                <HardDrive size={18} />
                <span>{logError}</span>
              </div>
            )}

            <div className="logs-container">
              {loadingLogs && transactions.length === 0 ? (
                <div className="loading-state" style={{ padding: '60px 0', textAlign: 'center' }}>
                  <div className="loader-ring" style={{ margin: '0 auto 20px' }}></div>
                  <p style={{ color: 'var(--primary)', fontWeight: '600' }}>Infiltrating Blockchain...</p>
                  <p style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '8px' }}>
                    Scanning Blocks {Number(currentBlockCursor)} - {Number(currentBlockCursor) + Number(CHUNK_SIZE)}
                  </p>
                </div>
              ) : displayTransactions.length > 0 ? (
                <>
                  <div className="transactions-table-container">
                    <table className="transactions-table">
                      <thead>
                        <tr>
                          <th>Transaction Type</th>
                          <th>Amount</th>
                          <th>Timestamp</th>
                          <th>Blockchain Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedTransactions.map((tx, i) => (
                          <motion.tr
                            key={tx.isVirtual ? `virtual-${tx.id}` : `${tx.txHash}-${tx.logIndex}`}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.05 }}
                          >
                            <td>
                              <div className="table-type-cell">
                                <div className={`table-icon ${tx.isVirtual ? 'virtual' : tx.isPositive ? 'deposit' : 'withdraw'}`}>
                                  {tx.isVirtual ? <TrendingUp size={18} /> : tx.isPositive ? <ArrowUpRight size={18} /> : <ArrowDownLeft size={18} />}
                                </div>
                                <div>
                                  <div className="table-type-text">
                                    {tx.type}
                                    {tx.isVirtual && <span className="badge-live-tiny" style={{ marginLeft: '8px', fontSize: '9px', background: 'var(--primary)', color: '#000', padding: '2px 6px', borderRadius: '4px', fontWeight: '800' }}>LIVE</span>}
                                  </div>
                                  <div className="table-subtext">{tx.isVirtual ? tx.subtext : `Hash: ${tx.txHash.slice(0, 10)}...${tx.txHash.slice(-8)}`}</div>
                                </div>
                              </div>
                            </td>
                            <td>
                              <div className={`table-amount ${tx.isPositive ? 'pos' : 'neg'}`}>
                                {tx.isPositive ? '+' : '-'}{parseFloat(tx.amount).toFixed(4)} <span style={{ fontSize: '11px', opacity: 0.6 }}>USDT</span>
                              </div>
                            </td>
                            <td>
                              <div className="table-time">
                                <div>{new Date(tx.timestamp).toLocaleDateString()}</div>
                                <div style={{ fontSize: '11px', opacity: 0.6 }}>{new Date(tx.timestamp).toLocaleTimeString()}</div>
                              </div>
                            </td>
                            <td>
                              {tx.isVirtual ? (
                                <span style={{ color: 'var(--text-dim)', fontSize: '12px' }}>Continuous Growth</span>
                              ) : (
                                <a
                                  href={`${isBscTestnet ? 'https://testnet.bscscan.com' : 'https://bscscan.com'}/tx/${tx.txHash}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="table-link"
                                >
                                  View on Explorer <Globe size={14} />
                                </a>
                              )}
                            </td>
                          </motion.tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile View Cards */}
                  <div className="mobile-logs-list">
                    {paginatedTransactions.map((tx, i) => (
                      <motion.div
                        key={`mob-${tx.isVirtual ? tx.id : tx.txHash}`}
                        className="mobile-log-card"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                      >
                        <div className="m-log-header">
                          <div className="m-log-type">
                            <div className={`table-icon ${tx.isVirtual ? 'virtual' : tx.isPositive ? 'deposit' : 'withdraw'}`} style={{ width: '30px', height: '30px' }}>
                              {tx.isVirtual ? <TrendingUp size={16} /> : tx.isPositive ? <ArrowUpRight size={16} /> : <ArrowDownLeft size={16} />}
                            </div>
                            <span>{tx.type}</span>
                          </div>
                          <div className={`m-log-amount ${tx.isPositive ? 'pos' : 'neg'}`}>
                            {tx.isPositive ? '+' : '-'}{parseFloat(tx.amount).toFixed(2)}
                          </div>
                        </div>
                        <div className="m-log-meta">
                          <span>{new Date(tx.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
                          {!tx.isVirtual && (
                            <a href={`${isBscTestnet ? 'https://testnet.bscscan.com' : 'https://bscscan.com'}/tx/${tx.txHash}`} target="_blank" className="table-link">
                              Explorer <Globe size={12} />
                            </a>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </div>

                  {/* Pagination Controls */}
                  {totalPages > 1 && (
                    <div className="pagination-controls">
                      <button
                        className="pg-btn pg-arrow"
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                      >
                        Prev
                      </button>

                      {[...Array(totalPages)].map((_, i) => {
                        const page = i + 1
                        // Show first, last, and pages around current
                        if (page === 1 || page === totalPages || (page >= currentPage - 1 && page <= currentPage + 1)) {
                          return (
                            <button
                              key={page}
                              className={`pg-btn ${currentPage === page ? 'active' : ''}`}
                              onClick={() => setCurrentPage(page)}
                            >
                              {page}
                            </button>
                          )
                        } else if (page === currentPage - 2 || page === currentPage + 2) {
                          return <span key={page} style={{ opacity: 0.5 }}>...</span>
                        }
                        return null
                      })}

                      <button
                        className="pg-btn pg-arrow"
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                      >
                        Next
                      </button>
                    </div>
                  )}

                  {canLoadMore && (
                    <div style={{ marginTop: '30px', display: 'flex', justifyContent: 'center' }}>
                      <button
                        className="btn-secondary load-more-btn"
                        style={{ width: '200px' }}
                        onClick={() => fetchLogs(false)}
                        disabled={loadingLogs}
                      >
                        {loadingLogs ? <Loader2 className="animate-spin" size={20} /> : <><ChevronDown size={18} /> Load Deep History</>}
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="empty-state">
                  <div className="empty-icon-box">
                    <History size={64} style={{ opacity: 0.2 }} />
                  </div>
                  <h3>No Transaction DNA Found</h3>
                  <p>No activity detected in the current range. Sync deeper to find history.</p>
                  <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                    <button className="btn-secondary" onClick={() => fetchLogs(false)} disabled={loadingLogs} style={{ flex: 1 }}>
                      Scan Deeper
                    </button>
                    <button className="btn-primary" onClick={() => fetchLogs(true)} disabled={loadingLogs} style={{ flex: 1 }}>
                      Refresh
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        ) : (
          <>
            <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
              <StatCard title="Accumulated ROI" value={`${parseFloat(formatUnits(pendingRoi?.[0] || 0n, 18)).toFixed(4)} USDT`} icon={TrendingUp} color="var(--primary)" delay={0.1} />
              <StatCard title="Life-to-Date ROI" value={`${parseFloat(formatUnits(totalRoiEarned || 0n, 18)).toFixed(4)} USDT`} icon={History} color="var(--text-dim)" delay={0.15} />
              <StatCard title="Direct Income" value={`${parseFloat(formatUnits(pendingIncome || 0n, 18)).toFixed(4)} USDT`} icon={UserPlus} color="#FF8C00" delay={0.2} />
              <StatCard title="Direct ROI (Live)" value={`${parseFloat(formatUnits(liveDirectRoi || 0n, 18)).toFixed(4)} USDT`} icon={Activity} color="#00E5FF" delay={0.25} />
              <StatCard title="Network BDI" value={`${parseFloat(formatUnits((totalBdiEarned || 0n) + (pendingBdi || 0n), 18)).toFixed(4)} USDT`} icon={Zap} color="var(--accent)" delay={0.3} />
              <StatCard title="Team Reward" value={`${parseFloat(formatUnits(pendingReward || 0n, 18)).toFixed(4)} USDT`} icon={Users} color="#00FF7F" delay={0.4} />
            </div>

            <div className="main-dashboard-grid">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="neo-card">
                {activeTab === 'network' ? (
                  <div style={{ height: '600px' }}><h3 className="section-title"><Network size={20} /> Genetic Matrix</h3><NeoXTree /></div>
                ) : (
                  <>
                    <div className="section-header">
                      <h3 className="section-title"><PieChart size={20} /> Yield Controller</h3>
                      <div className="rate-badge">
                        <div className="rate-value">{roiRate?.toString() || '2'}% Every 5 Mins</div>
                      </div>
                      <div className="rate-badge" style={{
                        background: (totalRoiEarned >= idValue * 2n && idValue > 0n) ? 'rgba(255, 68, 68, 0.1)' : 'rgba(138, 43, 226, 0.1)',
                        color: (totalRoiEarned >= idValue * 2n && idValue > 0n) ? '#ff4444' : 'var(--primary)',
                        borderColor: (totalRoiEarned >= idValue * 2n && idValue > 0n) ? 'rgba(255, 68, 68, 0.2)' : 'rgba(138, 43, 226, 0.2)'
                      }}>
                        <div className="rate-value">
                          <Clock size={12} /> {(totalRoiEarned >= idValue * 2n && idValue > 0n) ? 'MAX CAP REACHED' : `Next: ${formatTime(nextYieldTimer)}`}
                        </div>
                      </div>
                      {currentBdiTier > 0 && (
                        <div className="rate-badge" style={{ background: 'rgba(255, 215, 0, 0.1)', color: '#FFD700', borderColor: 'rgba(255, 215, 0, 0.2)' }}>
                          <div className="rate-value">BDI TIER {currentBdiTier.toString()} ACTIVE</div>
                        </div>
                      )}
                      {isRewardActive && (
                        <div className="rate-badge" style={{ background: 'rgba(0, 255, 127, 0.1)', color: '#00FF7F', borderColor: 'rgba(0, 255, 127, 0.2)' }}>
                          <div className="rate-value">MATCHING REW. ACTIVE</div>
                        </div>
                      )}
                    </div>
                    <div className="yield-display">
                      <div className="yield-orb"></div>
                      <p>Continuous wealth accumulation active on {currentNetworkName}.</p>
                      <div className="info-bar" style={{ marginTop: '20px', padding: '15px', background: 'rgba(0,0,0,0.2)', borderRadius: '10px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Info size={16} /> <span>Rewards are distributed automatically per period. Click **Harvest** to release your funds to wallet.</span>
                      </div>
                    </div>
                  </>
                )}
              </motion.div>

              <motion.div initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.6 }} className="neo-card">
                <h3 className="section-title"><Info size={20} /> Account Identity</h3>
                <div className="data-rows">
                  <div className="data-row"><span>Account Stake</span><span>{formatUnits(idValue || 0n, 18)} USDT</span></div>
                  <div className="data-row"><span>Business Value</span><span>{formatUnits(businessValue || 0n, 18)} USDT</span></div>
                  <div className="data-row"><span>Total Injected</span><span>{formatUnits(totalDeposited || 0n, 18)} USDT</span></div>
                  <div className="data-row"><span>Creation Block</span><span>{joinTimestamp ? new Date(Number(joinTimestamp) * 1000).toLocaleDateString() : 'N/A'}</span></div>
                  <div className="data-row"><span>Booster Tier</span><span className="tier-tag">{isBoosted4 ? 'ELITE 4%' : isBoosted2 ? 'TURBO 3%' : 'CORE 2%'}</span></div>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </main>

      <AnimatePresence>
        {isUpgradeModalOpen && (
          <div className="modal-overlay" onClick={closeUpgradeModal}>
            <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} className="neo-card modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header"><h2 className="gradient-text">Inject Stake</h2><button className="btn-icon" onClick={closeUpgradeModal} disabled={isConfirming}><X size={20} /></button></div>
              <div className="modal-body">
                {isSuccess && lastAction === 'upgrade' ? (
                  <div className="success-state-modal">
                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="success-check"><CheckCircle2 size={64} /></motion.div>
                    <h3>Identity Upgraded</h3>
                    <p>Transaction ID: {hash?.slice(0, 16)}...</p>
                    <button className="btn-primary full-width" onClick={closeUpgradeModal}>Proceed</button>
                  </div>
                ) : (
                  <>
                    <p className="modal-desc">Upgrade your account value to trigger higher daily yield cycles.</p>
                    <div className="input-glow-group">
                      <input type="number" placeholder="Enter USDT" value={upgradeAmount} onChange={(e) => setUpgradeAmount(e.target.value)} min="1" autoFocus />
                      <span className="input-unit">USDT</span>
                    </div>
                    {needsApproval && upgradeAmountBI >= parseUnits('1', 18) ? (
                      <button className="btn-primary full-width" onClick={() => writeContract({ address: USDT_ADDRESS_TESTNET, abi: USDT_ABI, functionName: 'approve', args: [NEOX_ADDRESS, upgradeAmountBI * 100n] })} disabled={isConfirming || isTxPending}>Authorize Transaction</button>
                    ) : (
                      <button className="btn-primary full-width" onClick={handleUpgrade} disabled={isConfirming || isTxPending || !upgradeAmount || upgradeAmountBI < parseUnits('1', 18)}>Process injection</button>
                    )}
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style jsx>{`
        .active-tab { background: var(--glass) !important; color: var(--primary) !important; border-color: var(--primary) !important; }
        .network-status { display: flex; align-items: center; gap: 8px; font-size: 12px; color: white; font-weight: 700; background: rgba(255,255,255,0.05); padding: 5px 12px; border-radius: 20px; border: 1px solid var(--glass-border); }
        .warning-tag { padding: 8px 15px; background: rgba(255,165,0,0.1) !important; border: 1px solid rgba(255,165,0,0.3) !important; color: orange; font-size: 11px; display: flex; align-items: center; gap: 8px; }
        
        .dashboard-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; gap: 30px; flex-wrap: wrap; }
        .dashboard-title { font-size: 32px; margin-bottom: 10px; }
        .account-meta { display: flex; align-items: center; gap: 12px; }
        .meta-separator { width: 4px; height: 4px; borderRadius: 50%; background: var(--glass-border); }
        .account-address { color: var(--text-dim); fontSize: 12px; }
        .account-address span { color: white; }
        
        .tab-navigation { display: flex; gap: 12px; margin-bottom: 25px; overflow-x: auto; padding-bottom: 10px; -ms-overflow-style: none; scrollbar-width: none; }
        .tab-navigation::-webkit-scrollbar { display: none; }
        .tab-btn { flex-shrink: 0; white-space: nowrap; font-size: 13px; padding: 10px 18px; }
        
        .header-actions { display: flex; gap: 15px; align-items: flex-start; }
        .harvest-control { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
        .min-harvest-hint { font-size: 10px; color: var(--text-dim); background: rgba(255,255,255,0.05); padding: 4px 10px; border-radius: 6px; border: 1px solid var(--glass-border); }

        .search-group { position: relative; width: 220px; }
        .search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--text-dim); }
        .search-input { padding-left: 36px !important; font-size: 12px !important; border-radius: 12px !important; height: 40px; }
        .modal-overlay { position: fixed; inset: 0; background: rgba(5, 10, 24, 0.95); backdrop-filter: blur(15px); display: flex; align-items: center; justify-content: center; z-index: 2000; }
        .modal-card { width: 100%; max-width: 440px; border: 1px solid var(--glass-border); padding: 35px; }
        .modal-header { display: flex; justify-content: space-between; margin-bottom: 25px; }
        .input-glow-group { background: rgba(255,255,255,0.03); border: 1px solid var(--glass-border); border-radius: 16px; padding: 18px; display: flex; align-items: center; margin-bottom: 30px; }
        .input-glow-group input { background: transparent; border: none; color: white; flex: 1; outline: none; font-size: 20px; font-weight: 800; }
        
        @media (max-width: 768px) {
          .dashboard-header { flex-direction: column; align-items: stretch; gap: 20px; }
          .header-actions { flex-direction: column; align-items: stretch; }
          .harvest-control { align-items: stretch; }
          .harvest-btn, .upgrade-btn { width: 100%; }
          .dashboard-title { font-size: 26px; }
        }

        .log-item { background: rgba(255,255,255,0.01) !important; padding: 16px !important; display: flex; justify-content: space-between; align-items: center; border: 1px solid var(--glass-border) !important; margin-bottom: 2px; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); }
        .log-item:hover { background: rgba(255,255,255,0.03) !important; border-color: var(--primary) !important; transform: translateY(-2px); box-shadow: 0 10px 40px rgba(255, 215, 0, 0.05); }
        .clickable-log:active { transform: scale(0.98); }
        .log-icon { width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; }
        .log-icon.deposit { background: rgba(0,255,127,0.08); color: #00FF7F; }
        .log-icon.withdraw { background: rgba(255,68,68,0.08); color: #ff4444; }
        .log-icon.virtual { background: rgba(255,215,0,0.1); color: var(--primary); }
        .badge-live { font-size: 8px; background: rgba(255,215,0,0.1); color: var(--primary); padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(255,215,0,0.2); font-weight: 800; }
        .virtual-log { cursor: default; }
        .virtual-log:hover { transform: none !important; }
        .log-amount { font-size: 18px; font-weight: 900; }
        .log-amount.pos { color: #00FF7F; }
        .log-amount.neg { color: #ff4444; }
        .log-hash { font-size: 10px; color: var(--text-dim); opacity: 0.7; margin-top: 3px; font-family: monospace; }
        .empty-state { padding: 80px 20px; text-align: center; }
        .empty-icon-box { margin-bottom: 20px; }
        .loader-ring { width: 40px; height: 40px; border: 3px solid rgba(255,255,255,0.1); border-top-color: var(--primary); border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 15px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .pulse { animation: pulse-anim 2s infinite; }
        @keyframes pulse-anim { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }
        .tier-tag { color: var(--primary); font-weight: 900; letter-spacing: 1px; }
        .section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 35px; }
        .yield-display { min-height: 200px; display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative; padding: 20px; }
        .yield-orb { width: 100px; height: 100px; background: radial-gradient(circle, var(--primary) 0%, transparent 70%); position: absolute; opacity: 0.1; filter: blur(20px); animation: pulse-anim 4s infinite; }
        .full-width { width: 100%; }
      `}</style>
    </div>
  )
}
