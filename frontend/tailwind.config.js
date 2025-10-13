/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './*.{html,js}',
    './dashboard/**/*.{html,js}',
    './analytics/**/*.{html,js}'
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
          sans: ['Inter', 'sans-serif'],
      },
      backgroundImage: {
          'grid-light': "linear-gradient(rgba(0,0,0,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.03) 1px, transparent 1px)",
          'grid-dark': "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
      },
      backgroundSize: { 'grid-size': '25px 25px', }
    },
  },
  plugins: [],
}