import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#fdf4ee",
          100: "#faE5d5",
          200: "#f3c6a3",
          300: "#eba36c",
          400: "#e17f3c",
          500: "#c9611f",
          600: "#a64c17",
          700: "#7f3a15",
          800: "#5c2b13",
          900: "#3d1c0d",
        },
        colonial: {
          black: "#0b0906",
          charcoal: "#151009",
          slate: "#1d1712",
          cream: "#f4e9d8",
          fade: "#c9bba5",
          ember: {
            300: "#f2b381",
            400: "#e8935c",
            500: "#d97a3f",
            600: "#b85f2b",
            700: "#8f4620",
          },
        },
        // Host Flow's own product/marketing surface — separate from `colonial`
        // (that's the demo tenant's public restaurant site) and from `brand`
        // (a generic unused scale). Warm charcoal rather than neutral-black:
        // the whole visual system leans on this being a shade of dark wood /
        // late-service lighting, not a generic tech-dashboard black.
        hf: {
          bg: "#131210",
          surface: "#1b1916",
          surfaceHi: "#242019",
          line: "#332e24",
          ink: "#f3efe6",
          inkMuted: "#a49b8a",
          inkFaint: "#6f6858",
        },
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-hf-display)", "Georgia", "serif"],
        body: ["var(--font-hf-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-hf-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
