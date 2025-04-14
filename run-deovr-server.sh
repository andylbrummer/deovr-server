#!/bin/bash

# This script always downloads and runs the latest version of deovr-server

# Set default values
PORT=${1:-3000}
DIRECTORY=${2:-.}

# Run the latest version of deovr-server using npx
# The --yes flag skips the confirmation prompt
# The -- separates npx options from the command options
echo "Starting deovr-server with latest version..."
npx --yes deovr-server@latest -p $PORT $DIRECTORY
