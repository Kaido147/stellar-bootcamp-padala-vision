import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        sand: "#f5e8d6",
        ink: "#182028",
        coral: "#db6b45",
        moss: "#668b6c",
        gold: "#d6a44d",
        shell: "#f1ece3",
      },
      fontFamily: {
        display: ["Iowan Old Style", "Palatino Linotype", "Book Antiqua", "serif"],
        body: ["Avenir Next", "Segoe UI", "sans-serif"],
      },
      boxShadow: {
        card: "0 18px 40px rgba(24, 32, 40, 0.12)",
      },
    },
  },
  plugins: [],
} satisfies Config;
