"use client"
import { useEffect, useState, useCallback, useRef } from 'react'
import ReactFlow, {
    MiniMap,
    Controls,
    Background,
    useNodesState,
    useEdgesState,
} from 'react-flow-renderer'
import { useAccount, useReadContract, usePublicClient } from 'wagmi'
import { readContract } from 'viem/actions' // Direct contract read for speed
import { formatUnits } from 'viem'
import { NEOX_ABI, NEOX_ADDRESS } from '../config/contract'
import { Loader2, Network, ShieldCheck, Zap, RefreshCw, Layers, UserPlus } from 'lucide-react'

export default function NeoXTree() {
    const { address, isConnected } = useAccount()
    const publicClient = usePublicClient()
    const [nodes, setNodes, onNodesChange] = useNodesState([])
    const [edges, setEdges, onEdgesChange] = useEdgesState([])
    const [loading, setLoading] = useState(true)
    const hasFetched = useRef(false)

    const { data: userData } = useReadContract({
        address: NEOX_ADDRESS,
        abi: NEOX_ABI,
        functionName: 'users',
        args: [address],
        query: { enabled: !!address }
    })

    const buildTree = useCallback(async () => {
        if (!address || !publicClient || !userData) return
        setLoading(true)

        try {
            const isRegistered = userData[0]
            const idValue = userData[2]
            const totalROI = userData[6]

            if (!isRegistered) {
                setLoading(false)
                return
            }

            const newNodes = []
            const newEdges = []
            const myAddr = address.toLowerCase()
            const processed = new Set()

            // RECURSIVE FUNCTION USING getReferrals()
            const fetchAndAddDownline = async (currentAddr, x, y, level, parentId = null) => {
                const addrLower = currentAddr.toLowerCase()
                if (processed.has(addrLower)) return
                processed.add(addrLower)

                const isMe = addrLower === myAddr
                const nodeId = `node-${addrLower}`

                // 1. Fetch children for this node via Smart Contract directly
                // This replaces the unreliable log-based scanning
                const children = await readContract(publicClient, {
                    address: NEOX_ADDRESS,
                    abi: NEOX_ABI,
                    functionName: 'getReferrals',
                    args: [currentAddr]
                }).catch(() => [])

                // 2. Add current node to the list
                newNodes.push({
                    id: nodeId,
                    data: {
                        label: isMe ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <div style={{ fontSize: '10px', fontWeight: 800 }}>CORE IDENTITY (YOU)</div>
                                <div style={{ fontSize: '13px' }}>{currentAddr.slice(0, 8)}...{currentAddr.slice(-6)}</div>
                                <div style={{ height: '1px', background: 'rgba(0,0,0,0.1)', margin: '4px 0' }}></div>
                                <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
                                    <div><div style={{ fontSize: '8px', opacity: 0.6 }}>STAKE</div><div style={{ fontSize: '10px' }}>{formatUnits(idValue || 0n, 18)}</div></div>
                                    <div><div style={{ fontSize: '8px', opacity: 0.6 }}>EARNED</div><div style={{ fontSize: '10px' }}>{formatUnits(totalROI || 0n, 18)}</div></div>
                                </div>
                            </div>
                        ) : (
                            <div>
                                <div style={{ fontSize: '9px', color: 'var(--text-dim)' }}>LEVEL {level} PARTNER</div>
                                <div style={{ fontWeight: 700 }}>{currentAddr.slice(0, 8)}...{currentAddr.slice(-6)}</div>
                                <div style={{ fontSize: '10px', color: 'var(--primary)', marginTop: '4px' }}>{children.length} Referrals</div>
                            </div>
                        )
                    },
                    position: { x, y },
                    style: isMe ? {
                        background: 'var(--primary)',
                        color: '#050A18',
                        border: 'none',
                        borderRadius: '20px',
                        fontWeight: 'bold',
                        padding: '16px',
                        width: '210px',
                        boxShadow: '0 0 50px var(--primary-glow)',
                        zIndex: 20
                    } : {
                        background: 'rgba(255, 255, 255, 0.05)',
                        color: '#fff',
                        border: '1px solid var(--glass-border)',
                        borderRadius: '12px',
                        padding: '10px',
                        fontSize: '11px',
                        width: '180px',
                        textAlign: 'center'
                    }
                })

                if (parentId) {
                    newEdges.push({
                        id: `e-${parentId}-${nodeId}`,
                        source: parentId,
                        target: nodeId,
                        animated: true,
                        style: { stroke: isMe ? 'var(--primary)' : 'var(--glass-border)', strokeWidth: 2 }
                    })
                }

                // 3. Recurse for children (Parallel fetch for speed)
                if (children.length > 0 && level < 3) { // Limit to 3 levels for UI performance
                    const spacing = 250 / (level + 1)
                    const startX = x - ((children.length - 1) * spacing * 1.5) / 2

                    await Promise.all(children.map((child, index) =>
                        fetchAndAddDownline(child, startX + index * spacing * 2.5, y + 160, level + 1, nodeId)
                    ))
                }
            }

            // Start construction from 'Me'
            await fetchAndAddDownline(myAddr, 250, 50, 0)

            setNodes([...newNodes])
            setEdges([...newEdges])

        } catch (error) {
            console.error('[NeoXTree] Contract-based mapping failed:', error)
        } finally {
            setLoading(false)
        }
    }, [address, publicClient, userData, setNodes, setEdges])

    useEffect(() => {
        if (isConnected && address && publicClient && userData && !hasFetched.current) {
            buildTree()
            hasFetched.current = true
        }
    }, [isConnected, address, publicClient, userData, buildTree])

    if (!isConnected) return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.4 }}>
            <Network size={64} style={{ marginBottom: '20px' }} />
            <h3 style={{ fontSize: '18px', fontWeight: 700 }}>Network Matrix Offline</h3>
            <p style={{ fontSize: '13px', marginTop: '5px' }}>Unlock access by connecting your account.</p>
        </div>
    )

    if (loading) return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', background: 'var(--surface)', borderRadius: '30px' }}>
            <div className="discovery-aura">
                <Loader2 className="animate-spin" size={56} style={{ color: 'var(--primary)', position: 'relative', zIndex: 1 }} />
                <div className="aura-ring"></div>
            </div>
            <p style={{ marginTop: '30px', color: 'var(--text-dim)', fontSize: '14px', letterSpacing: '2px', fontWeight: 600 }}>FETCHING SMART CONTRACT STATE...</p>
            <style jsx>{`
                .discovery-aura { position: relative; display: flex; align-items: center; justify-content: center; }
                .aura-ring { position: absolute; width: 100px; height: 100px; border: 2px dashed var(--primary); border-radius: 50%; opacity: 0.2; animation: spin 10s linear infinite; }
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}</style>
        </div>
    )

    return (
        <div style={{ width: '100%', height: '100%', minHeight: '580px', background: 'rgba(5, 10, 24, 0.4)', borderRadius: '30px', border: '1px solid var(--glass-border)', overflow: 'hidden', position: 'relative', boxShadow: 'inset 0 0 80px rgba(0,0,0,0.6)' }}>
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                fitView
                style={{ background: 'transparent' }}
                nodesDraggable={true}
                zoomOnScroll={true}
                maxZoom={2}
                minZoom={0.05}
            >
                <Background variant="dots" color="rgba(255,255,255,0.03)" gap={30} size={1.5} />
                <Controls style={{ background: 'var(--surface-light)', border: '1px solid var(--glass-border)', fill: 'white', borderRadius: '12px', padding: '5px' }} />
            </ReactFlow>

            {/* Matrix Console */}
            <div style={{ position: 'absolute', top: '25px', left: '25px', display: 'flex', flexWrap: 'wrap', gap: '15px' }}>
                <div className="hud-badge active">
                    <ShieldCheck size={16} />
                    <span>CONTRACT STATE SYNC</span>
                </div>
                <div className="hud-badge secondary">
                    <UserPlus size={16} />
                    <span>REAL-TIME PARTNERS</span>
                </div>
                <button
                    className="hud-badge refresh-btn"
                    onClick={() => buildTree()}
                    disabled={loading}
                >
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    <span>REBOOT MATRIX</span>
                </button>
            </div>

            <div className="matrix-legend">
                <div className="legend-title">Mapping Status</div>
                <div className="legend-items">
                    <div className="legend-item">
                        <div className="dot core"></div>
                        <span>Core Node</span>
                    </div>
                    <div className="legend-item">
                        <div className="dot partner-sub"></div>
                        <span>Active Downline</span>
                    </div>
                </div>
            </div>

            <style jsx>{`
                .hud-badge { display: flex; align-items: center; gap: 8px; padding: 10px 20px; border-radius: 12px; font-size: 11px; font-weight: 800; border: 1px solid var(--glass-border); backdrop-filter: blur(10px); }
                .hud-badge.active { background: rgba(255, 215, 0, 0.1); color: var(--primary); border-color: rgba(255, 215, 0, 0.3); }
                .hud-badge.secondary { background: rgba(0, 119, 190, 0.1); color: var(--secondary); border-color: rgba(0, 119, 190, 0.3); }
                .refresh-btn { background: rgba(5, 10, 24, 1); color: #fff; border: 1px solid var(--glass-border); cursor: pointer; transition: all 0.2s; }
                .refresh-btn:hover { background: var(--primary); color: #000; }
                
                .matrix-legend { position: absolute; bottom: 25px; right: 25px; background: var(--surface); padding: 20px; border-radius: 20px; border: 1px solid var(--glass-border); width: 240px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
                .legend-title { font-size: 10px; color: var(--text-dim); margin-bottom: 12px; text-transform: uppercase; letter-spacing: 2px; font-weight: 700; }
                .legend-items { display: flex; flex-direction: column; gap: 10px; }
                .legend-item { display: flex; align-items: center; gap: 12px; font-size: 13px; font-weight: 500; }
                .dot { width: 12px; height: 12px; border-radius: 4px; }
                .dot.core { background: var(--primary); box-shadow: 0 0 10px var(--primary-glow); }
                .dot.partner-sub { background: rgba(255, 255, 255, 0.1); border: 1px solid var(--glass-border); }
            `}</style>
        </div>
    )
}
