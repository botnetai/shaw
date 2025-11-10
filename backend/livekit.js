import { AccessToken } from 'livekit-server-sdk';
import crypto from 'crypto';

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = process.env.LIVEKIT_URL;

// Debug logging
console.log('🔑 LiveKit Config:', {
  apiKey: LIVEKIT_API_KEY ? `${LIVEKIT_API_KEY.slice(0, 6)}...` : 'NOT SET',
  apiSecret: LIVEKIT_API_SECRET ? 'SET' : 'NOT SET',
  url: LIVEKIT_URL
});

export function generateRoomName() {
  return `room-${crypto.randomBytes(8).toString('hex')}`;
}

export async function generateLiveKitToken(roomName, participantName) {
  if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    throw new Error('LiveKit credentials not configured');
  }

  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: participantName,
    ttl: '10h', // Token valid for 10 hours
  });

  at.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  const token = await at.toJwt();
  return token;
}

export function getLiveKitUrl() {
  if (!LIVEKIT_URL) {
    throw new Error('LiveKit URL not configured');
  }
  return LIVEKIT_URL;
}
