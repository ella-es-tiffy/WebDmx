# WebDMX Console - GrandMA2 Style Interface

Professional lighting control interface inspired by the iconic grandMA2 console.

## Features Implemented (v0.1.0)

### ✅ Core UI Structure
- **Top Bar**: System status, backend connection monitor, DMX output status
- **Left Sidebar**: Pool windows for Fixtures, Groups, and Presets
- **Center View**: 
  - Encoder section for attribute control (Dimmer, Pan, Tilt, Color)
  - DMX Channel Monitor (512 channels)
  - Command Line interface
  - Cue List / Playback section
- **Right Sidebar**: Executor faders (5 executors with Flash/Black/Go buttons)

### ✅ Visual Design
- Dark theme optimized for live environments
- Color scheme matching professional lighting consoles
- Responsive grid-based layout
- Interactive elements with hover effects
- Custom styled vertical faders
- Professional typography and spacing

### ✅ Functional Elements
- Real-time backend connection monitoring
- DMX channel value display (live updates every 1s)
- Command line with basic parser
- Pool item selection
- Executor fader control
- Channel selection

## Accessing the Console

Open in browser:
```
http://localhost:8082/console.html
```

## Command Line Usage

The command line supports basic commands:

- `fixture 1` or `fix 1` - Select fixture
- `group 1` - Select group
- `at 255` - Set value  
- `clear` - Clear selection

More commands will be added in future updates.

## Backend Requirements

- Backend server running on `http://localhost:3000`
- DMX controller connected and responding to `/health` endpoint
- Channel data available at `/api/dmx/channels`

## Next Steps / TODO

The following features are planned but not yet implemented:

### Device Management
- [ ] Add/Edit/Delete fixtures
- [ ] Fixture library with manufacturer profiles
- [ ] Device patching to DMX addresses
- [ ] Channel layout definitions

### Channel Control
- [ ] Encoder wheel interaction (mouse drag)
- [ ] Direct value input for channels
- [ ] Attribute-based control (Dimmer, Color, Position, Beam, etc.)
- [ ] Multi-fixture selection and group control
- [ ] Programmer state management

### Color Mixing
- [ ] RGB/RGBA color picker
- [ ] HSL color wheel
- [ ] Color temperature control
- [ ] Preset color library

### Cue & Scene Management
- [ ] Create/Edit/Delete cues
- [ ] Store complete lighting states
- [ ] Cue timing (fade in/out, delay)
- [ ] Cue numbering and naming
- [ ] Scene library

### Timeline/Sequence
- [ ] Cue list playback
- [ ] Play/Pause/Stop controls
- [ ] Crossfade between cues
- [ ] Timeline scrubbing
- [ ] Auto-follow cues

### Executor Functions
- [ ] Assign cues to executors
- [ ] Flash functionality
- [ ] Black/Release functions
- [ ] Go button (next cue)
- [ ] Fader-controlled dimming/crossfade

### Map Overview
- [ ] 2D stage plot
- [ ] Drag-and-drop fixture positioning
- [ ] Visual fixture representation
- [ ] Quick selection from map

### WebSocket Integration
- [ ] Real-time bidirectional communication
- [ ] Instant DMX value updates
- [ ] Multi-user synchronization
- [ ] Live feedback from hardware

## Architecture

Built following OOP principles:
- MVC pattern
- RESTful API communication
- Event-driven architecture
- Modular component design

## Technologies

- **Frontend**: Vanilla HTML5, CSS3, JavaScript ES6+
- **Backend**: Node.js + TypeScript + Express
- **DMX**: SerialPort library for FTDI interfaces
- **Design**: Custom CSS (no frameworks for maximum control)

## Contributing

This is the foundation. Future development will add functionality progressively, maintaining the clean architecture and professional UI/UX.
