import ParallaxVideoSection from "@/components/ParallaxVideoSection";

export default function LiveEntertainmentSection({ src }: { src: string }) {
  return (
    <ParallaxVideoSection
      src={src}
      overlayClassName="bg-gradient-to-r from-colonial-black/90 via-colonial-black/50 to-colonial-black/20"
      className="flex h-[90vh] min-h-[560px] items-center px-6 md:px-16"
      videoClassName="brightness-[1.8] contrast-110 saturate-[1.15]"
    >
      <div className="max-w-md">
        <p className="font-sans text-xs uppercase tracking-[0.45em] text-colonial-ember-400">Live Entertainment</p>
        <h2 className="mt-4 font-serif text-4xl font-light text-colonial-cream sm:text-5xl">Every Night</h2>
        <p className="mt-5 font-sans text-sm leading-relaxed text-colonial-fade">
          Award-winning local artists. Pop, Motown &amp; soul until late — and all the live sports.
        </p>
        <a
          href="#reserve"
          className="mt-8 inline-block border-b border-colonial-ember-400 pb-1 font-sans text-xs uppercase tracking-[0.3em] text-colonial-ember-300 transition-colors hover:text-colonial-cream"
        >
          Book a Table
        </a>
      </div>
    </ParallaxVideoSection>
  );
}
