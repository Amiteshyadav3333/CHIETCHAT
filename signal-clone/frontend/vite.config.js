import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const apiTarget = process.env.VITE_API_TARGET || 'http://127.0.0.1:5001'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    server: {
        proxy: {
            '/api': {
                target: apiTarget,
                changeOrigin: true,
            },
            '/socket.io': {
                target: apiTarget,
                ws: true,
            },
            '/uploads': {
                target: apiTarget,
                changeOrigin: true,
            }
        },
        port: 3000
    },
    build: {
        chunkSizeWarningLimit: 700,
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (
                        id.includes('node_modules/react/') ||
                        id.includes('node_modules/react-dom/') ||
                        id.includes('node_modules/react-router') ||
                        id.includes('node_modules/socket.io-client') ||
                        id.includes('node_modules/axios/')
                    ) {
                        return 'core';
                    }
                    if (
                        id.includes('node_modules/@heroicons/') ||
                        id.includes('node_modules/emoji-picker-react/') ||
                        id.includes('node_modules/framer-motion/') ||
                        id.includes('node_modules/date-fns/') ||
                        id.includes('node_modules/react-toastify/')
                    ) {
                        return 'ui-vendor';
                    }
                    if (id.includes('node_modules/peerjs/')) {
                        return 'rtc-vendor';
                    }
                }
            }
        }
    }
})
