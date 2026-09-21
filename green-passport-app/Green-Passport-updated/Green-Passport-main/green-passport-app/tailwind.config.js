/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Thanh header + tab đang chọn (lấy từ mẫu giao diện)
        header: "#123725",
        canvas: "#F1F4ED",
        line: "#E1E8DC",
        ink: {
          DEFAULT: "#0F2A1D",
          700: "#2F4A3B",
          600: "#4A5C4F",
          400: "#7E9084",
        },
        // Xanh teal của thẻ Passport và nút hành động
        pine: {
          950: "#173539",
          900: "#1A3B40",
          800: "#205656",
          700: "#257167",
          600: "#2A7A6E",
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
        soft: "0 10px 26px -8px rgba(17,59,37,.20), 0 2px 6px rgba(17,59,37,.06)",
        hero: "0 22px 40px -14px rgba(16,55,52,.55), 0 4px 10px rgba(16,55,52,.15)",
        pop: "0 18px 40px -10px rgba(15,42,29,.35), 0 3px 10px rgba(15,42,29,.12)",
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
