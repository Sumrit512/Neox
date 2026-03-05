"use client"
import { useEffect, useState, useCallback, useRef } from 'react'
import ReactFlow, {
    MiniMap,
    Controls,
    Background,
} from 'react-flow-renderer'
import { useAccount, useReadContract, usePublicClient } from 'wagmi'
import { readContract } from 'viem/actions' // Direct contract read for speed
import { formatUnits } from 'viem'
import { NEOX_ABI, NEOX_ADDRESS } from '../config/contract'
import { Loader2, Network, ShieldCheck, Zap, RefreshCw, Layers, UserPlus } from 'lucide-react'

// Constants outside component to avoid re-renders
const nodeTypes = {}
const edgeTypes = {}

export default function NeoXTree() {
    const { address, isConnected } = useAccount()
    const publicClient = usePublicClient()
    const [nodes, setNodes] = useState([])
    const [edges, setEdges] = useState([])
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

        console.log('>>> [NeoXTree] BUILDING MATRIX FOR:', address)
        setLoading(true)

        try {
            const isRegistered = userData?.[0]
            if (!isRegistered) {
                console.warn('>>> [NeoXTree] ACCOUNT NOT REGISTERED')
                setNodes([])
                setEdges([])
                setLoading(false)
                return
            }

            const newNodes = []
            const newEdges = []
            const myAddr = address.toLowerCase()
            const processed = new Set()

            const fetchAndAddDownline = async (currentAddr, x, y, level, parentId = null) => {
                const addrLower = currentAddr.toLowerCase()
                if (processed.has(addrLower)) return
                processed.add(addrLower)

                const isMe = addrLower === myAddr
                const nodeId = `node-${addrLower}`

                const children = await readContract(publicClient, {
                    address: NEOX_ADDRESS,
                    abi: NEOX_ABI,
                    functionName: 'getReferrals',
                    args: [currentAddr]
                }).catch(() => [])

                newNodes.push({
                    id: nodeId,
                    data: {
                        label: (
                            <div className={isMe ? "node-me" : "node-partner"}>
                                {isMe ? <strong>CORE IDENTITY</strong> : <span style={{ fontSize: '9px' }}>PARTNER</span>}
                                <div style={{ fontSize: '11px', fontFamily: 'monospace' }}>{currentAddr.slice(0, 6)}...{currentAddr.slice(-4)}</div>
                                <div style={{ fontSize: '10px', color: 'var(--primary)', marginTop: '4px' }}>{children.length} Links</div>
                            </div>
                        )
                    },
                    position: { x, y },
                    style: isMe ? {
                        background: '#FFD700',
                        color: '#000',
                        border: 'none',
                        borderRadius: '16px',
                        padding: '12px',
                        width: '180px',
                        fontWeight: 800,
                        boxShadow: '0 0 30px rgba(255, 215, 0, 0.4)'
                    } : {
                        background: 'rgba(255, 255, 255, 0.05)',
                        color: '#fff',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '12px',
                        padding: '10px',
                        width: '150px'
                    }
                })

                if (parentId) {
                    newEdges.push({
                        id: `e-${parentId}-${nodeId}`,
                        source: parentId,
                        target: nodeId,
                        animated: true,
                        style: { stroke: isMe ? '#FFD700' : 'rgba(255,255,255,0.2)', strokeWidth: 2 }
                    })
                }

                if (children.length > 0 && level < 3) {
                    const spacing = 220 / (level + 1)
                    const startX = x - ((children.length - 1) * spacing * 2) / 2
                    await Promise.all(children.map((child, index) =>
                        fetchAndAddDownline(child, startX + index * spacing * 2, y + 140, level + 1, nodeId)
                    ))
                }
            }

            await fetchAndAddDownline(myAddr, 250, 50, 0)
            console.log('>>> [NeoXTree] MATRIX BUILT:', newNodes.length, 'nodes found')
            setNodes(newNodes)
            setEdges(newEdges)

        } catch (error) {
            console.error('>>> [NeoXTree] BUILD CRASH:', error)
        } finally {
            setLoading(false)
        }
    }, [address, publicClient, userData])

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
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '600px', background: 'rgba(0,0,0,0.2)', borderRadius: '30px' }}>
            <div className="discovery-aura">
                <Loader2 className="animate-spin" size={40} style={{ color: 'var(--primary)', position: 'relative', zIndex: 1 }} />
                <div className="aura-ring"></div>
            </div>
            <p style={{ marginTop: '20px', color: 'var(--text-dim)', fontSize: '12px', letterSpacing: '2px', fontWeight: 600 }}>SYNCHRONIZING MATRIX...</p>
            <style jsx>{`
                .discovery-aura { position: relative; display: flex; align-items: center; justify-content: center; }
                .aura-ring { position: absolute; width: 80px; height: 80px; border: 1px dashed var(--primary); border-radius: 50%; opacity: 0.2; animation: spin 8s linear infinite; }
            `}</style>
        </div>
    )

    return (
        <div style={{ width: '100%', height: '600px', position: 'relative', overflow: 'hidden' }}>
            <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                onInit={(instance) => instance.fitView()}
                style={{ background: 'transparent' }}
                nodesDraggable={true}
                zoomOnScroll={true}
                maxZoom={1.5}
                minZoom={0.1}
            >
                <Background variant="dots" color="rgba(255,215,0,0.1)" gap={32} size={1} />
            </ReactFlow>

            {/* HUD OVERLAY */}
            <div style={{ position: 'absolute', top: '20px', left: '20px', display: 'flex', flexWrap: 'wrap', gap: '10px', zIndex: 10 }}>
                <div className="hud-badge active">
                    <ShieldCheck size={14} />
                    <span>SECURE MATRIX</span>
                </div>
                <button className="hud-badge refresh-btn" onClick={() => buildTree()} disabled={loading}>
                    <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                    <span>SYNC DATA</span>
                </button>
            </div>


            <style jsx>{`
                .node-me { display: flex; flex-direction: column; align-items: center; text-align: center; color: #000; }
                .node-partner { display: flex; flex-direction: column; align-items: center; text-align: center; color: #fff; }
                
                .hud-badge { display: flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 8px; font-size: 10px; font-weight: 800; border: 1px solid var(--glass-border); backdrop-filter: blur(12px); text-transform: uppercase; letter-spacing: 1px; }
                .hud-badge.active { background: rgba(255, 215, 0, 0.1); color: var(--primary); border-color: rgba(255, 215, 0, 0.2); }
                .refresh-btn { background: rgba(255,255,255,0.05); color: #fff; cursor: pointer; transition: all 0.2s; }
                .refresh-btn:hover { background: var(--primary); color: #000; border-color: var(--primary); }
                

                @media (max-width: 768px) {
                    .hud-badge span { display: none; }
                }
            `}</style>
        </div>
    )
}
