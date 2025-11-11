#!/bin/bash
# Start both Node.js server and Python LiveKit agent

set -e

echo "🚀 Starting services..."

# Check Python is available
if ! command -v python3 &> /dev/null; then
    echo "❌ Python3 not found!"
    exit 1
fi

# Check pip packages
echo "📦 Checking Python dependencies..."
pip3 list | grep livekit || (echo "❌ LiveKit not installed!" && exit 1)

# Start Node.js server in background
echo "📦 Starting Node.js server..."
npm start &
NODE_PID=$!

# Wait for Node.js server to be ready
echo "⏳ Waiting for Node.js server..."
sleep 5

# Start Python LiveKit agent
echo "🤖 Starting LiveKit agent..."
python3 agent.py 2>&1 | sed 's/^/[AGENT] /' &
AGENT_PID=$!

echo "✅ Both services started!"
echo "   Node.js PID: $NODE_PID"
echo "   Agent PID: $AGENT_PID"

# Function to kill both on exit
cleanup() {
    echo "🛑 Shutting down services..."
    kill $NODE_PID $AGENT_PID 2>/dev/null || true
}
trap cleanup EXIT

# Wait for both processes
wait $NODE_PID $AGENT_PID
