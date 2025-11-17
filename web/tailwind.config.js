/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#2F4BFF",
          muted: "#E5E8FF"
        }
      }
    }
  },
  plugins: []
};

