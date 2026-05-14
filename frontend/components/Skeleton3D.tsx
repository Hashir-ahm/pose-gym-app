"use client";
import { useRef, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid } from "@react-three/drei";
import * as THREE from "three";

const BONES = [
  [0,1],[1,2],[2,3],
  [0,4],[4,5],[5,6],
  [0,7],[7,8],[8,9],[9,10],
  [8,11],[11,12],[12,13],
  [8,14],[14,15],[15,16],
];

const BONE_COLORS = [
  "#E74C3C","#E74C3C","#E74C3C",
  "#3498DB","#3498DB","#3498DB",
  "#2ECC71","#2ECC71","#2ECC71","#2ECC71",
  "#9B59B6","#9B59B6","#9B59B6",
  "#F39C12","#F39C12","#F39C12",
];

// ── Exponential moving average smoothing ─────────────────────────────────────
const ALPHA = 0.35; // lower = smoother but more lag. 0.35 is a good balance
let smoothedJoints: number[][] | null = null;

function smoothJoints(raw: [number,number,number][]): [number,number,number][] {
  if (!smoothedJoints || smoothedJoints.length !== raw.length) {
    smoothedJoints = raw.map(j => [...j]);
    return raw;
  }
  smoothedJoints = smoothedJoints.map((prev, i) => [
    prev[0] + ALPHA * (raw[i][0] - prev[0]),
    prev[1] + ALPHA * (raw[i][1] - prev[1]),
    prev[2] + ALPHA * (raw[i][2] - prev[2]),
  ]);
  return smoothedJoints as [number,number,number][];
}

function SkeletonMesh({ joints }: { joints: [number,number,number][] }) {
  const smoothed = smoothJoints(joints);

  if (!smoothed || smoothed.length < 17) return null;

  return (
    <group>
      {smoothed.map((j, i) => (
        <mesh key={i} position={[j[0], -j[1], j[2]]}>
          <sphereGeometry args={[0.025, 12, 12]} />
          <meshStandardMaterial color="#ffffff" emissive="#00ff88" emissiveIntensity={0.5} />
        </mesh>
      ))}

      {BONES.map(([a, b], i) => {
        const start = new THREE.Vector3(smoothed[a][0], -smoothed[a][1], smoothed[a][2]);
        const end   = new THREE.Vector3(smoothed[b][0], -smoothed[b][1], smoothed[b][2]);
        const dir   = new THREE.Vector3().subVectors(end, start);
        const len   = dir.length();
        if (len < 0.001) return null;
        const mid  = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
        const quat = new THREE.Quaternion();
        quat.setFromUnitVectors(new THREE.Vector3(0,1,0), dir.clone().normalize());

        return (
          <mesh key={i} position={mid} quaternion={quat}>
            <cylinderGeometry args={[0.012, 0.012, len, 8]} />
            <meshStandardMaterial
              color={BONE_COLORS[i]}
              emissive={BONE_COLORS[i]}
              emissiveIntensity={0.3}
            />
          </mesh>
        );
      })}
    </group>
  );
}

function EmptySkeleton() {
  return (
    <mesh position={[0, 0, 0]}>
      <sphereGeometry args={[0.05, 16, 16]} />
      <meshStandardMaterial color="#00ff88" wireframe />
    </mesh>
  );
}

export default function Skeleton3D({ joints }: { joints: [number,number,number][] | null }) {
  return (
    <Canvas camera={{ position: [0, 0, 3], fov: 50 }} style={{ background: "transparent" }}>
      <ambientLight intensity={0.5} />
      <pointLight position={[2, 2, 2]} intensity={1} color="#00ff88" />
      <pointLight position={[-2, -2, -2]} intensity={0.5} color="#00d4ff" />

      {joints && joints.length === 17
        ? <SkeletonMesh joints={joints} />
        : <EmptySkeleton />
      }

      <Grid
        args={[6, 6]}
        position={[0, -1.2, 0]}
        cellColor="#00ff8811"
        sectionColor="#00ff8822"
        fadeDistance={8}
      />
      <OrbitControls
        enablePan={false}
        enableZoom={true}
        autoRotate={false}
        enableDamping={true}
        dampingFactor={0.08}
      />
    </Canvas>
  );
}
