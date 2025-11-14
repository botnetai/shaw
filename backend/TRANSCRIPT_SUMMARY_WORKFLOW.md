# Transcript and Summary Workflow

## Overview

This document describes the complete workflow for capturing conversation transcripts and generating summaries that are linked back to sessions.

## Workflow Steps

### 1. Session Creation
- **Endpoint**: `POST /v1/sessions/start`
- **Action**: Creates a new session with `summary_status = 'pending'`
- **Location**: `backend/server.js` line 391-402
- **Session ID Format**: `session-{UUID}`

### 2. Agent Dispatch
- **Function**: `dispatchAgentToRoom()` in `backend/livekit.js`
- **Action**: Dispatches agent to room with `session_id` in metadata
- **Metadata**: JSON string containing `session_id`, `realtime`, `model`, `voice`, etc.
- **Location**: `backend/livekit.js` line 99-107

### 3. Agent Receives Session ID
- **Location**: `backend/agent.py` entrypoint function
- **Action**: Parses metadata to extract `session_id`
- **Code**: Lines 159-171 in `agent.py`
- **Logging**: Logs session ID when received

### 4. Conversation Turn Capture
- **Function**: `save_turn()` in `backend/agent.py`
- **Triggers**: 
  - `user_speech_committed` event → saves user turn
  - `agent_speech_committed` event → saves assistant turn
- **Endpoint**: `POST /v1/sessions/{session_id}/turns` (no auth required)
- **Data Saved**: `speaker`, `text`, `timestamp`
- **Database**: `turns` table with foreign key to `sessions(id)`

### 5. Session End
- **Endpoint**: `POST /v1/sessions/end`
- **Action**: Sets `ended_at` timestamp on session
- **Location**: `backend/server.js` line 490-529
- **Trigger**: iOS app calls this when call ends

### 6. Background Summary Processing
- **Function**: `processPendingSummaries()` in `backend/server.js`
- **Frequency**: Runs every 30 seconds
- **Query**: Finds sessions with:
  - `summary_status = 'pending'`
  - `ended_at IS NOT NULL`
  - `logging_enabled_snapshot = true`
- **Limit**: Processes up to 5 sessions per run
- **Location**: `backend/server.js` line 258-282

### 7. Summary Generation
- **Function**: `generateSummaryAndTitle()` in `backend/server.js`
- **Steps**:
  1. **Verify Session Ended**: Skips generation unless `ended_at` is set
  2. **Pull Transcript**: Queries all turns for the session, ordered by timestamp
  3. **Format Transcript**: Converts to `speaker: text` format
  4. **Generate Summary**: Uses a single GPT-4o Mini prompt once the room is over
  5. **Generate Title**: Issues a second GPT-4o Mini prompt using the summary text as context
  6. **Save Summary**: Inserts into `summaries` table with foreign key to `sessions(id)` — action items & tags are stored as empty arrays for compatibility
  7. **Update Status**: Sets `summary_status = 'ready'` on session
- **Location**: `backend/server.js` line 107-256

### 8. Summary Retrieval
- **Endpoint**: `GET /v1/sessions/{id}`
- **Response**: Returns session object + summary object + turns array
- **Summary Link**: Uses `session_id` foreign key to join `summaries` table
- **Location**: `backend/server.js` line 590-640

## Database Schema

### Sessions Table
```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  summary_status TEXT DEFAULT 'pending',  -- 'pending', 'ready', or 'failed'
  ended_at TIMESTAMPTZ,
  ...
);
```

### Turns Table
```sql
CREATE TABLE turns (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  speaker TEXT NOT NULL,  -- 'user' or 'assistant'
  text TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);
```

### Summaries Table
```sql
CREATE TABLE summaries (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE,  -- One summary per session
  title TEXT NOT NULL,
  summary_text TEXT NOT NULL,
  action_items TEXT NOT NULL,  -- JSON array
  tags TEXT NOT NULL,  -- JSON array
  created_at TIMESTAMPTZ NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);
```

## Status Flow

```
pending → (session ends) → (background job runs) → ready
   ↓                           ↓
failed (no turns)        failed (error)
```

## Error Handling

### No Turns Found
- **Status**: Set to `'failed'` (matches Swift `SummaryStatus` enum)
- **Reason**: Cannot generate summary without transcript
- **Prevention**: Prevents infinite retries

### Summary Generation Failure
- **Status**: Set to `'failed'`
- **Logging**: Full error logged
- **Prevention**: Prevents infinite retries

### Turn Save Failure
- **Logging**: Error logged with session ID and speaker
- **Retry**: Not retried (turns are real-time events)
- **Impact**: Missing turns may result in incomplete summary

## Verification

To verify the workflow is working:

1. **Check Agent Logs**: Look for "Saved {speaker} turn" messages
2. **Check Session End**: Verify `ended_at` is set when session ends
3. **Check Background Job**: Look for "Processing X pending summary(ies)" every 30 seconds
4. **Check Summary Generation**: Look for "Summary generated and saved" messages
5. **Check API Response**: GET `/v1/sessions/{id}` should return `summary` object when ready

## Key Improvements Made

1. ✅ Changed 'skipped' to 'failed' to match Swift enum
2. ✅ Added comprehensive logging throughout workflow
3. ✅ Added timeout handling for turn saves
4. ✅ Added better error messages with context
5. ✅ Verified foreign key relationships ensure data integrity
6. ✅ Added logging to track summary generation progress

## Testing Checklist

- [ ] Agent saves user turns correctly
- [ ] Agent saves assistant turns correctly
- [ ] Session ends properly with `ended_at` set
- [ ] Background job processes pending summaries
- [ ] Summary is generated from turns
- [ ] Summary is saved with correct `session_id`
- [ ] Session `summary_status` is updated to 'ready'
- [ ] GET endpoint returns summary when available
- [ ] Summary is properly linked to session via foreign key
