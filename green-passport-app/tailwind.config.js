/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Header sáng, nav dạng pill nổi trên nền trắng
        header: "#123725",
        canvas: "#F4FAF5",
        canvas2: "#E7F5EC",
        line: "#E3ECE4",
        ink: {
          DEFAULT: "#0F2A1D",
          700: "#2F4A3B",
          600: "#57685C",
          400: "#8B9B8E",
        },
        // Xanh teal của thẻ Passport
        pine: {
          950: "#173539",
          900: "#1A3B40",
          800: "#205656",
          700: "#257167",
          600: "#2A7A6E",
        },
        // Xanh lá tươi cho CTA, số liệu nổi bật (tham khảo bảng màu HSA Education)
        brand: {
          DEFAULT: "#0FA968",
          600: "#0C9660",
          700: "#0A7F52",
          soft: "#E4F7EC",
        },
        mint: {
          50: "#EAF6EF",
          100: "#D2EFDD",
          200: "#B8E6D0",
          400: "#7ED3AE",
          500: "#64BF9C",
        },
        honey: {
          DEFAULT: "#E3A63C",
          soft: "#FBEBCF",
        },
      },
      fontFamily: {
        sans: ['"Be Vietnam Pro"', '"Segoe UI"', "system-ui", "sans-serif"],
      },
      boxShadow: {
        soft: "0 10px 26px -10px rgba(17,59,37,.14), 0 2px 6px rgba(17,59,37,.05)",
        card: "0 16px 34px -16px rgba(17,59,37,.16), 0 2px 8px rgba(17,59,37,.05)",
        hero: "0 24px 48px -16px rgba(16,55,52,.42), 0 6px 14px rgba(16,55,52,.12)",
        pop: "0 18px 40px -10px rgba(15,42,29,.35), 0 3px 10px rgba(15,42,29,.12)",
        navbar: "0 8px 24px -12px rgba(17,59,37,.12)",
      },
      keyframes: {
        rise: {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        rise: "rise .18s ease-out",
      },
    },
  },
  plugins: [],
};
