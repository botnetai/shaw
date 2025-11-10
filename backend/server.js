import { config } from 'dotenv';
config(); // Load env vars FIRST

import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import db from './database.js';
import { generateRoomName, generateLiveKitToken, getLiveKitUrl } from './livekit.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Simple auth middleware (checks Bearer token exists)
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  // In production, validate token properly
  // For now, just check it exists
  req.userId = 'user-' + Buffer.from(token).toString('base64').slice(0, 10);
  next();
};

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 1. POST /v1/sessions/start - Start new session
app.post('/v1/sessions/start', authenticateToken, async (req, res) => {
  try {
    const { context } = req.body;

    if (!context || !['phone', 'carplay'].includes(context)) {
      return res.status(400).json({ error: 'Invalid context' });
    }

    const sessionId = `session-${crypto.randomUUID()}`;
    const roomName = generateRoomName();
    const participantName = `${req.userId}-${Date.now()}`;

    // Generate LiveKit token
    const livekitToken = await generateLiveKitToken(roomName, participantName);
    const livekitUrl = getLiveKitUrl();

    // Store session in database
    const stmt = db.prepare(`
      INSERT INTO sessions (id, user_id, context, started_at, logging_enabled_snapshot, summary_status)
      VALUES (?, ?, ?, ?, 1, 'pending')
    `);
    stmt.run(sessionId, req.userId, context, new Date().toISOString());

    res.json({
      session_id: sessionId,
      livekit_url: livekitUrl,
      livekit_token: livekitToken,
      room_name: roomName
    });
  } catch (error) {
    console.error('Start session error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 2. POST /v1/sessions/end - End session
app.post('/v1/sessions/end', authenticateToken, (req, res) => {
  try {
    const { session_id } = req.body;

    if (!session_id) {
      return res.status(400).json({ error: 'Missing session_id' });
    }

    const stmt = db.prepare('UPDATE sessions SET ended_at = ? WHERE id = ? AND user_id = ?');
    const result = stmt.run(new Date().toISOString(), session_id, req.userId);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.status(204).send();
  } catch (error) {
    console.error('End session error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 3. POST /v1/sessions/{id}/turns - Log conversation turn
app.post('/v1/sessions/:id/turns', authenticateToken, (req, res) => {
  try {
    const sessionId = req.params.id;
    const { speaker, text, timestamp } = req.body;

    if (!speaker || !text || !['user', 'assistant'].includes(speaker)) {
      return res.status(400).json({ error: 'Invalid turn data' });
    }

    // Verify session belongs to user
    const session = db.prepare('SELECT id FROM sessions WHERE id = ? AND user_id = ?')
      .get(sessionId, req.userId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const turnId = `turn-${crypto.randomUUID()}`;
    const turnTimestamp = timestamp || new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO turns (id, session_id, timestamp, speaker, text)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(turnId, sessionId, turnTimestamp, speaker, text);

    res.status(201).json({ id: turnId });
  } catch (error) {
    console.error('Log turn error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 4. GET /v1/sessions - Fetch user's sessions
app.get('/v1/sessions', authenticateToken, (req, res) => {
  try {
    const sessions = db.prepare(`
      SELECT
        s.id,
        COALESCE(sm.title, 'Session ' || substr(s.id, 9, 8)) as title,
        COALESCE(sm.summary_text, 'No summary available') as summary_snippet,
        s.started_at,
        s.ended_at
      FROM sessions s
      LEFT JOIN summaries sm ON s.id = sm.session_id
      WHERE s.user_id = ?
      ORDER BY s.started_at DESC
      LIMIT 50
    `).all(req.userId);

    res.json(sessions);
  } catch (error) {
    console.error('Fetch sessions error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 5. GET /v1/sessions/{id} - Get session details
app.get('/v1/sessions/:id', authenticateToken, (req, res) => {
  try {
    const sessionId = req.params.id;

    const session = db.prepare(`
      SELECT * FROM sessions WHERE id = ? AND user_id = ?
    `).get(sessionId, req.userId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json(session);
  } catch (error) {
    console.error('Get session error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 6. GET /v1/sessions/{id}/turns - Get conversation turns
app.get('/v1/sessions/:id/turns', authenticateToken, (req, res) => {
  try {
    const sessionId = req.params.id;

    // Verify session belongs to user
    const session = db.prepare('SELECT id FROM sessions WHERE id = ? AND user_id = ?')
      .get(sessionId, req.userId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const turns = db.prepare(`
      SELECT * FROM turns WHERE session_id = ? ORDER BY timestamp ASC
    `).all(sessionId);

    res.json(turns);
  } catch (error) {
    console.error('Get turns error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 7. GET /v1/sessions/{id}/summary - Get session summary
app.get('/v1/sessions/:id/summary', authenticateToken, (req, res) => {
  try {
    const sessionId = req.params.id;

    // Verify session belongs to user
    const session = db.prepare('SELECT id FROM sessions WHERE id = ? AND user_id = ?')
      .get(sessionId, req.userId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const summary = db.prepare('SELECT * FROM summaries WHERE session_id = ?')
      .get(sessionId);

    if (!summary) {
      return res.status(404).json({ error: 'Summary not found' });
    }

    // Parse JSON arrays
    summary.action_items = JSON.parse(summary.action_items);
    summary.tags = JSON.parse(summary.tags);

    res.json(summary);
  } catch (error) {
    console.error('Get summary error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 8. DELETE /v1/sessions/{id} - Delete session
app.delete('/v1/sessions/:id', authenticateToken, (req, res) => {
  try {
    const sessionId = req.params.id;

    const stmt = db.prepare('DELETE FROM sessions WHERE id = ? AND user_id = ?');
    const result = stmt.run(sessionId, req.userId);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.status(204).send();
  } catch (error) {
    console.error('Delete session error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 9. POST /v1/auth/login - Simple login (returns mock token)
app.post('/v1/auth/login', (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Missing credentials' });
    }

    // Mock auth - in production, validate against real user database
    const token = Buffer.from(`${email}:${Date.now()}`).toString('base64');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours

    res.json({
      token,
      expires_at: expiresAt
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 10. POST /v1/auth/refresh - Refresh auth token
app.post('/v1/auth/refresh', authenticateToken, (req, res) => {
  try {
    // Generate new token
    const token = Buffer.from(`${req.userId}:${Date.now()}`).toString('base64');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    res.json({
      token,
      expires_at: expiresAt
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Database: ${db.name}`);
  console.log(`🎙️  LiveKit URL: ${process.env.LIVEKIT_URL || 'Not configured'}`);
});
