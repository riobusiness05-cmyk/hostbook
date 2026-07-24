import ParallaxImageSection from "@/components/ParallaxImageSection";

export default function StorySection({ src }: { src: string }) {
  return (
    <ParallaxImageSection
      src={src}
      className="flex h-[90vh] min-h-[560px] items-center justify-center px-6"
      overlayClassName="bg-colonial-black/45"
    >
      <p className="animate-fade-up text-center font-serif text-4xl font-light italic text-colonial-cream sm:text-5xl md:text-6xl">
        Our happy place.
      </p>
    </ParallaxImageSection>
  );
}
