/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        kpc: {
          green: "#0B6B3A",
          dark: "#072C1B",
          amber: "#F59E0B",
          red: "#DC2626",
          slate: "#1E293B",
        },
      },
      fontFamily: {
        mono: ["'IBM Plex Mono'", "ui-monospace", "SFMono-Regular", "monospace"],
      },
    },
  },
  plugins: [],
};