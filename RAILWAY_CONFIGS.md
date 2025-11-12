# Railway Configuration Files

## Current Setup

We deploy from the **repo root** with Root Directory = `.` in Railway dashboard.

### Main Service (Node.js + Python Agent)

**File**: `railway.json` (at repo root)
- **Purpose**: Combined service running both Node.js server and Python agent
- **Start Command**: `bash start.sh` (wrapper that calls `backend/start.sh`)
- **Build Config**: `nixpacks.toml` (at repo root)

### Python-Only Service (Separate Agent Service)

**File**: `backend/railway-agent.json` (reference only)
- **Purpose**: Separate Railway service that runs ONLY the Python agent
- **Start Command**: `bash start-agent.sh`
- **Build Config**: `backend/nixpacks-agent.toml`
- **Note**: This is a reference file. If you create a separate Python service in Railway, copy these settings to the dashboard or use this file.

## File Structure

```
shaw-app/
├── railway.json              ← Main service config (Node.js + Python)
├── nixpacks.toml             ← Main service build config
├── start.sh                  ← Wrapper script (calls backend/start.sh)
├── backend/
│   ├── start.sh              ← Actual startup script
│   ├── start-agent.sh        ← Python-only startup script
│   ├── nixpacks-agent.toml   ← Python-only build config
│   └── railway-agent.json    ← Python-only service config (reference)
```

## Railway Dashboard Settings

### Main Service
- **Root Directory**: `.` (root)
- **Nixpacks Config Path**: `nixpacks.toml` (or leave empty, Railway will find it)
- **Start Command**: `bash start.sh` (or leave empty, uses railway.json)

### Python Service (if separate)
- **Root Directory**: `backend`
- **Nixpacks Config Path**: `nixpacks-agent.toml`
- **Start Command**: `bash start-agent.sh`

## Why This Structure?

- **Single source of truth**: Main service uses root-level configs
- **Clear separation**: Python-only service has its own configs in backend/
- **Works with CLI**: `railway up` from root works correctly
- **Works with GitHub**: Auto-deploy works correctly

## Removed Files

- ~~`backend/railway.json`~~ - Removed, no longer needed (replaced by root `railway.json`)

