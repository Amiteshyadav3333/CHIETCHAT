#!/usr/bin/env bash
# exit on error
set -o errexit

# Build the SPA into Flask's static directory as well, so direct requests and
# refreshes of client-side routes work when the backend serves the app shell.

echo "Installing Python dependencies..."
pip install -r backend/requirements.txt

echo "Building frontend app shell..."
cd frontend
npm ci
npm run build
cd ..

mkdir -p backend/static
cp -R frontend/dist/. backend/static/

echo "Build complete!"
