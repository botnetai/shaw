#!/bin/bash

# Wrapper script at repo root that calls backend/start.sh
# This allows Railway to find start.sh when Root Directory is set to "."

cd "$(dirname "$0")/backend" || exit 1
exec bash start.sh

