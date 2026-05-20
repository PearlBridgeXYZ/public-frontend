/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Pearl's signature color — deep teal/cyan, adjust once branding is confirmed
        pearl: "#00e5d0",
      },
    },
  },
  plugins: [],
};
