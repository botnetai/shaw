import os
import logging
from dotenv import load_dotenv
from livekit import agents
from livekit.agents import AgentSession, Agent, RoomInputOptions
from livekit.plugins import silero

# Load environment variables from .env file
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class Assistant(Agent):
    def __init__(self) -> None:
        super().__init__(
            instructions="You are a helpful voice AI assistant for CarPlay. Keep responses concise and clear for safe driving."
        )

async def entrypoint(ctx: agents.JobContext):
    """Entry point for the LiveKit agent"""
    logger.info(f"🎙️  Agent joining room: {ctx.room.name}")

    # Get model and TTS from room metadata if available
    model = "openai/gpt-4.1-mini"  # Default
    tts = "cartesia/sonic-3:9626c31c-bec5-4cca-baa8-f8ba9e84c8bc"  # Default Coral voice

    try:
        session = AgentSession(
            stt="deepgram/nova-2-general:en",  # Using Deepgram via LiveKit Inference
            llm=model,
            tts=tts,
            vad=silero.VAD.load(),
        )

        await session.start(
            room=ctx.room,
            agent=Assistant(),
            room_input_options=RoomInputOptions(),
        )

        await session.generate_reply(
            instructions="Greet the user briefly and ask how you can help them."
        )

        logger.info("✅ Agent session started successfully")

    except Exception as e:
        logger.error(f"❌ Agent error: {e}")
        raise

if __name__ == "__main__":
    # Start the agent worker
    agents.cli.run_app(
        agents.WorkerOptions(
            entrypoint_fnc=entrypoint,
        ),
    )
