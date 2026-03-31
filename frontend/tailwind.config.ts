import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        shell: "#04070d",
        night: "#081118",
        sand: "#0c141b",
        line: "#1a2a34",
        haze: "#8da4b0",
        ink: "#f4fbf7",
        coral: "#b8ff64",
        moss: "#46d98a",
        gold: "#d7f59c",
      },
      fontFamily: {
        display: ["Space Grotesk", "ui-sans-serif", "sans-serif"],
        body: ["Manrope", "ui-sans-serif", "sans-serif"],
      },
      boxShadow: {
        card: "0 28px 80px rgba(0, 0, 0, 0.42)",
        glow: "0 0 0 1px rgba(184, 255, 100, 0.08), 0 18px 50px rgba(144, 255, 87, 0.18)",
      },
    },
  },
  plugins: [],
} satisfies Config;
