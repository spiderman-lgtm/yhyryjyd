'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

function labelTexture(text: string, bg: string, fg: string, size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, size, size);
  g.fillStyle = fg;
  g.font = `900 ${size * 0.55}px Inter, Arial, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, size / 2, size / 2 + size * 0.04);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function coin() {
  const gold = new THREE.MeshPhysicalMaterial({ color: '#eab308', metalness: 0.85, roughness: 0.25, clearcoat: 1 });
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.14, 64), gold);
  rim.rotation.x = Math.PI / 2;
  const faceMat = new THREE.MeshPhysicalMaterial({ map: labelTexture('₹', '#f5b82e', '#a16207'), metalness: 0.55, roughness: 0.3, clearcoat: 1 });
  const front = new THREE.Mesh(new THREE.CircleGeometry(0.55, 64), faceMat);
  front.position.z = 0.071;
  const back = front.clone();
  back.position.z = -0.071;
  back.rotation.y = Math.PI;
  const g = new THREE.Group();
  g.add(rim, front, back);
  return g;
}

function bag() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 1.2, 0.55, 4, 4, 4),
    new THREE.MeshPhysicalMaterial({ color: '#f97316', roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.2 }),
  );
  g.add(body);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.05, 16, 48, Math.PI), new THREE.MeshPhysicalMaterial({ color: '#7c2d12', roughness: 0.4 }));
  handle.position.y = 0.6;
  g.add(handle);
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.55), new THREE.MeshBasicMaterial({ map: labelTexture('₹', '#f97316', '#ffffff'), transparent: false }));
  logo.position.z = 0.28;
  g.add(logo);
  return g;
}

function tag() {
  const s = new THREE.Shape();
  s.moveTo(-0.7, -0.38);
  s.lineTo(0.35, -0.38);
  s.lineTo(0.75, 0);
  s.lineTo(0.35, 0.38);
  s.lineTo(-0.7, 0.38);
  s.lineTo(-0.7, -0.38);
  const hole = new THREE.Path();
  hole.absarc(0.42, 0, 0.08, 0, Math.PI * 2, true);
  s.holes.push(hole);
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 4 }),
    new THREE.MeshPhysicalMaterial({ color: '#16a34a', roughness: 0.3, clearcoat: 1 }),
  );
  g.add(body);
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const x = c.getContext('2d')!;
  x.fillStyle = '#16a34a';
  x.fillRect(0, 0, 512, 256);
  x.fillStyle = '#fff';
  x.font = '900 120px Inter, Arial, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText('40%', 220, 110);
  x.font = '800 54px Inter, Arial, sans-serif';
  x.fillText('OFF', 220, 205);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.5), new THREE.MeshBasicMaterial({ map: t }));
  label.position.set(-0.18, 0, 0.17);
  g.add(label);
  return g;
}

function arrowDown() {
  const g = new THREE.Group();
  const mat = new THREE.MeshPhysicalMaterial({ color: '#22c55e', roughness: 0.25, clearcoat: 1 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.6, 32), mat);
  shaft.position.y = 0.2;
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.45, 32), mat);
  head.rotation.z = Math.PI;
  head.position.y = -0.25;
  g.add(shaft, head);
  return g;
}

function percent() {
  const g = new THREE.Group();
  const mat = new THREE.MeshPhysicalMaterial({ color: '#ec4899', roughness: 0.25, clearcoat: 1 });
  const a = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.065, 16, 32), mat);
  a.position.set(-0.3, 0.3, 0);
  const b = a.clone();
  b.position.set(0.3, -0.3, 0);
  const bar = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.75, 8, 16), mat);
  bar.rotation.z = -Math.PI / 4;
  g.add(a, b, bar);
  return g;
}

export default function Hero3D({ className = '' }: { className?: string }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return; // No WebGL: the hero simply shows without the 3D scene.
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(0, 0, 9);

    scene.add(new THREE.HemisphereLight('#ffffff', '#fde68a', 1.3));
    const key = new THREE.DirectionalLight('#ffffff', 2.2);
    key.position.set(3, 5, 6);
    scene.add(key);
    const rim = new THREE.PointLight('#fb923c', 30, 20);
    rim.position.set(-4, -2, 3);
    scene.add(rim);

    const world = new THREE.Group();
    scene.add(world);
    const items: { obj: THREE.Object3D; base: THREE.Vector3; speed: number; phase: number; spin: THREE.Vector3 }[] = [];
    const place = (obj: THREE.Object3D, x: number, y: number, z: number, s: number, spin: [number, number, number]) => {
      obj.position.set(x, y, z);
      obj.scale.setScalar(s);
      world.add(obj);
      items.push({ obj, base: new THREE.Vector3(x, y, z), speed: 0.6 + Math.random() * 0.6, phase: Math.random() * Math.PI * 2, spin: new THREE.Vector3(...spin) });
    };
    place(bag(), 0.2, 0.2, 0, 1.25, [0, 0.35, 0]);
    place(tag(), 1.9, 1.3, 0.6, 1.0, [0.1, 0.4, 0.15]);
    place(coin(), -1.8, 1.4, 0.4, 1.0, [0, 1.2, 0]);
    place(coin(), -2.2, -1.2, -0.6, 0.8, [0, 1.6, 0]);
    place(coin(), 2.3, -1.4, -0.3, 0.75, [0, 1.4, 0]);
    place(arrowDown(), 1.4, -0.4, 1.4, 0.9, [0, 0.8, 0]);
    place(percent(), -1.3, -0.2, 1.6, 0.9, [0.2, 0.6, 0.3]);

    const resize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      camera.aspect = w / Math.max(h, 1);
      camera.position.z = camera.aspect < 0.9 ? 11 : 9;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    const pointer = { x: 0, y: 0 };
    const onMove = (e: PointerEvent) => {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener('pointermove', onMove);

    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const clock = new THREE.Clock();
    let raf = 0;
    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(el);

    const frame = () => {
      const t = clock.getElapsedTime();
      for (const it of items) {
        it.obj.position.y = it.base.y + Math.sin(t * it.speed + it.phase) * 0.18;
        it.obj.rotation.x = Math.sin(t * 0.5 + it.phase) * it.spin.x;
        it.obj.rotation.y += 0.01 * it.spin.y;
        it.obj.rotation.z = Math.sin(t * 0.7 + it.phase) * it.spin.z;
      }
      world.rotation.y += (pointer.x * 0.35 - world.rotation.y) * 0.05;
      world.rotation.x += (pointer.y * 0.2 - world.rotation.x) * 0.05;
      renderer.render(scene, camera);
    };
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (visible) frame();
    };
    if (still) frame();
    else loop();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener('pointermove', onMove);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
        for (const mat of mats) {
          (mat as THREE.MeshBasicMaterial).map?.dispose();
          mat.dispose();
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={host} className={className} aria-hidden="true" />;
}
