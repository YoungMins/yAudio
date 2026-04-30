/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: {
          dark: "#0A0A0A",
          light: "#F9FAFB",
        },
        accent: {
          dark: "#8B5CF6",
          light: "#6D28D9",
        },
        panel: {
          dark: "rgba(255,255,255,0.04)",
          light: "rgba(0,0,0,0.04)",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      borderRadius: {
        glass: "10px",
      },
      backdropBlur: {
        glass: "12px",
      },
    },
  },
  plugins: [],
};
