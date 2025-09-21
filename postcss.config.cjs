// PostCSS config adapted for Tailwind CSS plugin separation.
// Tailwind team moved the PostCSS plugin into a separate package `@tailwindcss/postcss`.
// See: https://tailwindcss.com/docs/installation (v4 transition notes)
module.exports = {
  plugins: {
    tailwindcss: {},  // '@tailwindcss/postcss' ではなく 'tailwindcss' を使用
    autoprefixer: {},
  },
}
