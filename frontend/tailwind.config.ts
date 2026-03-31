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
      },
      fontFamily: {
        display: ["Georgia", "serif"],
        body: ["ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 18px 40px rgba(24, 32, 40, 0.12)",
      },
    },
  },
  plugins: [],
} satisfies Config;
