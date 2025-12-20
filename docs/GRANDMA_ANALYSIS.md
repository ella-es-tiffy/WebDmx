# grandMA2/3 Feature Analysis

## Core Concepts

### 1. Programming Philosophy
- **Fixture-based control** (not just channel-based)
- **Attributes** (Intensity, Position, Color, Beam, Focus, Control, etc.)
- **Presets** for attribute groups
- **Executors** (faders, buttons) for playback
- **Sequence-based** cue system
- **Command line** for quick access

### 2. Fixture Management
- Fixture library with manufacturer profiles
- Patch fixtures to DMX addresses
- Fixture groups
- Fixture selection
- Multi-instance fixtures (LED pixels, etc.)
- Clone fixtures

### 3. Attribute System
- **Dimmer/Intensity**
- **Position** (Pan/Tilt)
- **Color** (RGB, CMY, Color Wheel, CTO, CTB)
- **Gobo** (Rotating/Static)
- **Beam** (Zoom, Focus, Iris, Frost, Prism)
- **Shutter/Strobe**
- **Speed** (Pan/Tilt speed, effects speed)
- **Control** (Reset, Lamp on/off, etc.)

### 4. Programmer
- Central editing area
- Shows active values
- Track changes before storing
- Can be cleared
- Attribute faders for selected fixtures

### 5. Presets
- Color presets
- Position presets
- Beam presets
- Gobo presets
- Universal presets (any attribute)
- Preset pools

### 6. Groups
- Fixture groups for quick selection
- Can have selection order
- Wings (sub-groups)

### 7. Cues & Sequences
- Cue lists (sequences)
- Individual cues in sequences
- Fade times (In/Out/Delay)
- Cue parts (for split timing)
- Cue-only values vs. tracking
- Follow/Wait times
- Triggers

### 8. Executors (Playback)
- Fader executors
- Button executors
- Master faders
- Speed masters
- Rate masters
- Executor pages

### 9. Effects Engine
- Dimmer effects
- Position effects (circle, wave, etc.)
- Color effects
- Effect speed/size/phase
- Effect presets

### 10. Views & Layouts
- Multiple screen layouts
- Fixture sheet
- Channel sheet
- Cue list view
- Preset pools
- Group pools
- Effect pools
- Patch view
- Stage/3D view

### 11. Timecode & Playback
- SMPTE timecode sync
- Audio timecode
- Beat/BPM sync
- Goto cue
- Pause/Resume
- Crossfade time override

### 12. Macro System
- Record macros
- Button macros
- Timed macros

### 13. Multi-User & Sessions
- User profiles
- Show files
- Session modes

### 14. External Control
- MIDI control
- OSC control
- Telnet/SSH remote
- ArtNet/sACN DMX output
- Timecode input

## Key Data Structures Needed

### Fixtures
- ID, Name, Type, Manufacturer, Mode
- DMX Address, Universe
- Attribute channels mapping
- Physical position (for visualizer)

### Groups
- ID, Name
- Fixture list with selection order

### Presets
- ID, Name, Type (Color/Position/Beam/etc.)
- Attribute values
- Fixture references

### Sequences (Cue Lists)
- ID, Name
- List of cues
- Default fade times
- Tracking mode

### Cues
- Cue number (can be decimal: 1.5, 2.0, etc.)
- Name
- Fade In/Out/Delay times
- Attribute values per fixture
- Trigger type
- Follow/Wait times

### Executors
- ID, Page, Fader number
- Assigned sequence
- Fader mode (intensity, speed, rate, etc.)
- Button assignments

### Effects
- ID, Name, Type
- Effect parameters (speed, size, phase, form)
- Assigned fixtures/groups

### Programmer State
- Active fixture selection
- Modified attributes
- Preview values

## Essential MA Workflow
1. **Patch** fixtures to DMX
2. **Select** fixtures (via groups or numbers)
3. **Set** attribute values (using encoders/wheels/presets)
4. **Store** to cue/preset/group
5. **Playback** via executors
6. **Edit** cues/sequences
7. **Program** looks and shows
