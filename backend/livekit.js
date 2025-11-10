import { AccessToken } from 'livekit-server-sdk';
import crypto from 'crypto';

// Read environment variables lazily to ensure dotenv has loaded them
function getLiveKitApiKey() {
  const key = process.env.LIVEKIT_API_KEY?.trim();
  if (!key) {
    console.error('❌ LIVEKIT_API_KEY is not set in environment variables');
  }
  return key;
}

function getLiveKitApiSecret() {
  const secret = process.env.LIVEKIT_API_SECRET?.trim();
  if (!secret) {
    console.error('❌ LIVEKIT_API_SECRET is not set in environment variables');
  }
  return secret;
}

function getLiveKitUrlValue() {
  const url = process.env.LIVEKIT_URL?.trim();
  if (!url) {
    console.error('❌ LIVEKIT_URL is not set in environment variables');
  }
  return url;
}

// Debug logging (called after dotenv loads)
export function logLiveKitConfig() {
  const apiKey = getLiveKitApiKey();
  const apiSecret = getLiveKitApiSecret();
  const url = getLiveKitUrlValue();
  
  console.log('🔑 LiveKit Config:', {
    apiKey: apiKey ? `${apiKey.slice(0, 6)}...` : 'NOT SET',
    apiSecret: apiSecret ? 'SET' : 'NOT SET',
    url: url || 'NOT SET'
  });
}

export function generateRoomName() {
  return `room-${crypto.randomBytes(8).toString('hex')}`;
}

export async function generateLiveKitToken(roomName, participantName) {
  // Read credentials lazily
  const apiKey = getLiveKitApiKey();
  const apiSecret = getLiveKitApiSecret();
  
  // More detailed error checking
  if (!apiKey) {
    console.error('❌ LIVEKIT_API_KEY is missing');
    throw new Error('LiveKit credentials not configured: LIVEKIT_API_KEY is missing');
  }
  if (!apiSecret) {
    console.error('❌ LIVEKIT_API_SECRET is missing');
    throw new Error('LiveKit credentials not configured: LIVEKIT_API_SECRET is missing');
  }

  const at = new AccessToken(apiKey, apiSecret, {
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
  const url = getLiveKitUrlValue();
  if (!url) {
    throw new Error('LiveKit URL not configured: LIVEKIT_URL environment variable is missing');
  }
  return url;
}
