# WebDMX API Specification v1.0
Based on grandMA2/3 architecture

## Base URL
```
http://localhost:3000/api
```

## Response Format
All responses are JSON with consistent structure:
```json
{
  "success": true,
  "data": {},
  "error": null,
  "timestamp": "2025-12-20T12:00:00.000Z"
}
```

---

## 1. System & Status

### GET /health
Server health check
```json
{
  "status": "ok",
  "dmx": true,
  "database": true,
  "timestamp": "..."
}
```

### GET /system/status
Complete system status
```json
{
  "dmx": {
    "connected": true,
    "universes": [1],
    "port": "/dev/cu.usbserial-132120"
  },
  "programmer": {
    "active": true,
    "selectedFixtures": [1, 2, 3],
    "modifiedAttributes": ["intensity", "color"]
  },
  "playback": {
    "activeExecutors": [1, 2],
    "runningSequences": [1]
  }
}
```

---

## 2. DMX Control (Low-Level)

### GET /dmx/universes
List all DMX universes
```json
{
  "universes": [
    { "id": 1, "channels": 512, "active": true }
  ]
}
```

### GET /dmx/universe/:id/channels
Get all channels for a universe
```json
{
  "universe": 1,
  "channels": [0, 255, 128, ...] // 512 values
}
```

### POST /dmx/channel
Set single DMX channel
```json
// Request
{ "universe": 1, "channel": 1, "value": 255 }
// Response
{ "success": true }
```

### POST /dmx/channels
Set multiple DMX channels
```json
// Request
{
  "universe": 1,
  "startChannel": 1,
  "values": [255, 128, 64]
}
```

### POST /dmx/blackout
Blackout all channels
```json
{ "success": true }
```

---

## 3. Fixtures (Patch)

### GET /fixtures
Get all patched fixtures
```json
{
  "fixtures": [
    {
      "id": 1,
      "name": "LED Par 1",
      "manufacturer": "Generic",
      "model": "RGB Par",
      "fixtureType": "rgb",
      "universe": 1,
      "dmxAddress": 1,
      "channelCount": 3,
      "attributes": [
        { "name": "Red", "type": "red", "channel": 1 },
        { "name": "Green", "type": "green", "channel": 2 },
        { "name": "Blue", "type": "blue", "channel": 3 }
      ]
    }
  ]
}
```

### POST /fixtures
Create (patch) new fixture
```json
// Request
{
  "name": "Moving Head 1",
  "manufacturer": "Robe",
  "model": "Robin 600",
  "fixtureType": "moving_head",
  "universe": 1,
  "dmxAddress": 10,
  "mode": "16ch_extended",
  "attributes": [...]
}
```

### PUT /fixtures/:id
Update fixture
```json
{
  "name": "LED Par 1 Updated",
  "dmxAddress": 5
}
```

### DELETE /fixtures/:id
Delete (unpatch) fixture

### GET /fixtures/library
Get fixture library (available fixture types)
```json
{
  "library": [
    {
      "manufacturer": "Generic",
      "model": "RGB Par",
      "modes": [
        {
          "name": "3ch",
          "channels": 3,
          "attributes": [...]
        }
      ]
    }
  ]
}
```

---

## 4. Groups

### GET /groups
Get all fixture groups
```json
{
  "groups": [
    {
      "id": 1,
      "name": "All Pars",
      "fixtures": [1, 2, 3],
      "selectionOrder": [1, 2, 3]
    }
  ]
}
```

### POST /groups
Create new group
```json
{
  "name": "Stage Left",
  "fixtures": [1, 3, 5]
}
```

### PUT /groups/:id
Update group

### DELETE /groups/:id
Delete group

---

## 5. Programmer

### GET /programmer
Get current programmer state
```json
{
  "active": true,
  "selectedFixtures": [1, 2, 3],
  "values": {
    "1": { "intensity": 255, "red": 255, "green": 0, "blue": 0 },
    "2": { "intensity": 200, "red": 255, "green": 0, "blue": 0 }
  }
}
```

### POST /programmer/select
Select fixtures
```json
{
  "fixtures": [1, 2, 3]
}
// Or by group
{
  "group": 1
}
```

### POST /programmer/deselect
Deselect fixtures / clear selection
```json
{
  "fixtures": [1] // Or empty to deselect all
}
```

### POST /programmer/set-attribute
Set attribute value for selected fixtures
```json
{
  "attribute": "intensity",
  "value": 255
}
// Or multiple fixtures
{
  "values": {
    "1": { "intensity": 255 },
    "2": { "intensity": 200 }
  }
}
```

### POST /programmer/clear
Clear programmer (discard changes)
```json
{ "success": true }
```

### POST /programmer/output
Output programmer values to DMX (live control)
```json
{ "success": true }
```

---

## 6. Presets

### GET /presets
Get all presets
```json
{
  "presets": [
    {
      "id": 1,
      "name": "Red",
      "type": "color",
      "values": {
        "red": 255,
        "green": 0,
        "blue": 0
      }
    }
  ]
}
```

### GET /presets/:type
Get presets by type (color, position, beam, gobo, etc.)

### POST /presets
Create preset from programmer
```json
{
  "name": "Warm White",
  "type": "color",
  "values": {
    "red": 255,
    "green": 200,
    "blue": 150
  }
}
```

### PUT /presets/:id
Update preset

### DELETE /presets/:id
Delete preset

### POST /presets/:id/recall
Apply preset to selected fixtures
```json
{ "success": true }
```

---

## 7. Sequences (Cue Lists)

### GET /sequences
Get all sequences
```json
{
  "sequences": [
    {
      "id": 1,
      "name": "Main Show",
      "cueCount": 15,
      "defaultFadeIn": 3.0,
      "defaultFadeOut": 3.0,
      "tracking": true
    }
  ]
}
```

### POST /sequences
Create new sequence
```json
{
  "name": "Song 1",
  "defaultFadeIn": 2.0,
  "defaultFadeOut": 2.0,
  "tracking": true
}
```

### GET /sequences/:id
Get sequence details with all cues

### PUT /sequences/:id
Update sequence

### DELETE /sequences/:id
Delete sequence

---

## 8. Cues

### GET /sequences/:sequenceId/cues
Get all cues in sequence
```json
{
  "cues": [
    {
      "id": 1,
      "cueNumber": 1.0,
      "name": "Intro",
      "fadeIn": 3.0,
      "fadeOut": 3.0,
      "delay": 0.0,
      "wait": 0.0,
      "follow": null,
      "trigger": "manual"
    }
  ]
}
```

### POST /sequences/:sequenceId/cues
Store cue from programmer
```json
{
  "cueNumber": 1.5,
  "name": "Bridge",
  "fadeIn": 2.0,
  "fadeOut": 2.0
}
```

### PUT /sequences/:sequenceId/cues/:cueId
Update cue (merge or overwrite from programmer)
```json
{
  "name": "Updated Name",
  "fadeIn": 5.0,
  "merge": true // or false to replace
}
```

### DELETE /sequences/:sequenceId/cues/:cueId
Delete cue

### GET /sequences/:sequenceId/cues/:cueId
Get cue details with all values
```json
{
  "cue": {
    "id": 1,
    "cueNumber": 1.0,
    "name": "Intro",
    "values": {
      "1": { "intensity": 255, "red": 255, "green": 0, "blue": 0 },
      "2": { "intensity": 200, "pan": 128, "tilt": 64 }
    }
  }
}
```

### POST /sequences/:sequenceId/cues/:cueId/goto
Jump to specific cue
```json
{
  "fadeTime": 3.0 // Optional override
}
```

---

## 9. Executors (Playback)

### GET /executors
Get all executors
```json
{
  "executors": [
    {
      "id": 1,
      "page": 1,
      "number": 1,
      "name": "Main Show",
      "type": "sequence",
      "sequenceId": 1,
      "faderLevel": 100,
      "status": "running",
      "currentCue": 3
    }
  ]
}
```

### POST /executors
Assign sequence to executor
```json
{
  "page": 1,
  "number": 1,
  "sequenceId": 1,
  "name": "Main Show"
}
```

### PUT /executors/:id/fader
Set executor fader level
```json
{
  "level": 75 // 0-100
}
```

### POST /executors/:id/go
Execute GO (next cue)
```json
{ "success": true }
```

### POST /executors/:id/pause
Pause executor
```json
{ "success": true }
```

### POST /executors/:id/off
Turn off executor (release)
```json
{ "success": true }
```

### POST /executors/:id/goto
Go to specific cue
```json
{
  "cueNumber": 5.0
}
```

---

## 10. Effects

### GET /effects
Get all effects
```json
{
  "effects": [
    {
      "id": 1,
      "name": "Dimmer Chase",
      "type": "dimmer",
      "speed": 1.0,
      "size": 100,
      "phase": 0,
      "form": "sine"
    }
  ]
}
```

### POST /effects
Create effect
```json
{
  "name": "Color Wave",
  "type": "color",
  "attributes": ["red", "green", "blue"],
  "speed": 2.0,
  "form": "wave"
}
```

### POST /effects/:id/start
Start effect on selected fixtures
```json
{ "fixtures": [1, 2, 3] }
```

### POST /effects/:id/stop
Stop effect

### PUT /effects/:id
Update effect parameters
```json
{
  "speed": 3.0,
  "size": 50
}
```

---

## 11. Stage View / Visualizer

### GET /stage/layout
Get stage layout with fixture positions
```json
{
  "fixtures": [
    {
      "id": 1,
      "x": 100,
      "y": 200,
      "rotation": 0,
      "name": "LED Par 1"
    }
  ]
}
```

### PUT /stage/fixture/:id/position
Update fixture position on stage
```json
{
  "x": 150,
  "y": 250,
  "rotation": 45
}
```

---

## 12. Timecode

### POST /timecode/enable
Enable timecode control
```json
{
  "type": "smpte", // or "audio", "midi"
  "sequenceId": 1
}
```

### POST /timecode/disable
Disable timecode

### GET /timecode/status
Get timecode status
```json
{
  "enabled": true,
  "type": "smpte",
  "currentTime": "00:02:30:15"
}
```

---

## 13. Shows & Sessions

### GET /shows
List all saved shows

### POST /shows
Save current show
```json
{
  "name": "Christmas Show 2025"
}
```

### POST /shows/:id/load
Load show

### DELETE /shows/:id
Delete show

---

## 14. Command Line

### POST /command
Execute MA-style command
```json
{
  "command": "Fixture 1 Thru 10 At 50"
}
// Response
{
  "success": true,
  "result": "10 fixtures set to 50%"
}
```

---

## WebSocket Events

### Connection
```
ws://localhost:3000/ws
```

### Events (Server → Client)

#### dmx.update
Real-time DMX channel updates
```json
{
  "event": "dmx.update",
  "universe": 1,
  "channel": 1,
  "value": 255
}
```

#### programmer.changed
Programmer state changed
```json
{
  "event": "programmer.changed",
  "selectedFixtures": [1, 2, 3]
}
```

#### executor.status
Executor status changed
```json
{
  "event": "executor.status",
  "executorId": 1,
  "status": "running",
  "currentCue": 5
}
```

#### cue.activated
Cue activated
```json
{
  "event": "cue.activated",
  "sequenceId": 1,
  "cueId": 5,
  "cueNumber": 5.0
}
```

### Events (Client → Server)

#### subscribe
Subscribe to events
```json
{
  "action": "subscribe",
  "events": ["dmx.update", "executor.status"]
}
```

#### unsubscribe
Unsubscribe from events
```json
{
  "action": "unsubscribe",
  "events": ["dmx.update"]
}
```

---

## Error Codes

- `400` - Bad Request (invalid parameters)
- `404` - Not Found (resource doesn't exist)
- `409` - Conflict (e.g., DMX address already in use)
- `500` - Internal Server Error
- `503` - Service Unavailable (DMX interface not connected)

## Rate Limiting

DMX updates are throttled to 44Hz (DMX refresh rate).
API calls are limited to 100 requests/second per client.
