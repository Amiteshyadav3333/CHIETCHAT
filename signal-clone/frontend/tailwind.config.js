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
                    bg: '#121212', // Main dark background
                    secondary: '#1f1f1f', // Sidebar/Item background
                    accent: '#3b82f6', // Signal Blue
                    input: '#2c2c2c',
                    text: '#eaeaea',
                    muted: '#8e8e8e',
                    incoming: '#2c2c2c',
                    outgoing: '#3b82f6'
                }
            }
        },
    },
    plugins: [],
}
