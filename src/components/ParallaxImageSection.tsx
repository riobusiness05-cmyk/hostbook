"use client";

import { useEffect, useRef } from "react";

export default function ParallaxImageSection({
  src,
  overlayClassName = "bg-colonial-black/60",
  className = "",
  children,
}: {
  src: string;
  overlayClassName?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const img = imgRef.current;
    if (!wrap || !img) return;

    let ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        if (wrap && img) {
          const rect = wrap.getBoundingClientRect();
          const vh = window.innerHeight;
          const progress = (vh - rect.top) / (vh + rect.height);
          const offset = (Math.min(Math.max(progress, 0), 1) - 0.5) * 70;
          img.style.transform = `translateY(${offset}px) scale(1.15)`;
        }
        ticking = false;
      });
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <section ref={wrapRef} className={`relative overflow-hidden ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={src}
        alt=""
        className="absolute inset-0 h-full w-full object-cover will-change-transform"
      />
      <div className={`absolute inset-0 ${overlayClassName}`} />
      <div className="relative z-10">{children}</div>
    </section>
  );
}
