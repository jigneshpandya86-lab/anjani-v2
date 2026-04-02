/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        amz: { navy: '#131921', orange: '#ff9900', bg: '#eaeded', border: '#dddddd' }
      }
    },
  },
  plugins: [],
}