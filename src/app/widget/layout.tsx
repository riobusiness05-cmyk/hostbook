// The embeddable widget is meant to sit inside an iframe on an arbitrary
// third-party website, so it must NOT inherit the root layout's styling —
// that's the demo tenant's own public site (Cormorant/Jost fonts, a
// hardcoded near-black body background in globals.css). A plain system
// font stack + explicit white background here keeps every restaurant's
// widget looking like a clean, intentional embed regardless of what's
// hosting it, tinted only by that restaurant's own brandColor.
export default function WidgetLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        background: "#ffffff",
        color: "#171717",
        minHeight: "100vh",
      }}
    >
      {children}
    </div>
  );
}
