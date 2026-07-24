"use client";

import { useEffect, useRef } from "react";

export default function HeroScrub({ src, name, tagline }: { src: string; name: string; tagline: string }) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    const section = sectionRef.current;
    if (!video || !section) return;

    video.pause();

    // Continuous rAF loop easing the playhead toward the scroll target,
    // rather than seeking on every scroll event — paired with an all-intra
    // encode (every frame a keyframe) this keeps scrubbing smooth.
    let raf = 0;
    let playhead = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!video.duration) return;
      const rect = section.getBoundingClientRect();
      if (rect.bottom < 0) return; // hero fully scrolled past
      const scrollable = section.offsetHeight - window.innerHeight;
      const progress = scrollable > 0 ? Math.min(Math.max(-rect.top / scrollable, 0), 1) : 0;
      const target = progress * video.duration;
      playhead += (target - playhead) * 0.15;
      if (!video.seeking && Math.abs(playhead - video.currentTime) > 1 / 60) {
        video.currentTime = playhead;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <section ref={sectionRef} className="relative h-[280vh]">
      <div className="sticky top-0 h-screen w-full overflow-hidden bg-colonial-black">
        <video
          ref={videoRef}
          src={src}
          muted
          playsInline
          preload="auto"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/25 to-colonial-black" />

        <div className="relative z-10 flex h-full flex-col items-center justify-center px-6 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt=""
            className="animate-fade-up mb-8 w-36 sm:w-44 md:w-52"
            style={{ filter: "drop-shadow(0 4px 24px rgba(0,0,0,0.5))" }}
          />
          <h1 className="animate-fade-up font-serif text-4xl font-light uppercase tracking-[0.08em] text-colonial-cream sm:text-6xl sm:tracking-[0.14em] md:text-7xl md:tracking-[0.18em] lg:text-8xl">
            {name}
          </h1>
          <p
            className="animate-fade-up mt-6 font-sans text-[10px] font-light uppercase tracking-[0.3em] text-colonial-ember-300 sm:text-xs sm:tracking-[0.45em] md:text-sm"
            style={{ animationDelay: "0.35s" }}
          >
            {tagline}
          </p>
        </div>

        <div className="absolute bottom-10 left-1/2 z-10 -translate-x-1/2 text-[10px] uppercase tracking-[0.4em] text-colonial-cream/50">
          Scroll
        </div>
      </div>
    </section>
  );
}
