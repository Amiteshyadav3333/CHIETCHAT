#!/usr/bin/env bash
# exit on error
set -o errexit

echo "Installing Node dependencies..."
npm install --prefix frontend

echo "Building Frontend..."
npm run build --prefix frontend

echo "Setting up Static Files..."
# Create the static directory in backend if it doesn't exist
mkdir -p backend/static

# Copy dist content to backend/static
# -r recursive, -T treat destination as a normal file (avoid nesting if dir exists) is NOT standard in all cp, but -r is.
# We want contents of dist to be IN static.
# If static exists, 'cp -r frontend/dist backend/static' puts 'dist' INSIDE 'static'.
# We want the contents.
cp -r frontend/dist/* backend/static/

echo "Installing Python dependencies..."
pip install -r backend/requirements.txt
