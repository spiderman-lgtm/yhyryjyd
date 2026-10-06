"use client";

import { Environment, Float, Lightformer, RoundedBox, Sparkles } from "@react-three/drei";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { products } from "@/content/site";

const AURORA = ["#9fb4ff", "#c8a8ff", "#8be3d6", "#b9c6ff"];
const S = 0.5; // pip spacing

// Classic pip layouts, in face-local coordinates.
const PIPS: Record<number, [number, number][]> = {
  2: [[-S, S], [S, -S]],
  3: [[-S, S], [0, 0], [S, -S]],
  4: [[-S, S], [S, S], [-S, -S], [S, -S]],
  5: [[-S, S], [S, S], [0, 0], [-S, -S], [S, -S]],
  6: [[-S, S], [-S, 0], [-S, -S], [S, S], [S, 0], [S, -S]],
};

// Face orientation (local +z → face normal) and which number it carries.
const FACES: { rot: [number, number, number]; n: number }[] = [
  { rot: [0, Math.PI, 0], n: 6 },
  { rot: [0, Math.PI / 2, 0], n: 3 },
  { rot: [0, -Math.PI / 2, 0], n: 4 },
  { rot: [-Math.PI / 2, 0, 0], n: 2 },
  { rot: [Math.PI / 2, 0, 0], n: 5 },
];

// The "W" from Walkover's mark, drawn as connected pips on the front face.
const W_POINTS: [number, number][] = [
  [-0.62, 0.42],
  [-0.32, -0.44],
  [0, 0.12],
  [0.32, -0.44],
  [0.62, 0.42],
];

function Pip({ u, v }: { u: number; v: number }) {
  return (
    <mesh position={[u, v, 1.0]} scale={[1, 1, 0.35]}>
      <sphereGeometry args={[0.15, 32, 16]} />
      <meshPhysicalMaterial color="#0d0d16" roughness={0.25} clearcoat={1} />
    </mesh>
  );
}

function WMark() {
  const segments = useMemo(
    () =>
      W_POINTS.slice(0, -1).map(([x1, y1], i) => {
        const [x2, y2] = W_POINTS[i + 1];
        const len = Math.hypot(x2 - x1, y2 - y1);
        const angle = Math.atan2(y2 - y1, x2 - x1);
        return { pos: [(x1 + x2) / 2, (y1 + y2) / 2, 1.01] as [number, number, number], len, angle, color: AURORA[i % AURORA.length] };
      }),
    [],
  );
  return (
    <group>
      {segments.map((s, i) => (
        <mesh key={i} position={s.pos} rotation={[0, 0, s.angle - Math.PI / 2]}>
          <capsuleGeometry args={[0.065, s.len, 8, 16]} />
          <meshStandardMaterial color={s.color} emissive={s.color} emissiveIntensity={1.6} toneMapped={false} />
        </mesh>
      ))}
      {W_POINTS.map(([x, y], i) => (
        <mesh key={i} position={[x, y, 1.02]}>
          <sphereGeometry args={[0.12, 32, 16]} />
          <meshStandardMaterial color="#ffffff" emissive={AURORA[i % AURORA.length]} emissiveIntensity={1.2} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

function Die({ reduce, onHover }: { reduce: boolean; onHover: (on: boolean) => void }) {
  const group = useRef<THREE.Group>(null);
  const target = useRef(new THREE.Euler(0.35, -0.5, 0));
  const roll = useRef(new THREE.Vector2(0, 0));
  const [hover, setHover] = useState(false);
  const tmp = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => onHover(hover), [hover, onHover]);

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    const scroll = typeof window !== "undefined" ? window.scrollY / window.innerHeight : 0;
    const idle = reduce ? 0 : t * 0.18;

    target.current.x = 0.35 + state.pointer.y * -0.45 + roll.current.x + scroll * 0.9;
    target.current.y = -0.5 + idle + state.pointer.x * 0.7 + roll.current.y + scroll * 1.4;

    const k = 1 - Math.pow(0.002, delta); // frame-rate independent damping
    g.rotation.x += (target.current.x - g.rotation.x) * k;
    g.rotation.y += (target.current.y - g.rotation.y) * k;

    // Lay out for the viewport: right of the headline on wide screens, tucked top-right on phones.
    const vw = state.viewport.width;
    const wide = vw > 7;
    const s = (wide ? Math.min(1.0, vw / 11.5) : vw / 7) * (hover ? 1.06 : 1);
    g.scale.lerp(tmp.set(s, s, s), 1 - Math.pow(0.0005, delta)); // grows in on load, frame-rate independent
    g.position.x = vw * (wide ? 0.27 : 0.28);
    g.position.y = (wide ? 0.2 : state.viewport.height * 0.3) + scroll * 1.2;
  });

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    // Roll the die: a random number of quarter turns on two axes.
    roll.current.x += (Math.floor(Math.random() * 3) + 1) * (Math.PI / 2);
    roll.current.y += (Math.floor(Math.random() * 3) + 1) * (Math.PI / 2);
  };

  return (
    <group ref={group} scale={0.001}>
      <Float speed={reduce ? 0 : 1.6} rotationIntensity={0.25} floatIntensity={0.6}>
        <RoundedBox
          args={[2, 2, 2]}
          radius={0.3}
          smoothness={8}
          onPointerOver={() => setHover(true)}
          onPointerOut={() => setHover(false)}
          onClick={onClick}
        >
          <meshPhysicalMaterial
            color="#eef0ff"
            roughness={0.12}
            metalness={0.05}
            clearcoat={1}
            clearcoatRoughness={0.08}
            iridescence={1}
            iridescenceIOR={1.35}
            iridescenceThicknessRange={[200, 800]}
            sheen={0.4}
            sheenColor="#c8a8ff"
          />
        </RoundedBox>
        <WMark />
        {FACES.map((f) => (
          <group key={f.n} rotation={f.rot}>
            {PIPS[f.n].map(([u, v], i) => (
              <Pip key={i} u={u} v={v} />
            ))}
          </group>
        ))}
      </Float>
      <Orbiters reduce={reduce} />
    </group>
  );
}

/** Six product-coloured lights circling the die on tilted orbits. */
function Orbiters({ reduce }: { reduce: boolean }) {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const orbits = useMemo(
    () =>
      products.map((p, i) => ({
        color: p.color,
        r: 2.3 + (i % 3) * 0.35,
        speed: 0.25 + (i % 4) * 0.07,
        phase: (i / products.length) * Math.PI * 2,
        tilt: (i % 2 ? 1 : -1) * (0.35 + i * 0.08),
      })),
    [],
  );
  useFrame((state) => {
    const t = reduce ? 0 : state.clock.elapsedTime;
    orbits.forEach((o, i) => {
      const m = refs.current[i];
      if (!m) return;
      const a = o.phase + t * o.speed;
      m.position.set(Math.cos(a) * o.r, Math.sin(a) * o.r * Math.sin(o.tilt), Math.sin(a) * o.r * Math.cos(o.tilt));
    });
  });
  return (
    <>
      {orbits.map((o, i) => (
        <mesh key={i} ref={(el) => void (refs.current[i] = el)}>
          <sphereGeometry args={[0.07, 24, 12]} />
          <meshStandardMaterial color={o.color} emissive={o.color} emissiveIntensity={2.2} toneMapped={false} />
        </mesh>
      ))}
    </>
  );
}

/** Hero 3D scene. Pauses rendering whenever the hero is scrolled out of view. */
export default function DieScene() {
  const wrap = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    setReduce(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting));
    if (wrap.current) io.observe(wrap.current);
    return () => io.disconnect();
  }, []);

  // Lets the custom cursor show "Roll" while the pointer is over the die.
  const onHover = useCallback((on: boolean) => {
    if (!wrap.current) return;
    if (on) wrap.current.dataset.cursor = "Roll";
    else delete wrap.current.dataset.cursor;
  }, []);

  return (
    <div ref={wrap} className="absolute inset-0" aria-hidden>
      <Canvas
        dpr={[1, 1.75]}
        camera={{ position: [0, 0, 8], fov: 35 }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        frameloop={visible ? "always" : "never"}
        eventPrefix="client"
      >
        <ambientLight intensity={0.35} />
        <directionalLight position={[4, 6, 5]} intensity={1.6} />
        <pointLight position={[-5, -2, 3]} intensity={30} color="#8a5cff" />
        <pointLight position={[5, -3, 2]} intensity={25} color="#22c5a8" />
        <Environment resolution={256}>
          <Lightformer form="rect" intensity={3} position={[0, 4, 4]} scale={[8, 2, 1]} color="#ffffff" />
          <Lightformer form="rect" intensity={2} position={[-5, 0, 2]} rotation-y={Math.PI / 2} scale={[6, 3, 1]} color="#9fb4ff" />
          <Lightformer form="rect" intensity={2} position={[5, 0, 2]} rotation-y={-Math.PI / 2} scale={[6, 3, 1]} color="#c8a8ff" />
          <Lightformer form="ring" intensity={2} position={[0, -4, 3]} scale={3} color="#8be3d6" />
        </Environment>
        <Die reduce={reduce} onHover={onHover} />
        <Sparkles count={70} scale={[16, 9, 6]} size={2.2} speed={reduce ? 0 : 0.25} opacity={0.5} color="#c9d3ff" />
      </Canvas>
    </div>
  );
}
