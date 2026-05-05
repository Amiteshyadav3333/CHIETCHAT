#!/usr/bin/env bash
# exit on error
set -o errexit

# Frontend is deployed separately on Vercel.
# This script only installs Python dependencies for the backend.

echo "Installing Python dependencies..."
pip install -r backend/requirements.txt

echo "Build complete!"
