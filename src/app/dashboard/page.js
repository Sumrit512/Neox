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
  const [isSyncing, setIsSyncing] = useState(false)
  const [lastSyncTimestamp, setLastSyncTimestamp] = useState(Date.now())
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

  const { data: userData, refetch: refetchUserData, isLoading: isUserLoading } = useReadContract({
    address: NEOX_ADDRESS,
    abi: NEOX_ABI,
    functionName: 'users',
    args: [address],
    query: { enabled: !!address, gcTime: 0, staleTime: 0 }
  })

  // BULLETPROOF RECURSIVE LOG SCANNING
  const fetchLogs = useCallback(async (isInitial = true) => {
    if (!address || !publicClient) return;
    setLoadingLogs(true);
    setLogError(null);

    try {
      const latestBlock = await getBlockNumber(publicClient);

      // STABLE SCAN: 2,000,000 blocks back in chunks of 2,000
      const SCAN_DEPTH = 2000000n;
      const CHUNK = 2000n;

      // Use joinTimestamp as a more efficient stop-point if available
      let joinBlock = 0n;
      if (joinTimestamp && joinTimestamp > 0n) {
          // Approximate block: (now - join) / 3s per block
          const now = BigInt(Math.floor(Date.now() / 1000));
          const diff = now - BigInt(joinTimestamp);
          joinBlock = latestBlock - (diff / 3n) - 5000n; // 5k block buffer
          if (joinBlock < 0n) joinBlock = 0n;
      }

      const targetBlock = joinBlock > 0n ? joinBlock : (latestBlock > SCAN_DEPTH ? latestBlock - SCAN_DEPTH : 0n);
      let currentTo = latestBlock;
      let allRawLogs = [];
      let joinFound = false;

      const eventNames = ['Joined', 'Upgraded', 'Withdrawn', 'IncomeReceived'];

      // RECURSIVE SCANNER: Smaller splits and higher resilience
      const deepScan = async (name, from, to) => {
        try {
          const eventObj = NEOX_ABI.find(x => x.name === name);
          const logs = await getLogs(publicClient, {
            address: NEOX_ADDRESS,
            event: eventObj,
            args: { user: address },
            fromBlock: from,
            toBlock: to
          });
          if (name === 'Joined' && logs.length > 0) joinFound = true;
          return logs;
        } catch (err) {
          if ((to - from) > 20n) { // Smarter splitting
            const mid = from + (to - from) / 2n;
            const h1 = await deepScan(name, from, mid);
            await new Promise(r => setTimeout(r, 50)); // Breathe
            const h2 = await deepScan(name, mid + 1n, to);
            return [...h1, ...h2];
          }
          return [];
        }
      };

      console.log(`[NeoX] Optimized Sync: ${latestBlock} down to ${targetBlock}`);

      // SEQUENTIAL CHUNK LOOP: Don't hammer the RPC in parallel
      while (currentTo > targetBlock && !joinFound) {
        let currentFrom = currentTo > CHUNK ? currentTo - CHUNK : 0n;
        if (currentFrom < targetBlock) currentFrom = targetBlock;

        console.log(`[NeoX] Chunk: ${currentFrom} to ${currentTo}`);
        
        // Use sequential for events to prevent "Connection Closed"
        for (const name of eventNames) {
            const result = await deepScan(name, currentFrom, currentTo);
            allRawLogs = [...allRawLogs, ...result];
            if (joinFound) break;
            await new Promise(r => setTimeout(r, 30)); // Small RPC gap
        }

        currentTo = currentFrom - 1n;
      }

      const allRaw = allRawLogs;

      // 3. FETCH UNIQUE BLOCK TIMESTAMPS (Controlled Batching)
      const uniqueBlocks = [...new Set(allRaw.map(log => log.blockNumber))];
      const blockTimestamps = new Map();

      const batchSize = 10; // Smaller batches for stability
      for (let i = 0; i < uniqueBlocks.length; i += batchSize) {
        const batch = uniqueBlocks.slice(i, i + batchSize);
        await Promise.all(batch.map(async (bn) => {
          try {
            const block = await publicClient.getBlock({ blockNumber: bn });
            blockTimestamps.set(bn, Number(block.timestamp) * 1000);
          } catch (e) {
            console.error(`[NeoX] Block timestamp fetch fail: ${bn}`, e);
            blockTimestamps.set(bn, Date.now());
          }
        }));
      }

      const formatted = allRaw.map(log => {
        const { eventName, args } = log;
        let type = eventName;
        let amount = formatUnits(args.amount || 0n, 18);
        let isPositive = true;

        if (eventName === 'Joined') {
          type = 'ID Subscription'; amount = '10'; isPositive = false;
        } else if (eventName === 'IncomeReceived') {
          type = args.typeOfIncome || 'Network Income'; isPositive = true;
        } else if (eventName === 'Upgraded') {
          type = 'Injection'; isPositive = false;
        } else if (eventName === 'Withdrawn') {
          type = 'Withdrawal'; isPositive = false;
        }

        const txid = log.transactionHash || log.txHash || log.hash;
        if (eventName === 'Joined') console.log("[NeoX] Found Joined Event with Hash:", txid);

        return {
          id: `${txid || 'unknown'}-${log.logIndex}`,
          type,
          amount,
          isPositive,
          txHash: txid,
          blockNumber: Number(log.blockNumber),
          logIndex: log.logIndex,
          timestamp: blockTimestamps.get(log.blockNumber) || Date.now(),
          isReal: true,
          isVirtual: false // CRITICAL: Explicitly mark as NOT virtual
        };
      });

      setTransactions(prev => {
        const combined = isInitial ? formatted : [...prev, ...formatted];
        // SORT: Higher blocks first, then higher log index (order of appearance)
        const sorted = combined.sort((a, b) => {
          if (b.blockNumber !== a.blockNumber) return b.blockNumber - a.blockNumber;
          return (b.logIndex || 0) - (a.logIndex || 0);
        });

        const unique = new Map();
        sorted.forEach(t => unique.set(t.id, t));
        return Array.from(unique.values());
      });

      setCurrentBlockCursor(targetBlock);
      setCanLoadMore(targetBlock > 0n);
      if (isInitial) isInitialLoad.current = false;

    } catch (error) {
      console.error('[NeoX] History Sync Error:', error);
      setLogError("Network sync timed out. Deep scanning paused.");
    } finally {
      setLoadingLogs(false);
    }
  }, [address, publicClient, currentBlockCursor, userData])

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
    query: { enabled: !!address, refetchInterval: 30000, gcTime: 0, staleTime: 0 } // Poll every 30s
  })

  const { data: pendingRoi, refetch: refetchRoi } = useReadContract({
    address: NEOX_ADDRESS,
    abi: NEOX_ABI,
    functionName: 'pendingRoiIncome',
    args: [address],
    query: { enabled: !!address, refetchInterval: 30000, gcTime: 0, staleTime: 0 } // Poll every 30s
  })

  const { data: pendingReward, refetch: refetchReward } = useReadContract({
    address: NEOX_ADDRESS,
    abi: NEOX_ABI,
    functionName: 'pendingRewardIncome',
    args: [address],
    query: { enabled: !!address, refetchInterval: 30000, gcTime: 0, staleTime: 0 } // Poll every 30s
  })

  const { data: roiRate, refetch: refetchRoiRate } = useReadContract({
    address: NEOX_ADDRESS,
    abi: NEOX_ABI,
    functionName: 'getRoiRate',
    args: [address],
    query: { enabled: !!address, gcTime: 0, staleTime: 0 }
  })

  const handleManualSync = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    console.log("[NeoX] --- Manual Sync Started ---");
    try {
      // We manually log the refetch results to see if they actually change
      const [u, b, r, rw, rt] = await Promise.all([
        refetchUserData(),
        refetchBdi(),
        refetchRoi(),
        refetchReward(),
        refetchRoiRate()
      ]);
      
      console.log("[NeoX] User Data Refetched:", u?.data);
      console.log("[NeoX] ROI Refetched:", r?.data);
      
      await fetchLogs(true);
      setLastSyncTimestamp(Date.now());
      console.log("[NeoX] --- Manual Sync Complete ---");
    } catch (err) {
      console.error("[NeoX] Manual Sync Failed:", err);
    } finally {
      setTimeout(() => setIsSyncing(false), 1200); // 1.2s spin for clear visual feedback
    }
  }, [refetchUserData, refetchBdi, refetchRoi, refetchReward, refetchRoiRate, fetchLogs, isSyncing]);

  const liveRoi = useMemo(() => {
    if (!userData || !mounted) return 0n
    const last = userData[5]
    const idVal = userData[2]
    const earned = userData[6]
    const now = BigInt(Math.floor(Date.now() / 1000))
    const period = 60n // 1 minute

    if (!last || last === 0n || last >= now || idVal === 0n) return 0n

    const timePassed = now - last
    const periods = timePassed / period
    if (periods <= 0n) return 0n

    const rate = userData[11] ? 4n : (userData[10] ? 3n : 2n)
    const boostedStakeVar = userData[28] || 0n
    const boostedRoi = (boostedStakeVar * rate * periods) / 100n
    const standardRoi = ((idVal - boostedStakeVar) * 2n * periods) / 100n
    let roi = boostedRoi + standardRoi

    const maxRoi = idVal * 2n
    if (earned + roi > maxRoi) {
      roi = maxRoi > earned ? maxRoi - earned : 0n
    }
    return roi
  }, [userData, mounted, lastSyncTimestamp])

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

  const { data: level1UnlockTimestamp } = useReadContract({
    address: NEOX_ADDRESS,
    abi: NEOX_ABI,
    functionName: 'levelUnlockTimestamps',
    args: [address, 1n],
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
    if (!referralDataResults || !Array.isArray(referralDataResults) || !level1UnlockTimestamp || level1UnlockTimestamp === 0n) return 0n
    let totalLiveDirectRoi = 0n
    const now = BigInt(Math.floor(Date.now() / 1000))
    const period = 60n // 1 minute (DAY_PERIOD)
    const myUnlock = BigInt(level1UnlockTimestamp)

    referralDataResults.forEach(res => {
      if (!res.result) return
      const r = res.result
      const idVal = r[2]
      const last = r[5]
      const b2 = r[10]
      const b4 = r[11]
      const earned = r[6]

      if (!last || last === 0n || last >= now) return

      const startTime = last
      const endTime = now

      // Proportional math: Only cycles where I was already qualified
      const effectiveStart = myUnlock > startTime ? myUnlock : startTime
      if (endTime <= effectiveStart) return

      const timePassed = endTime - effectiveStart
      const periods = timePassed / period
      if (periods <= 0n) return

      // We also need the total periods for the referral to calculate the base ROI correctly
      const totalElapsed = endTime - startTime
      const totalPeriods = totalElapsed / period
      if (totalPeriods <= 0n) return

      const rate = b4 ? 4n : b2 ? 3n : 2n
      const boostedStake = r[28] || 0n
      const boostedPerPeriod = (boostedStake * rate) / 100n
      const standardPerPeriod = ((idVal - boostedStake) * 2n) / 100n
      const perPeriodRoi = boostedPerPeriod + standardPerPeriod
      let roi = perPeriodRoi * periods

      // 1. Referral's Personal ROI Cap (2x)
      const maxRoi = idVal * 2n
      const totalAccruingRoi = perPeriodRoi * totalPeriods
      if (earned + totalAccruingRoi > maxRoi) {
        const remainingSpace = maxRoi > earned ? maxRoi - earned : 0n
        roi = (remainingSpace * periods) / totalPeriods
      }

      // 2. MY Global Cap (4x)
      const myMaxGlobal = userData[2] * 4n
      const myTotalCapped = userData[27] // totalCappedIncome
      const myRemainingGlobal = myMaxGlobal > myTotalCapped ? myMaxGlobal - myTotalCapped : 0n

      const myBonus = (roi * 5n) / 100n
      if (totalLiveDirectRoi + myBonus > myRemainingGlobal) {
        const finalBonus = myRemainingGlobal > totalLiveDirectRoi ? myRemainingGlobal - totalLiveDirectRoi : 0n
        totalLiveDirectRoi += finalBonus
      } else {
        totalLiveDirectRoi += myBonus
      }
    })
    return totalLiveDirectRoi
  }, [referralDataResults, level1UnlockTimestamp, userData, lastSyncTimestamp])

  const { writeContract, data: hash, isPending: isTxPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  // Data Parsing Logic - MUST BE BEFORE EFFECTS AND MEMOS
  const userDataArray = userData || [false, '0x...', 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, false, false, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, false, 0n, 0n, 0n, false, false, 0n, 0n, 0n, 0n]

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
    isRewardActive: userDataArray[21],
    totalDirectEarned: userDataArray[22],
    totalQualifiedDirects: userDataArray[23],
    boosterQualifiedDirects: userDataArray[24],
    isQualified100: userDataArray[25],
    isQualifiedBooster: userDataArray[26],
    totalCappedIncome: userDataArray[27],
    boostedStake: userDataArray[28] // Note: Contract now correctly reports 29 fields in ABI
  } : userDataArray

  const {
    isRegistered, sponsor, idValue, totalDeposited, joinTimestamp,
    lastRoiTimestamp, totalRoiEarned, pendingIncome, directReferrals,
    businessValue, isBoosted2, isBoosted4,
    bdiStartTime, lastBdiTimestamp, currentBdiTier, bdiEndTimestamp, totalBdiEarned,
    maxLegBusiness, lastRewardTimestamp, rewardEndTimestamp, totalRewardEarned, isRewardActive,
    totalDirectEarned, totalQualifiedDirects, boosterQualifiedDirects, isQualified100, isQualifiedBooster,
    totalCappedIncome, boostedStake
  } = u

  const isMaxRoiReached = useMemo(() => {
    if (!idValue || idValue === 0n) return false;
    const maxRoi = idValue * 2n;
    const earned = totalRoiEarned || 0n;
    const currentAccruing = liveRoi || 0n;
    return (earned + currentAccruing) >= maxRoi;
  }, [idValue, totalRoiEarned, liveRoi]);

  const isGlobalCapReached = useMemo(() => {
    if (!idValue || idValue === 0n) return false;
    const maxGlobal = idValue * 4n;
    const current = totalCappedIncome || 0n;
    return (current + (liveRoi || 0n) + (liveDirectRoi || 0n)) >= maxGlobal;
  }, [idValue, totalCappedIncome, liveRoi, liveDirectRoi]);

  const totalAccumulated =
    BigInt(pendingIncome || 0n) +
    BigInt(pendingBdi || 0n) +
    BigInt(pendingReward || 0n) +
    BigInt(liveDirectRoi || 0n) +
    BigInt(liveRoi || 0n)

  // GRANULAR BALANCE BREAKDOWN: Identify how much of 'pendingIncome' belongs to each category
  const settledBreakdown = useMemo(() => {
    const defaultRes = { roi: 0n, bdi: 0n, matching: 0n, direct: 0n, directRoi: 0n };
    const breakdown = { ...defaultRes };
    let identified = 0n;

    if (transactions && transactions.length > 0) {
      // Find latest Withdrawal event to calculate current balance breakdown
      const lastWithdrawal = [...transactions]
        .filter(tx => tx.type === 'Withdrawal' && tx.isReal)
        .sort((a, b) => {
          if (b.blockNumber !== a.blockNumber) return b.blockNumber - a.blockNumber;
          return (b.logIndex || 0) - (a.logIndex || 0);
        })[0];

      const currentLogs = transactions.filter(tx => {
        if (!tx.isReal) return false;
        if (!lastWithdrawal) return true;

        // Only include logs that occurred AFTER the last withdrawal
        if (tx.blockNumber > lastWithdrawal.blockNumber) return true;
        if (tx.blockNumber === lastWithdrawal.blockNumber && (tx.logIndex || 0) > (lastWithdrawal.logIndex || 0)) return true;
        return false;
      });

      currentLogs.forEach(tx => {
        const amt = parseUnits(tx.amount || '0', 18);
        if (tx.type.includes('ROI')) {
          breakdown.roi += amt;
          identified += amt;
        } else if (tx.type.includes('Business') || tx.type.includes('BDI')) {
          breakdown.bdi += amt;
          identified += amt;
        } else if (tx.type.includes('Team') || tx.type.includes('Matching')) {
          breakdown.matching += amt;
          identified += amt;
        } else if (tx.type.includes('Direct')) {
          breakdown.direct += amt;
          identified += amt;
        } else if (tx.type.includes('Bonus')) {
          breakdown.directRoi += amt;
          identified += amt;
        }
      });
    }

    // REFINED FALLBACK LOGIC:
    // Any unaccounted balance in pendingIncome is first attributed to ROI (up to the cap),
    // then to Direct Income as a catch-all. 
    // This ensures the dashboard reflects the user's likely earnings when logs are incomplete.
    const pendingIncBI = BigInt(pendingIncome || 0n);
    let unaccounted = pendingIncBI > identified ? (pendingIncBI - identified) : 0n;

    if (unaccounted > 0n) {
      const maxRoi = (idValue || 0n) * 2n;
      // We want the ROI card to show: Pending accruing + any unaccounted logs that belong to ROI.
      // But we shouldn't exceed the max ROI in total for the account.
      // The total previously settled + withdrawn ROI is `totalRoiEarned`.
      // The space left to assign unallocated balance to ROI is: maxRoi - (totalRoiEarned - pendingIncBI)
      // wait, `totalRoiEarned` INCLUDES `pendingIncome` related to ROI.
      // So if `totalRoiEarned` == `maxRoi` (40 USDT), then ALL of that ROI is either in `pendingIncome` or withdrawn.
      // How much of the CURRENT pendingIncome belongs to ROI? 
      // It should be whatever is needed to reach `totalRoiEarned` when combined with past withdrawals.
      // Easiest approach: The "Accumulated ROI" card shows `breakdown.roi`.
      // The absolute maximum the card should ever show is `maxRoi`.
      // Currently the card displays `pendingRoi?.[0] + breakdown.roi`.

      const accruing = pendingRoi?.[0] || 0n;
      const currentDisplayedRoi = accruing + breakdown.roi;

      // If we haven't displayed the full maxRoi on the card *and* it hasn't been withdrawn already..
      // Actually, if they haven't withdrawn ANY ROI, the card should show 40 USDT exactly.
      // The space left to show on the card *right now* is `totalRoiEarned` (which is the true total they have ever earned) 
      // MINUS what we have already identified as ROI in the logs + what's accruing.
      // IF totalRoiEarned is 40.0, and they haven't withdrawn, we want the card to show 40.0.

      // The true amount of ROI resting in the pending balance *must* be:
      // totalRoiEarned - (sum of all past ROI withdrawals)
      // Since tracking past withdrawals perfectly might be tricky if logs are missing, 
      // a safe proxy for "How much ROI is currently pending?" is to look at how much space 
      // is left in the total pending balance that *could* be ROI.

      // Let's assume as much of the unaccounted balance is ROI as possible, up to `totalRoiEarned`.
      const roiInPendingSafe = totalRoiEarned > breakdown.roi ? totalRoiEarned - breakdown.roi : 0n;

      const toAddRoi = unaccounted > roiInPendingSafe ? roiInPendingSafe : unaccounted;
      breakdown.roi += toAddRoi;
      unaccounted -= toAddRoi;

      // Everything else goes to Direct
      breakdown.direct += unaccounted;
    }

    return breakdown;
  }, [transactions, pendingIncome, idValue, pendingRoi, totalRoiEarned]);

  const canHarvest = totalAccumulated >= parseUnits('10', 18)

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
    const period = 60n // 1 minute

    // Real logs are already processed in fetchLogs
    const processedLogs = filteredTransactions

    if (isConnected && mounted) {
      // 2. Genesis record
      const hasRealJoin = transactions.some(tx => tx.type === 'ID Subscription' && tx.isReal)
      const joinTs = joinTimestamp ? BigInt(joinTimestamp) : 0n
      if (!hasRealJoin && joinTs > 0n) {
        virtual.push({
          txHash: null,
          type: 'ID Subscription',
          amount: '10',
          isPositive: false,
          isVirtual: true,
          id: 'v-genesis-join',
          timestamp: Number(joinTs) * 1000,
          subtext: 'Account Activation [Verified]'
        })
      }

      // 3. Current Live Accumulation (Virtual)
      const currentRoiEarned = totalRoiEarned || 0n
      const maxRoi = idValue * 2n

      if (lastRoiTimestamp && lastRoiTimestamp > 0n && idValue > 0n && currentRoiEarned < maxRoi) {
        const rate = isBoosted4 ? 4n : (isBoosted2 ? 3n : 2n)
        const bStake = BigInt(boostedStake || 0n)
        const boostedPerPeriod = (bStake * rate) / 100n
        const standardPerPeriod = ((idValue - bStake) * 2n) / 100n
        const perPeriod = boostedPerPeriod + standardPerPeriod
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
              type: 'ROI Accumulation (Live)',
              amount: formatUnits(amt, 18),
              isPositive: true,
              isVirtual: true,
              timestamp: (Number(lastRoiTimestamp) + Number(i * period)) * 1000,
              subtext: `Live Sync: ${rate}%/period`
            })
            cumulative += amt
          }
        }
      }

      // 4. Virtual Direct ROI Accumulation (Live)
      if (referralDataResults && Array.isArray(referralDataResults) && level1UnlockTimestamp && level1UnlockTimestamp > 0n) {
        const myUnlock = BigInt(level1UnlockTimestamp)

        referralDataResults.forEach((res, refIdx) => {
          if (!res.result) return
          const r = res.result
          const refAddr = referralAddrs[refIdx]
          const refIdVal = r[2]
          const refLast = r[5]
          const refB2 = r[10]
          const refB4 = r[11]
          const refEarned = r[6]
          const refMax = refIdVal * 2n

          if (refLast && refLast > 0n && refIdVal > 0n && refEarned < refMax) {
            const refRate = refB4 ? 4n : (refB2 ? 3n : 2n)
            const refBoostedStake = r[28] || 0n
            const boostedPerPeriod = (refBoostedStake * refRate) / 100n
            const standardPerPeriod = ((refIdVal - refBoostedStake) * 2n) / 100n
            const refPerPeriod = boostedPerPeriod + standardPerPeriod
            const refElapsed = nowTs - refLast
            const refPeriodsCount = refElapsed / period
            let refCumulative = refEarned

            for (let i = 1n; i <= refPeriodsCount; i++) {
              let refAmt = refPerPeriod
              if (refCumulative + refAmt > refMax) {
                refAmt = refMax > refCumulative ? refMax - refCumulative : 0n
              }

              const cycleTs = Number(refLast) + Number(i * period)

              // Only add virtual entry if I was qualified during this cycle
              if (refAmt > 0n && BigInt(cycleTs) >= myUnlock) {
                const myBonusAmt = (refAmt * 5n) / 100n
                if (myBonusAmt > 0n) {
                  virtual.push({
                    id: `v-direct-roi-${refAddr}-${i}`,
                    type: 'Direct ROI (Live)',
                    amount: formatUnits(myBonusAmt, 18),
                    isPositive: true,
                    isVirtual: true,
                    timestamp: cycleTs * 1000,
                    subtext: `From: ${refAddr.slice(0, 6)}...${refAddr.slice(-4)}`
                  })
                }
              }
              refCumulative += refAmt
            }
          }
        })
      }

      // 5. Detailed "Held" Rewards Breakdown
      // Instead of one big bar, we show individual pending rewards
      if (pendingRoi && pendingRoi[0] > 0n) {
        virtual.push({
          id: 'v-pending-roi',
          type: 'ROI Accumulated (Held)',
          amount: formatUnits(pendingRoi[0], 18),
          isPositive: true,
          isVirtual: true,
          timestamp: Date.now() + 500,
          subtext: 'Stored in vault, ready to harvest'
        })
      }
      if (pendingIncome && pendingIncome > 0n) {
        virtual.push({
          id: 'v-pending-income',
          type: 'Network Bonus (Held)',
          amount: formatUnits(pendingIncome, 18),
          isPositive: true,
          isVirtual: true,
          timestamp: Date.now() + 400,
          subtext: 'Direct/Upline/Team rewards'
        })
      }
      if (pendingBdi && pendingBdi > 0n) {
        virtual.push({
          id: 'v-pending-bdi',
          type: 'BDI Growth (Held)',
          amount: formatUnits(pendingBdi, 18),
          isPositive: true,
          isVirtual: true,
          timestamp: Date.now() + 300,
          subtext: 'Network achievement bonus'
        })
      }
      if (pendingReward && pendingReward > 0n) {
        virtual.push({
          id: 'v-pending-match',
          type: 'Team Reward (Held)',
          amount: formatUnits(pendingReward, 18),
          isPositive: true,
          isVirtual: true,
          timestamp: Date.now() + 200,
          subtext: 'Matching reward bonus'
        })
      }
    }

    const combined = [...virtual, ...processedLogs]
    return combined.sort((a, b) => b.timestamp - a.timestamp)
  }, [filteredTransactions, pendingRoi, pendingBdi, pendingReward, pendingIncome, liveDirectRoi,
    lastRoiTimestamp, idValue, isBoosted2, isBoosted4, totalRoiEarned,
    lastBdiTimestamp, currentBdiTier, bdiEndTimestamp,
    lastRewardTimestamp, isRewardActive, rewardEndTimestamp,
    referralDataResults, isConnected, mounted, searchQuery, transactions, joinTimestamp, boostedStake])

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
        refetchUserData()
        refetchAllowance()
        refetchBdi()
        refetchRoi()
        refetchReward()
        fetchLogs(true)
      }, 5000) // 5s for block propagation and indexing
    }
  }, [isSuccess, refetchUserData, refetchAllowance, refetchBdi, refetchRoi, refetchReward, fetchLogs])

  const [nextYieldTimer, setNextYieldTimer] = useState(0)

  useEffect(() => {
    if (!lastRoiTimestamp || !mounted || isMaxRoiReached) {
      setNextYieldTimer(0);
      return;
    }
    const interval = setInterval(() => {
      const now = Math.floor(Date.now() / 1000)
      const last = Number(lastRoiTimestamp)
      const period = 60 // 1 minute (DAY_PERIOD)
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
      <style jsx global>{`
        .animate-spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
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
              <>
                <button 
                  className="btn-secondary sync-btn" 
                  onClick={handleManualSync} 
                  disabled={isSyncing}
                  style={{ height: '44px', padding: '0 15px', display: 'flex', alignItems: 'center' }}
                >
                  <motion.div
                    animate={{ rotate: isSyncing ? 360 : 0 }}
                    transition={{ duration: 1, repeat: isSyncing ? Infinity : 0, ease: "linear" }}
                    style={{ display: 'flex', marginRight: '8px' }}
                  >
                    <RefreshCw size={18} />
                  </motion.div>
                  Sync
                </button>
                <div className="harvest-control">
                  <button
                    className="btn-primary harvest-btn"
                    onClick={() => writeContract({ address: NEOX_ADDRESS, abi: NEOX_ABI, functionName: 'withdraw' })}
                    disabled={isConfirming || isTxPending || !canHarvest}
                  >
                    {isConfirming || isTxPending ? <Loader2 className="animate-spin" /> :
                      <><ArrowDownLeft size={18} /> Withdraw {parseFloat(formatUnits(totalAccumulated, 18)).toFixed(4)} USDT</>}
                  </button>
                  {totalAccumulated > 0n && !canHarvest && (
                    <span className="min-harvest-hint">
                      Min. Withdraw: 10.0 USDT (Current: {formatUnits(totalAccumulated, 18).slice(0, 6)})
                    </span>
                  )}
                </div>
              </>
            )}
            <button className="btn-secondary upgrade-btn" onClick={() => setIsUpgradeModalOpen(true)} disabled={!isRegistered || !isBscTestnet}>
              <Zap size={18} /> Upgrade ID
            </button>
          </div>
        </header>

        {activeTab === 'logs' ? (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="neo-card logs-card-section">
            <div className="logs-header-wrap">
              <div className="logs-title-area">
                <h3 className="section-title"><History size={20} /> On-Chain Explorer</h3>
                <p className="logs-subtitle">
                  Verified transactions directly from the <b>Binance Smart Chain</b>.
                </p>
              </div>

              <div className="logs-actions-area">
                <div className="search-group logs-search">
                  <Search size={16} className="search-icon" />
                  <input
                    type="text"
                    placeholder="Filter history..."
                    className="neo-input search-input"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <button className="btn-primary logs-sync-btn" onClick={() => fetchLogs(true)} disabled={loadingLogs}>
                  <RefreshCw size={16} className={loadingLogs ? 'animate-spin' : ''} />
                  <span>{loadingLogs ? 'Syncing...' : 'Sync Logs'}</span>
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
                            key={tx.id}
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
                                  <div className="table-subtext">{tx.subtext || (tx.txHash ? `Hash: ${tx.txHash.slice(0, 10)}...${tx.txHash.slice(-8)}` : 'Verified On-Chain')}</div>
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
                                <div style={{ fontWeight: '600' }}>
                                  {new Date(tx.timestamp).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' })}
                                </div>
                                <div style={{ fontSize: '11px', opacity: 0.7, color: 'var(--primary)' }}>
                                  {new Date(tx.timestamp).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
                                </div>
                              </div>
                            </td>
                            <td>
                              {tx.txHash ? (
                                <a
                                  href={`${isBscTestnet ? 'https://testnet.bscscan.com' : 'https://bscscan.com'}/tx/${tx.txHash}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="table-link"
                                >
                                  View on Explorer <Globe size={14} />
                                </a>
                              ) : (
                                <span style={{ color: 'var(--text-dim)', fontSize: '12px' }}>Continuous Growth</span>
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
                        key={`mob-${tx.id}`}
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
                          <span style={{ color: 'var(--primary)', fontWeight: '600' }}>
                            {new Date(tx.timestamp).toLocaleString('en-IN', {
                              timeZone: 'Asia/Kolkata',
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                              hour12: true
                            })}
                          </span>
                          {tx.txHash && (
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

                  {/* Pagination Controls moved/handled above */}
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
              <StatCard
                title="Accumulated ROI"
                value={`${parseFloat(formatUnits((totalRoiEarned || 0n) + (liveRoi || 0n), 18)).toFixed(4)} USDT`}
                icon={TrendingUp}
                color="var(--primary)"
                delay={0.1}
              />
              <StatCard
                title="Direct Income"
                value={`${parseFloat(formatUnits(totalDirectEarned || 0n, 18)).toFixed(4)} USDT`}
                icon={UserPlus}
                color="#FF8C00"
                delay={0.2}
              />
              <StatCard
                title="Direct ROI Bonuses"
                value={`${parseFloat(formatUnits((totalCappedIncome || 0n) - (totalRoiEarned || 0n) - (totalDirectEarned || 0n) + (liveDirectRoi || 0n), 18)).toFixed(4)} USDT`}
                icon={Activity}
                color="#00E5FF"
                delay={0.25}
              />
              <StatCard
                title="Network BDI"
                value={`${parseFloat(formatUnits((totalBdiEarned || 0n) + BigInt(pendingBdi || 0n), 18)).toFixed(4)} USDT`}
                icon={Zap}
                color="var(--accent)"
                delay={0.3}
              />
              <StatCard
                title="Team Rewards"
                value={`${parseFloat(formatUnits((totalRewardEarned || 0n) + BigInt(pendingReward || 0n), 18)).toFixed(4)} USDT`}
                icon={Users}
                color="#00FF7F"
                delay={0.4}
              />
            </div>

            <div className={activeTab === 'network' ? "network-view-container" : "main-dashboard-grid"}>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className={`neo-card ${activeTab === 'network' ? 'network-card-expanded' : ''}`}>
                {activeTab === 'network' ? (
                  <div className="network-flow-wrapper">
                    <div className="section-header">
                      <h3 className="section-title"><Network size={20} /> Genetic Matrix</h3>
                      <div className="network-status">
                        <div className="pulse-dot"></div>
                        <span>LIVE ON-CHAIN VISUALIZATION</span>
                      </div>
                    </div>
                    <div className="tree-container">
                      <NeoXTree />
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="section-header">
                      <h3 className="section-title"><PieChart size={20} /> Yield Controller</h3>
                      <div className="rate-badge">
                        <div className="rate-value">{roiRate?.toString() || '2'}% Every 1 Min</div>
                      </div>
                      <div className="rate-badge" style={{
                        background: isMaxRoiReached ? 'rgba(255, 68, 68, 0.1)' : 'rgba(138, 43, 226, 0.1)',
                        color: isMaxRoiReached ? '#ff4444' : 'var(--primary)',
                        borderColor: isMaxRoiReached ? 'rgba(255, 68, 68, 0.2)' : 'rgba(138, 43, 226, 0.2)'
                      }}>
                        <div className="rate-value">
                          <Clock size={12} /> {isMaxRoiReached ? 'MAX CAP REACHED' : `Next: ${formatTime(nextYieldTimer)}`}
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
                    <div className="cap-progress-group">
                      {/* ROI Cap Progress */}
                      <div className="cap-card">
                        <div className="cap-label-row">
                          <span className="cap-label">ROI Yield Cap (2x)</span>
                          <span className="cap-value" style={{
                            color: Number(idValue) > 0 && (Number(totalRoiEarned + (liveRoi || 0n)) / Number(idValue * 2n)) >= 0.9 ? '#ff4d4d' : 'var(--primary)'
                          }}>
                            {Number(idValue) > 0 ? ((Number(totalRoiEarned + (liveRoi || 0n)) / Number(idValue * 2n)) * 100).toFixed(1) : '0'}%
                          </span>
                        </div>
                        <div className="cap-bar-bg">
                          <div
                            className="cap-bar-fill"
                            style={{
                              width: `${Math.min(100, Number(idValue) > 0 ? (Number(totalRoiEarned + (liveRoi || 0n)) / Number(idValue * 2n)) * 100 : 0)}%`,
                              background: 'linear-gradient(90deg, #FFD700, #B8860B)',
                              boxShadow: '0 0 10px rgba(255, 215, 0, 0.4)'
                            }}
                          />
                        </div>
                        <div className="cap-info-row">
                          <span>Earned: {parseFloat(formatUnits(totalRoiEarned + (liveRoi || 0n), 18)).toFixed(2)}</span>
                          <span>Max: {parseFloat(formatUnits(idValue * 2n, 18)).toFixed(2)}</span>
                        </div>
                      </div>

                      {/* Global Cap Progress */}
                      <div className="cap-card">
                        <div className="cap-label-row">
                          <span className="cap-label">Global Income Cap (4x)</span>
                          <span className="cap-value" style={{
                            color: Number(idValue) > 0 && (Number(totalCappedIncome + (liveRoi || 0n) + (liveDirectRoi || 0n)) / Number(idValue * 4n)) >= 0.9 ? '#ff4d4d' : 'var(--accent)'
                          }}>
                            {Number(idValue) > 0 ? ((Number(totalCappedIncome + (liveRoi || 0n) + (liveDirectRoi || 0n)) / Number(idValue * 4n)) * 100).toFixed(1) : '0'}%
                          </span>
                        </div>
                        <div className="cap-bar-bg">
                          <div
                            className="cap-bar-fill"
                            style={{
                              width: `${Math.min(100, Number(idValue) > 0 ? (Number(totalCappedIncome + (liveRoi || 0n) + (liveDirectRoi || 0n)) / Number(idValue * 4n)) * 100 : 0)}%`,
                              background: 'linear-gradient(90deg, #8A2BE2, #4B0082)',
                              boxShadow: '0 0 10px rgba(138, 43, 226, 0.4)'
                            }}
                          />
                        </div>
                        <div className="cap-info-row">
                          <span>Income: {parseFloat(formatUnits(totalCappedIncome + (liveRoi || 0n) + (liveDirectRoi || 0n), 18)).toFixed(2)}</span>
                          <span>Global Max: {parseFloat(formatUnits(idValue * 4n, 18)).toFixed(2)}</span>
                        </div>
                        <span className="cap-footer-note">*Excludes BDI and Team Rewards</span>
                      </div>

                      {/* Status Badges */}
                      {isMaxRoiReached ? (
                        <div className="status-badge" style={{ background: 'rgba(255, 68, 68, 0.1)', color: '#ff4444', border: '1px solid rgba(255, 68, 68, 0.2)' }}>
                          <div className="status-pulse" style={{ background: '#ff4444' }} />
                          PERSONAL YIELD MAX CAP REACHED
                        </div>
                      ) : isGlobalCapReached ? (
                        <div className="status-badge" style={{ background: 'rgba(255, 68, 68, 0.1)', color: '#ff4444', border: '1px solid rgba(255, 68, 68, 0.2)' }}>
                          <div className="status-pulse" style={{ background: '#ff4444' }} />
                          GLOBAL INCOME MAX CAP REACHED
                        </div>
                      ) : (
                        <div className="status-badge" style={{ background: 'rgba(0, 255, 127, 0.1)', color: '#00FF7F', border: '1px solid rgba(0, 255, 127, 0.2)' }}>
                          <div className="status-pulse" style={{ background: '#00FF7F' }} />
                          SYSTEM OPERATING AT MAXIMUM EFFICIENCY
                        </div>
                      )}
                    </div>
                    <div className="yield-display">
                      <div className="yield-orb"></div>
                      <p>Continuous wealth accumulation active on {currentNetworkName}.</p>
                      <div className="info-bar" style={{ marginTop: '20px', padding: '15px', background: 'rgba(0,0,0,0.2)', borderRadius: '10px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Info size={16} /> <span>Rewards are distributed automatically per period. Click **Withdraw** to release your funds to wallet.</span>
                      </div>
                    </div>
                  </>
                )}
              </motion.div>

              {activeTab !== 'network' && (
                <motion.div initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.6 }} className="neo-card">
                  <h3 className="section-title"><Info size={20} /> Account Identity</h3>
                  <div className="data-rows">
                    <div className="data-row"><span>Account Stake</span><span>{formatUnits(idValue || 0n, 18)} USDT</span></div>
                    <div className="data-row"><span>Business Value</span><span>{formatUnits(businessValue || 0n, 18)} USDT</span></div>
                    <div className="data-row"><span>Total Injected</span><span>{formatUnits(totalDeposited || 0n, 18)} USDT</span></div>
                    <div className="data-row"><span>Creation Date</span><span>{joinTimestamp ? new Date(Number(joinTimestamp) * 1000).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}</span></div>
                    <div className="data-row"><span>Booster Tier</span><span className="tier-tag">{isBoosted4 ? 'ELITE 4%' : isBoosted2 ? 'TURBO 3%' : 'CORE 2%'}</span></div>
                  </div>
                </motion.div>
              )}
            </div>
          </>
        )}
      </main>

      <AnimatePresence>
        {isUpgradeModalOpen && (
          <div className="modal-overlay" onClick={closeUpgradeModal}>
            <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} className="neo-card modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header"><h2 className="gradient-text">Upgrade Stake</h2><button className="btn-icon" onClick={closeUpgradeModal} disabled={isConfirming}><X size={20} /></button></div>
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
                      <button className="btn-primary full-width" onClick={() => writeContract({ address: USDT_ADDRESS_TESTNET, abi: USDT_ABI, functionName: 'approve', args: [NEOX_ADDRESS, upgradeAmountBI * 100n] })} disabled={isConfirming || isTxPending}>
                        {isConfirming || isTxPending ? <Loader2 className="animate-spin" /> : "Authorize Transaction"}
                      </button>
                    ) : (
                      <button className="btn-primary full-width" onClick={handleUpgrade} disabled={isConfirming || isTxPending || !upgradeAmount || upgradeAmountBI < parseUnits('1', 18)}>
                        {isConfirming || isTxPending ? <Loader2 className="animate-spin" /> : "Process Upgrade"}
                      </button>
                    )}
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <style jsx>{`
        .network-view-container { width: 100%; transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1); }
        .network-card-expanded { min-height: calc(100vh - 280px); padding: 0 !important; overflow: hidden; display: flex; flex-direction: column; background: rgba(5, 10, 24, 0.4) !important; }
        .network-flow-wrapper { flex: 1; display: flex; flex-direction: column; padding: clamp(15px, 3vw, 24px); position: relative; }
        .tree-container { flex: 1; min-height: 500px; border-radius: 20px; overflow: hidden; border: 1px solid var(--glass-border); background: rgba(0,0,0,0.4); box-shadow: inset 0 0 50px rgba(0,0,0,0.5); }
        
        .active-tab { background: var(--glass) !important; color: var(--primary) !important; border-color: var(--primary) !important; box-shadow: 0 0 20px rgba(255, 215, 0, 0.1); }
        .network-status { display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--primary); font-weight: 800; background: rgba(255,215,0,0.05); padding: 6px 14px; border-radius: 20px; border: 1px solid rgba(255,215,0,0.2); backdrop-filter: blur(10px); }
        .pulse-dot { width: 6px; height: 6px; background: var(--primary); border-radius: 50%; box-shadow: 0 0 10px var(--primary); animation: pulse-anim 2s infinite; }
        @keyframes pulse-anim { 0% { transform: scale(0.9); opacity: 1; } 50% { transform: scale(1.2); opacity: 0.5; } 100% { transform: scale(0.9); opacity: 1; } }
        
        .animate-spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

        .dashboard-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; gap: 30px; flex-wrap: wrap; }
        .dashboard-title { font-size: clamp(24px, 4vw, 32px); font-weight: 900; letter-spacing: -1px; }
        .account-meta { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .meta-separator { width: 4px; height: 4px; border-radius: 50%; background: var(--glass-border); }
        .account-address { color: var(--text-dim); font-size: 12px; word-break: break-all; font-family: 'JetBrains Mono', monospace; }
        .account-address span { color: white; border-bottom: 1px dashed rgba(255,255,255,0.2); }
        
        .tab-navigation { 
          display: flex; 
          gap: 10px; 
          margin-bottom: 30px; 
          overflow-x: auto; 
          padding-bottom: 12px;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
          -ms-overflow-style: none;
          width: 100%;
        }
        .tab-navigation::-webkit-scrollbar { display: none; }
        .tab-btn { 
          flex-shrink: 0; 
          white-space: nowrap; 
          font-size: 13px; 
          font-weight: 700; 
          padding: 10px 20px; 
          border-radius: 12px;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        
        .header-actions { display: flex; gap: 15px; align-items: flex-start; flex-wrap: wrap; }
        .harvest-control { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
        .min-harvest-hint { font-size: 10px; color: var(--text-dim); background: rgba(255,255,255,0.05); padding: 4px 10px; border-radius: 6px; border: 1px solid var(--glass-border); letter-spacing: 0.5px; }

        .search-group { 
          position: relative; 
          width: 100%; 
          display: flex;
          align-items: center;
          background: rgba(255,255,255,0.03); 
          border: 1px solid var(--glass-border); 
          border-radius: 14px;
          height: 44px;
          padding: 0 12px;
          transition: all 0.3s;
        }
        .search-group:focus-within {
          border-color: var(--primary);
          background: rgba(255,255,255,0.05);
          box-shadow: 0 0 20px rgba(255, 215, 0, 0.1);
        }
        .search-icon { 
          color: var(--text-dim); 
          flex-shrink: 0;
          margin-right: 12px;
          transition: color 0.3s;
        }
        .search-group:focus-within .search-icon {
          color: var(--primary);
        }
        .search-input { 
          width: 100%;
          background: transparent !important;
          border: none !important;
          outline: none !important;
          color: white !important;
          font-size: 14px !important;
          padding: 0 !important;
          height: 100%;
        }

        .modal-overlay { position: fixed; inset: 0; background: rgba(5, 10, 24, 0.8); backdrop-filter: blur(20px); display: flex; align-items: center; justify-content: center; z-index: 2000; padding: 20px; overflow-y: auto; }
        .modal-card { width: 100%; max-width: 440px; border: 1px solid var(--glass-border); padding: clamp(24px, 5vw, 40px); background: var(--surface) !important; box-shadow: 0 30px 60px rgba(0,0,0,0.5); }
        .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }
        .modal-desc { color: var(--text-dim); font-size: 14px; margin-bottom: 25px; line-height: 1.6; text-align: center; }
        .input-glow-group { background: rgba(0,0,0,0.2); border: 1px solid var(--glass-border); border-radius: 16px; padding: 20px; display: flex; align-items: center; margin-bottom: 30px; transition: all 0.3s; }
        .input-glow-group:focus-within { border-color: var(--primary); box-shadow: 0 0 20px rgba(255, 215, 0, 0.1); }
        .input-glow-group input { background: transparent; border: none; color: white; flex: 1; outline: none; font-size: 24px; font-weight: 800; width: 100%; text-align: center; font-family: 'JetBrains Mono', monospace; }
        .input-unit { color: var(--primary); font-weight: 800; font-size: 14px; margin-left: 10px; }
        
        .success-state-modal { text-align: center; display: flex; flex-direction: column; align-items: center; gap: 20px; }
        .success-check { color: #00FF7F; background: rgba(0, 255, 127, 0.1); width: 80px; height: 80px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 10px; }

        @media (max-width: 1200px) {
          .dashboard-header { gap: 20px; }
          .stats-grid { grid-template-columns: repeat(3, 1fr); }
        }

        @media (max-width: 1024px) {
          .network-card-expanded { min-height: 600px; }
          .stats-grid { grid-template-columns: repeat(2, 1fr); }
        }

        @media (max-width: 768px) {
          .main-content { padding-top: 100px; }
          .dashboard-header { flex-direction: column; align-items: stretch; gap: 25px; margin-bottom: 30px; }
          .header-info { text-align: center; display: flex; flex-direction: column; align-items: center; }
          .header-actions { flex-direction: column; align-items: stretch; width: 100%; gap: 12px; }
          .harvest-control { align-items: stretch; width: 100%; }
          .harvest-btn, .upgrade-btn { width: 100%; justify-content: center; height: 50px; font-size: 14px; }
          .account-meta { justify-content: center; width: 100%; }
          .meta-separator { display: none; }
          .account-address { width: 100%; background: rgba(5, 10, 24, 0.3); padding: 12px; border-radius: 12px; border: 1px solid var(--glass-border); font-size: 11px; }
          .tree-container { min-height: 400px; }
          .search-group { max-width: 100%; }
          .tab-navigation { justify-content: center; padding-bottom: 5px; margin-bottom: 20px; }
          .tab-btn { padding: 8px 16px; font-size: 12px; }
          .stats-grid { grid-template-columns: 1fr; gap: 12px; }
        }

        @media (max-width: 480px) {
          .stat-value { font-size: 20px; }
          .neo-card { padding: 18px; }
          .section-header { flex-direction: column; align-items: flex-start; gap: 12px; }
          .rate-badge { width: 100%; justify-content: center; padding: 6px 12px; }
          .network-card-expanded { min-height: 400px; }
        }

        .data-rows { display: flex; flex-direction: column; gap: 5px; }
        .tier-tag { color: var(--primary); font-weight: 900; letter-spacing: 1px; text-shadow: 0 0 10px var(--primary-glow); }
        .section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }
        .yield-display { min-height: 180px; display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative; padding: 20px; text-align: center; }
        .yield-orb { width: 120px; height: 120px; background: radial-gradient(circle, var(--primary) 0%, transparent 70%); position: absolute; opacity: 0.1; filter: blur(30px); animation: pulse-anim 4s infinite; }
        .full-width { width: 100%; }
        .rate-badge { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 700; padding: 8px 16px; border-radius: 12px; background: var(--glass); border: 1px solid var(--glass-border); }

        /* Transactions Table & Activity Section */
        .transactions-table-container { width: 100%; overflow-x: auto; margin-top: 10px; border-radius: 16px; background: rgba(0, 0, 0, 0.2); border: 1px solid var(--glass-border); -ms-overflow-style: none; scrollbar-width: none; }
        .transactions-table-container::-webkit-scrollbar { display: none; }
        .transactions-table { width: 100%; border-collapse: collapse; text-align: left; min-width: 800px; }
        .transactions-table th { padding: 18px 24px; background: rgba(255, 255, 255, 0.02); color: var(--text-dim); font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; border-bottom: 2px solid var(--glass-border); }
        .transactions-table td { padding: 18px 24px; border-bottom: 1px solid var(--glass-border); vertical-align: middle; }
        .transactions-table tr:last-child td { border-bottom: none; }
        .transactions-table tr { transition: all 0.2s; }
        .transactions-table tr:hover { background: rgba(255, 255, 255, 0.03); }

        .table-type-cell { display: flex; align-items: center; gap: 15px; }
        .table-icon { width: 40px; height: 40px; border-radius: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .table-icon.deposit { background: rgba(0, 255, 127, 0.1); color: #00FF7F; border: 1px solid rgba(0, 255, 127, 0.2); }
        .table-icon.withdraw { background: rgba(255, 68, 68, 0.1); color: #ff4444; border: 1px solid rgba(255, 68, 68, 0.2); }
        .table-icon.virtual { background: rgba(255, 215, 0, 0.1); color: var(--primary); border: 1px solid rgba(255, 215, 0, 0.2); }

        .table-type-text { font-weight: 800; color: var(--text); font-size: 14px; display: flex; align-items: center; }
        .table-subtext { font-size: 11px; color: var(--text-dim); margin-top: 4px; font-family: 'JetBrains Mono', monospace; opacity: 0.7; }
        .table-amount { font-weight: 900; font-size: 16px; font-family: 'JetBrains Mono', monospace; }
        .table-amount.pos { color: #00FF7F; }
        .table-amount.neg { color: #ff4444; }
        .table-time { font-size: 13px; color: var(--text-dim); line-height: 1.4; }
        .table-link { color: var(--primary); text-decoration: none; font-size: 12px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px; transition: all 0.2s; padding: 6px 12px; background: rgba(255, 215, 0, 0.05); border-radius: 8px; border: 1px solid rgba(255, 215, 0, 0.1); }
        .table-link:hover { background: var(--primary); color: #000; box-shadow: 0 0 15px var(--primary-glow); }

        .mobile-logs-list { display: none; flex-direction: column; gap: 12px; margin-top: 10px; }
        .mobile-log-card { background: rgba(255,255,255,0.02); border: 1px solid var(--glass-border); border-radius: 18px; padding: 20px; transition: all 0.3s; }
        .mobile-log-card:active { transform: scale(0.98); background: rgba(255,255,255,0.04); }
        .m-log-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
        .m-log-type { display: flex; align-items: center; gap: 12px; font-weight: 800; font-size: 15px; }
        .m-log-amount { font-weight: 900; font-size: 18px; font-family: 'JetBrains Mono', monospace; }
        .m-log-meta { display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: var(--text-dim); border-top: 1px solid var(--glass-border); padding-top: 12px; }

        .pagination-controls { 
          display: flex; 
          justify-content: center; 
          align-items: center; 
          gap: 8px; 
          margin: 40px auto 20px; 
          width: 100%;
          flex-wrap: wrap; 
        }
        .pg-btn { 
          min-width: 36px; 
          height: 36px; 
          display: flex; 
          align-items: center; 
          justify-content: center; 
          border-radius: 10px; 
          background: rgba(255,255,255,0.03); 
          border: 1px solid var(--glass-border); 
          color: var(--text-dim); 
          cursor: pointer; 
          transition: all 0.2s; 
          font-weight: 700; 
          font-size: 13px; 
          padding: 0 10px; 
        }
        .pg-btn:hover:not(:disabled) { 
          background: var(--glass-hover); 
          color: white; 
          border-color: var(--primary); 
          box-shadow: 0 0 15px rgba(255, 215, 0, 0.1); 
        }
        .pg-btn.active { 
          background: var(--primary); 
          color: #000; 
          border-color: var(--primary); 
          box-shadow: 0 0 20px var(--primary-glow); 
        }
        .pg-btn:disabled { 
          opacity: 0.3; 
          cursor: not-allowed; 
          filter: grayscale(1);
        }
        .pg-arrow { 
          padding: 0 14px; 
          text-transform: uppercase; 
          font-size: 11px; 
          letter-spacing: 0.5px; 
          min-width: auto;
        }

        @media (max-width: 480px) {
          .pagination-controls { gap: 6px; }
          .pg-btn { min-width: 32px; height: 32px; font-size: 12px; border-radius: 8px; }
          .pg-arrow { padding: 0 10px; }
        }

        @media (max-width: 900px) {
          .transactions-table th:nth-child(4), .transactions-table td:nth-child(4) { display: none; }
        }

        .logs-card-section { padding: clamp(15px, 4vw, 30px) !important; min-height: 400px; }
        .logs-header-wrap { display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; gap: 20px; flex-wrap: wrap; }
        .logs-subtitle { font-size: 12px; color: var(--text-dim); margin-top: 4px; }
        .logs-actions-area { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
        .logs-search { min-width: 200px; flex: 1; }
        .logs-sync-btn { padding: 0 15px; height: 42px; display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 700; }

        @media (max-width: 768px) {
          .logs-header-wrap { flex-direction: column; align-items: stretch; text-align: center; gap: 20px; }
          .logs-actions-area { flex-direction: column; align-items: stretch; width: 100%; }
          .logs-search { min-width: 100%; }
          .logs-sync-btn { justify-content: center; width: 100%; }
          .logs-title-area { display: flex; flex-direction: column; align-items: center; }
          
          .transactions-table-container { display: none !important; }
          .mobile-logs-list { display: flex !important; flex-direction: column; gap: 15px; width: 100%; margin-top: 10px; }
          .mobile-log-card { 
            display: block !important;
            background: rgba(255, 255, 255, 0.04) !important; 
            border: 1px solid var(--glass-border) !important; 
            border-radius: 20px; 
            padding: 18px; 
            box-shadow: 0 4px 20px rgba(0,0,0,0.2); 
          }
          .m-log-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; width: 100%; }
          .m-log-type { display: flex; align-items: center; gap: 12px; font-weight: 800; font-size: 14px; }
          .m-log-amount { font-weight: 900; font-size: 16px; font-family: 'JetBrains Mono', monospace; }
          .m-log-meta { display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: var(--text-dim); border-top: 1px solid rgba(255,255,255,0.05); padding-top: 12px; width: 100%; }
        }
      `}</style>
    </div>
  )
}
