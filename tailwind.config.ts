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
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
