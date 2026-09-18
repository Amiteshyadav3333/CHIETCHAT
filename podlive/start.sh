#!/bin/bash

echo "Starting PodLive Application Environment..."

# Function to handle exit
cleanup() {
    echo "Shutting down..."
    kill 0
    exit
}

trap cleanup SIGINT SIGTERM

echo "Starting LiveKit server..."
livekit-server --config livekit.yaml &
sleep 2

echo "Starting Backend..."
(cd podlive-backend && node src/index.js) &
sleep 2

echo "Starting Frontend..."
(cd podlive-web && npm run dev) &

echo "PodLive is running!"
echo "- Frontend: http://localhost:3000"
echo "- Backend: http://localhost:5005"
echo "- LiveKit Server: ws://127.0.0.1:7880"
echo "Press Ctrl+C to stop."

wait
