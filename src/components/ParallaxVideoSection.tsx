"use client";

import { useEffect, useRef } from "react";

export default function ParallaxVideoSection({
  src,
  overlayClassName = "bg-colonial-black/60",
  className = "",
  videoClassName = "",
  children,
}: {
  src: string;
  overlayClassName?: string;
  className?: string;
  videoClassName?: string;
  children: React.ReactNode;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const video = videoRef.current;
    if (!wrap || !video) return;

    let ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        if (wrap && video) {
          const rect = wrap.getBoundingClientRect();
          const vh = window.innerHeight;
          const progress = (vh - rect.top) / (vh + rect.height);
          const offset = (Math.min(Math.max(progress, 0), 1) - 0.5) * 70;
          video.style.transform = `translateY(${offset}px) scale(1.15)`;
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
      <video
        ref={videoRef}
        src={src}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        className={`absolute inset-0 h-full w-full object-cover will-change-transform ${videoClassName}`}
      />
      <div className={`absolute inset-0 ${overlayClassName}`} />
      <div className="relative z-10">{children}</div>
    </section>
  );
}
