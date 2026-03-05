"use client"
import { Stars, Float, MeshDistortMaterial, Text3D, Center } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Suspense } from 'react'

function Scene() {
    return (
        <>
            <Stars radius={150} depth={60} count={7000} factor={7} saturation={0.5} fade speed={3} />
            <ambientLight intensity={0.4} />
            <pointLight position={[10, 10, 10]} color="#8A2BE2" intensity={1.5} />
            <pointLight position={[-10, -10, -10]} color="#0077BE" intensity={1} />
            <pointLight position={[0, 5, 0]} color="#FFD700" intensity={1} />

            <Float speed={4} rotationIntensity={1.5} floatIntensity={1.5}>
                <mesh position={[3, 0.5, -1]} rotation={[0.4, 0.2, 0.5]}>
                    <torusGeometry args={[1, 0.3, 32, 100]} />
                    <MeshDistortMaterial color="#8A2BE2" speed={2} distort={0.3} roughness={0.1} metalness={1} />
                </mesh>
            </Float>

            <Float speed={5} rotationIntensity={2} floatIntensity={2.5}>
                <mesh position={[-3, -1, -2]} scale={1.5}>
                    <sphereGeometry args={[1, 64, 64]} />
                    <MeshDistortMaterial color="#0077BE" speed={4} distort={0.4} roughness={0} metalness={0.8} />
                </mesh>
            </Float>

            <Float speed={8} rotationIntensity={3} floatIntensity={1}>
                <mesh position={[0, -2, -3]} scale={0.5}>
                    <icosahedronGeometry args={[1, 0]} />
                    <MeshDistortMaterial color="#FFD700" speed={6} distort={0.5} wireframe />
                </mesh>
            </Float>
        </>
    )
}

export default function ThreeScene() {
    return (
        <div style={{ height: '100vh', width: '100%', position: 'absolute', top: 0, left: 0, zIndex: -1 }}>
            <Canvas camera={{ position: [0, 0, 5], fov: 75 }}>
                <Suspense fallback={null}>
                    <Scene />
                </Suspense>
            </Canvas>
        </div>
    )
}
