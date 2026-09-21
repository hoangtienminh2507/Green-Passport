/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        forest: {
          900: "#0F2A20",
          800: "#163C2C",
          700: "#1B4332",
          600: "#2D6A4F",
        },
        leaf: {
          500: "#52B788",
          400: "#74C69D",
          100: "#DDF2E6",
        },
        sand: {
          50: "#F3F6F1",
          100: "#EAF0E7",
        },
        ink: {
          900: "#132318",
          600: "#4A5C4F",
          400: "#7E9084",
        },
        amber: {
          500: "#E3A63C",
          100: "#FBEBCF",
        },
      },
      fontFamily: {
        display: ["Sora", "system-ui", "sans-serif"],
        body: ["Inter", "system-ui", "sans-serif"],
      },
      borderRadius: {
        lg: "20px",
        md: "14px",
      },
    },
  },
  plugins: [],
};
