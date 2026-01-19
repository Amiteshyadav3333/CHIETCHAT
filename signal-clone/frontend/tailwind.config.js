/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                signal: {
                    bg: '#0a0a0a', // Deeper black
                    secondary: '#171717', // Richer dark gray
                    accent: '#2563eb', // Vivid Blue
                    accentHover: '#1d4ed8',
                    input: '#262626',
                    text: '#f3f4f6',
                    muted: '#9ca3af',
                    incoming: '#262626',
                    outgoing: '#2563eb',
                    danger: '#ef4444'
                }
            }
        },
    },
    plugins: [],
}
