/**
 * DMX Fader Console - Fixture Configuration System
 * Assignments (R,G,B,W,P,T) are stored in database per fixture
 * Encoders work on ALL channels with P/T assignments (ignores SELECT)
 */

const API = `http://${window.location.hostname}:3000`;
// FIXTURE_ID is now handled dynamically within the class

class FaderConsole {
    constructor(channelCount = 16) {
        this.channelCount = channelCount;
        this.startChannel = 1; // Default to Layer 1 (1-16)
        this.fixtureId = 1; // Current selected fixture
        this.fixtureStartAddress = 1; // Base DMX address of current fixture
        this.fixtureChannelCount = 16; // How many channels this fixture has
        this.availableFixtures = [];
        this.channels = [];
        this.globalValueCache = {}; // Global cache for all 512 channels
        this.backendValues = new Array(512).fill(0);
        this.assignmentCache = {}; // Cache for all 32 assignments per fixture
        this.groupCache = {}; // Cache for channel groups
        this.selectedFixtureIds = [1]; // For multi-fixture actions
        this.fullAssignmentCache = null; // Cache for multi-fixture operations
        this.isInitializing = false; // Flag to prevent accidental DMX pushes
        this.globalPaletteStates = [];
        this.presetStates = [];
        this.macroStates = [];
        this.bc = new BroadcastChannel('dmx_selection_sync');

        // Encoder states
        this.encoders = {
            pan: { value: 127, rotation: 0 },
            tilt: { value: 127, rotation: 0 },
            rgbw: { hue: 0, rotation: 0 }
        };

        this.init();
    }

    async init() {
        console.log('🎚️ Initializing Fader Console (Fixture Configuration)...');

        // Setup Layer Switchers
        const layerBtns = document.querySelectorAll('.layer-btn');
        layerBtns.forEach(btn => {
            btn.onclick = () => {
                const layer = parseInt(btn.dataset.layer);
                this.switchLayer(layer);

                layerBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            };
        });

        // Initial load
        await this.loadFixtures();
        this.initSync();

        // Create faders
        this.createFaders();

        // Initialize encoders
        // Initialize encoders
        this.initEncoders();

        this.initMacros();

        // Load data for the initial fixture
        await this.refreshFixtureData();

        // Start backend monitoring
        this.startBackendMonitor();
        this.startHeartbeat();

        await this.loadMacros();
        await this.loadPresets();
        await this.loadGlobalPalettes();
        await this.loadChasers();
    }

    async refreshFixtureData() {
        console.log(`📡 Refreshing data for Fixture ${this.fixtureId}...`);
        await this.loadFaders(); // This loads names and other channel info
        await this.loadChannelAssignments();
        await this.loadChannelGroups();
        this.renderMacros(); // Force re-render after assignments loaded to apply colors
    }

    async loadFixtures() {
        try {
            const res = await fetch(`${API}/api/devices`);
            this.availableFixtures = await res.json();

            // Validate current fixture ID
            const currentExists = this.availableFixtures.find(f => f.id === this.fixtureId);

            if (!currentExists && this.availableFixtures.length > 0) {
                // Switch to first available fixture
                const first = this.availableFixtures[0];
                this.fixtureId = first.id;
                this.fixtureStartAddress = first.dmx_address;
                this.fixtureChannelCount = first.channel_count;
                this.selectedFixtureIds = [first.id];
                console.log(`Auto-switched to Fixture ${first.id}`);
            } else if (this.availableFixtures.length > 0) {
                // Filter out invalid IDs from selection
                this.selectedFixtureIds = this.selectedFixtureIds.filter(id =>
                    this.availableFixtures.some(f => f.id === id)
                );
                // Ensure at least current is selected if selection became empty
                if (this.selectedFixtureIds.length === 0) {
                    this.selectedFixtureIds = [this.fixtureId];
                }
            }

            console.log('Fixtures loaded:', this.availableFixtures);
        } catch (e) {
            console.error('Failed to load fixtures:', e);
        }
    }

    initSync() {
        this.bc.onmessage = (msg) => {
            if (msg.data.type === 'sync') {
                this.handleRemoteSync(msg.data);
            }
        };

        // Load initial state
        const savedSelected = localStorage.getItem('dmx_selected_fixture_ids');
        if (savedSelected) this.selectedFixtureIds = JSON.parse(savedSelected);
        const savedActive = localStorage.getItem('dmx_active_fixture_id');
        if (savedActive) {
            const fix = this.availableFixtures.find(f => f.id === parseInt(savedActive));
            if (fix) this.selectFixture(fix, false);
        }
    }

    handleRemoteSync(data) {
        console.log('🔄 Remote Sync:', data);
        if (data.selectedFixtureIds) {
            this.selectedFixtureIds = data.selectedFixtureIds;
        }
        if (data.activeFixtureId && data.activeFixtureId !== this.fixtureId) {
            const fix = this.availableFixtures.find(f => f.id === data.activeFixtureId);
            if (fix) this.selectFixture(fix, false);
        }
    }

    syncSelection() {
        this.bc.postMessage({
            type: 'sync',
            selectedFixtureIds: this.selectedFixtureIds,
            activeFixtureId: this.fixtureId,
            source: 'fader_console'
        });
        localStorage.setItem('dmx_active_fixture_id', this.fixtureId);
        localStorage.setItem('dmx_selected_fixture_ids', JSON.stringify(this.selectedFixtureIds));
    }

    // Integrated selector removed. Selection is now managed externally by Group Manager.


    async selectFixture(fixture, shouldSync = true) {
        if (this.fixtureId === fixture.id) return;
        this.isInitializing = true; // Block DMX pushes while switching

        this.fixtureId = fixture.id;
        this.fixtureStartAddress = fixture.dmx_address;
        this.fixtureChannelCount = fixture.channel_count || 16;
        this.startChannel = 1; // Reset to Page 1 (Relative 1-16)

        console.log(`🎯 Active Fixture changed to: ${fixture.name} (ID: ${fixture.id}, DMX Start: ${fixture.dmx_address})`);

        if (shouldSync) {
            this.selectedFixtureIds = [fixture.id];
            this.syncSelection();
        }

        // Re-create faders starting at the fixture's DMX address
        this.createFaders();

        // Immediate sync from backend before allowing pushes
        if (this.updateValues) {
            await this.updateValues(); // This loads this.backendValues
        }

        // Reload all data for the new fixture
        await this.refreshFixtureData();
        await this.loadMacros();
        await this.loadPresets();
        this.renderMacros(); // Refresh sidebar to show global palettes
        this.renderMacros(); // Update macro UI for new fixture status
        this.renderPresetsSidebar(); // Rebuild sidebar for new fixture context

        // Force immediate LED fill update for all channels (after backend values loaded)
        if (this.backendValues) {
            console.log('🔧 Updating LED fills after fixture switch');
            this.channels.forEach(state => {
                const absoluteChannel = this.fixtureStartAddress + state.channel - 1;
                const backendValue = this.backendValues[absoluteChannel - 1] || 0;
                const percentage = (backendValue / 255) * 100;

                // Update LED fill height
                state.ledFill.style.height = `${percentage}%`;

                // Update fader position and value display
                state.fader.value = backendValue;
                state.valueDisplay.textContent = backendValue;
                state.currentValue = backendValue;

                // Update active class
                if (backendValue > 0) {
                    state.element.classList.add('active');
                } else {
                    state.element.classList.remove('active');
                }

                console.log(`  Ch ${state.channel} -> Abs ${absoluteChannel} = ${backendValue} (${percentage.toFixed(1)}%)`);
            });
        }

        this.isInitializing = false; // Allow DMX pushes again
    }

    /**
     * Load channel assignments from database
     */
    async loadChannelAssignments() {
        try {
            const res = await fetch(`${API}/api/faders/assignments/${this.fixtureId}`);
            const data = await res.json();

            if (data.success) {
                // 1. Process assignments (R, G, B, P, T, W)
                if (data.assignments) {
                    this.assignmentCache[this.fixtureId] = data.assignments; // Full 32-ch assignments

                    Object.keys(data.assignments).forEach(channelStr => {
                        const channelNum = parseInt(channelStr);
                        const state = this.channels.find(c => c.channel === channelNum);
                        if (state) {
                            state.element.classList.remove('has-r', 'has-g', 'has-b', 'has-w', 'has-p', 'has-t', 'has-zoom');
                            Object.keys(state.assignments).forEach(k => state.assignments[k] = false);

                            data.assignments[channelNum].forEach(func => {
                                const f = func.toLowerCase();
                                state.assignments[f] = true;
                                if (state.assignBtns[f]) state.assignBtns[f].classList.add('active');
                                state.element.classList.add(`has-${f}`);
                            });
                        }
                    });
                }

                // 2. Process states (ON, SELECT, Value, Color)
                if (data.states) {
                    Object.keys(data.states).forEach(channelStr => {
                        const channelNum = parseInt(channelStr);
                        const state = this.channels.find(c => c.channel === channelNum);
                        if (state) {
                            const s = data.states[channelNum];
                            state.isOn = s.is_on;
                            state.isSelected = s.is_selected;

                            if (state.isOn) state.onBtn.classList.add('active');
                            else state.onBtn.classList.remove('active');

                            if (state.isSelected) state.selectBtn.classList.add('active');
                            else state.selectBtn.classList.remove('active');

                            // Load fader value
                            if (s.fader_value !== undefined) {
                                this.updateFaderValue(state, s.fader_value, false);
                            }

                            // Load custom color
                            if (s.color) {
                                state.customColor = s.color;
                                state.element.style.setProperty('--channel-color', s.color);
                            }
                        }
                    });
                }
            }
        } catch (e) {
            console.error('Failed to load channel assignments:', e);
        }
    }

    /**
     * Save channel assignment to database
     */
    async saveChannelAssignment(channel, functionType, enabled) {
        try {
            const state = this.channels.find(c => c.channel === channel);
            if (state) {
                state.assignments[functionType.toLowerCase()] = enabled; // Update state object
                if (enabled) state.element.classList.add(`has-${functionType.toLowerCase()}`);
                else state.element.classList.remove(`has-${functionType.toLowerCase()}`);
            }

            await fetch(`${API}/api/faders/assignments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fixtureId: this.fixtureId,
                    channel,
                    functionType: functionType.toUpperCase(),
                    enabled
                })
            });
            console.log(`CH${channel}: ${enabled ? 'Assigned' : 'Unassigned'} ${functionType.toUpperCase()}`);
        } catch (e) {
            console.error('Failed to save channel assignment:', e);
        }
    }

    /**
     * Initialize drag-rotatable encoders
     */
    initEncoders() {
        const encoderTypes = ['pan', 'tilt', 'rgbw'];

        encoderTypes.forEach(type => {
            const wheel = document.querySelector(`[data-encoder="${type}"]`);
            if (!wheel) return;

            let isDragging = false;
            let startAngle = 0;
            let currentRotation = 0;

            const getAngle = (e, element) => {
                const rect = element.getBoundingClientRect();
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;

                const clientX = e.touches ? e.touches[0].clientX : e.clientX;
                const clientY = e.touches ? e.touches[0].clientY : e.clientY;

                return Math.atan2(clientY - centerY, clientX - centerX) * (180 / Math.PI);
            };

            const start = (e) => {
                e.preventDefault();
                isDragging = true;
                this.draggingEncoder = type;
                startAngle = getAngle(e, wheel);
                wheel.style.cursor = 'grabbing';
            };

            const move = (e) => {
                if (!isDragging) return;
                e.preventDefault();

                const currentAngle = getAngle(e, wheel);
                let delta = currentAngle - startAngle;

                if (delta > 180) delta -= 360;
                if (delta < -180) delta += 360;

                currentRotation += delta;
                startAngle = currentAngle;

                wheel.style.transform = `rotate(${currentRotation}deg)`;
                this.encoders[type].rotation = currentRotation;

                this.handleEncoderChange(type, delta);
            };

            const end = () => {
                isDragging = false;
                this.draggingEncoder = null;
                wheel.style.cursor = 'grab';
            };

            wheel.addEventListener('mousedown', start);
            document.addEventListener('mousemove', move);
            document.addEventListener('mouseup', end);

            wheel.addEventListener('touchstart', start);
            document.addEventListener('touchmove', move, { passive: false });
            document.addEventListener('touchend', end);

            // Mouse wheel support
            wheel.addEventListener('wheel', (e) => {
                e.preventDefault();
                // Determine direction: up is positive change
                const wheelDelta = -e.deltaY;

                // Visual rotation (more aggressive for coarser feel)
                const rotDelta = (wheelDelta > 0 ? 15 : -15);
                currentRotation += rotDelta;
                wheel.style.transform = `rotate(${currentRotation}deg)`;
                this.encoders[type].rotation = currentRotation;

                // Pass a significantly larger delta for coarser steps (roughly 10 DMX units per notch)
                this.handleEncoderChange(type, wheelDelta > 0 ? 120 : -120);
            }, { passive: false });
        });
    }

    /**
     * Handle encoder value changes
     */
    handleEncoderChange(type, delta) {
        // Even lower sensitivities for ultra-fine precision
        const sensitivity = (type === 'rgbw') ? 0.2 : 0.08;
        const change = Math.round(delta * sensitivity);

        if (type === 'pan' || type === 'tilt') {
            // Apply change to current value
            this.encoders[type].value = Math.max(0, Math.min(255, this.encoders[type].value + change));

            // Calculate degrees (TODO: Move these factors to fixture profiles later)
            // Pan: 0 = 0°, 255 = 540° | Tilt: 0 = 0°, 255 = 270°
            const factor = type === 'pan' ? 540 : 270;
            const degrees = Math.round((this.encoders[type].value / 255) * factor);

            document.getElementById(`${type}-value`).textContent = `${degrees}°`;

            // Apply to ALL channels with P or T assignment
            this.applyEncoderToChannels(type, this.encoders[type].value);

        } else if (type === 'rgbw') {
            this.encoders.rgbw.hue = (this.encoders.rgbw.hue + change) % 360;
            if (this.encoders.rgbw.hue < 0) this.encoders.rgbw.hue += 360;

            const rgb = this.hsvToRgb(this.encoders.rgbw.hue, 1, 1);
            document.getElementById('rgbw-value').textContent = `${this.encoders.rgbw.hue}°`;

            this.applyRainbowToChannels(rgb);
        }
    }

    /**
     * Synchronize global encoders with actual DMX values of the active fixture
     * Prevents "jumping" when dragging encoders if faders were moved manually
     */
    syncEncodersFromActiveFixture() {
        if (!this.backendValues) return;

        const assignments = this.assignmentCache[this.fixtureId] || {};

        // Sync PAN
        if (this.draggingEncoder !== 'pan') {
            const panCh = Object.keys(assignments).find(ch =>
                assignments[ch].some(a => a.toLowerCase() === 'p')
            );
            if (panCh) {
                const absAddr = this.fixtureStartAddress + parseInt(panCh) - 1;
                const val = this.backendValues[absAddr - 1] || 0;
                this.encoders.pan.value = val;
                const degrees = Math.round((val / 255) * 540);
                const el = document.getElementById('pan-value');
                if (el) el.textContent = `${degrees}°`;
            }
        }

        // Sync TILT
        if (this.draggingEncoder !== 'tilt') {
            const tiltCh = Object.keys(assignments).find(ch =>
                assignments[ch].some(a => a.toLowerCase() === 't')
            );
            if (tiltCh) {
                const absAddr = this.fixtureStartAddress + parseInt(tiltCh) - 1;
                const val = this.backendValues[absAddr - 1] || 0;
                this.encoders.tilt.value = val;
                const degrees = Math.round((val / 255) * 270);
                const el = document.getElementById('tilt-value');
                if (el) el.textContent = `${degrees}°`;
            }
        }
    }

    async getFullAssignments() {
        if (this.fullAssignmentCache) return this.fullAssignmentCache;
        try {
            const res = await fetch(`${API}/api/faders/all-assignments`);
            const data = await res.json();
            if (data.success) {
                this.fullAssignmentCache = data.mapping;
                return data.mapping;
            }
        } catch (e) {
            console.error('Failed to load all assignments:', e);
        }
        return {};
    }

    /**
     * Apply encoder to ALL selected fixtures with P or T assignment
     */
    async applyEncoderToChannels(type, value) {
        const assignKey = type === 'pan' ? 'P' : 'T';

        // Load all assignments
        const res = await fetch(`${API}/api/faders/all-assignments`);
        const data = await res.json();
        if (!data.success) return;
        const allAssignments = data.mapping;

        console.log(`🎯 Applying ${type.toUpperCase()} (${value}) to selected fixtures:`, this.selectedFixtureIds);

        const updates = {};

        // Apply to ALL selected fixtures
        for (const fixtureId of this.selectedFixtureIds) {
            const fixture = this.availableFixtures.find(f => f.id == fixtureId);
            if (!fixture) continue;

            const assignments = allAssignments[fixtureId];
            if (!assignments) continue;

            // Update Cache for each fixture
            if (!this.globalValueCache[fixtureId]) this.globalValueCache[fixtureId] = {};

            // For each channel with P or T assignment, prepare update
            Object.keys(assignments).forEach(relCh => {
                const functions = assignments[relCh];
                const relChNum = parseInt(relCh);
                if (functions.includes(assignKey)) {
                    const absAddr = fixture.dmx_address + relChNum - 1;
                    updates[absAddr] = value;
                    this.globalValueCache[fixtureId][relChNum] = { value, isOn: true };
                }
            });
        }

        // Send batched DMX update
        await this.sendSparseDMX(updates);

        // Update UI for current fixture if in selection
        if (this.selectedFixtureIds.some(id => id == this.fixtureId)) {
            this.channels.forEach(state => {
                if (state.assignments[assignKey.toLowerCase()]) {
                    state.fader.value = value;
                    state.currentValue = value;
                    state.valueDisplay.textContent = value;
                    state.ledFill.style.height = `${(value / 255) * 100}%`;
                    if (value > 0) state.element.classList.add('active');
                    else state.element.classList.remove('active');
                }
            });
        }
    }

    /**
     * Apply rainbow to ALL selected fixtures with R,G,B,W assignments
     */
    async applyRainbowToChannels(rgb) {
        const rgbValues = {
            r: Math.round(rgb.r * 255),
            g: Math.round(rgb.g * 255),
            b: Math.round(rgb.b * 255)
        };

        const preview = document.getElementById('rgbw-value');
        if (preview) {
            preview.style.backgroundColor = `rgb(${rgbValues.r}, ${rgbValues.g}, ${rgbValues.b})`;
            preview.style.color = (rgb.r + rgb.g + rgb.b > 1.5) ? '#000' : '#fff';
            preview.textContent = `${this.encoders.rgbw.hue}°`;
        }

        const allAssignments = await this.getFullAssignments();
        const updates = {};

        for (const fixtureId of this.selectedFixtureIds) {
            const fixture = this.availableFixtures.find(f => f.id == fixtureId);
            if (!fixture) continue;

            const assignments = allAssignments[fixtureId];
            if (!assignments) continue;

            if (!this.globalValueCache[fixtureId]) this.globalValueCache[fixtureId] = {};

            Object.keys(assignments).forEach(relCh => {
                const functions = assignments[relCh];
                const relChNum = parseInt(relCh);
                const absAddr = fixture.dmx_address + relChNum - 1;

                functions.forEach(f => {
                    let val = -1;
                    const ft = f.toLowerCase();
                    if (ft === 'r') val = rgbValues.r;
                    else if (ft === 'g') val = rgbValues.g;
                    else if (ft === 'b') val = rgbValues.b;
                    else if (ft === 'w') val = 0; // Saturate
                    else if (ft === 'dim') val = 255;
                    else if (ft === 'strobe') val = 255;

                    if (val !== -1) {
                        updates[absAddr] = val;
                        this.globalValueCache[fixtureId][relChNum] = { value: val, isOn: true };
                    }
                });
            });
        }

        await this.sendSparseDMX(updates);

        if (this.selectedFixtureIds.some(id => id == this.fixtureId)) {
            this.channels.forEach(state => {
                let valToSet = -1;
                if (state.assignments.r) valToSet = rgbValues.r;
                else if (state.assignments.g) valToSet = rgbValues.g;
                else if (state.assignments.b) valToSet = rgbValues.b;
                else if (state.assignments.w) valToSet = 0;
                else if (state.assignments.dim) valToSet = 255;
                else if (state.assignments.strobe) valToSet = 255;

                if (valToSet !== -1) {
                    state.fader.value = valToSet;
                    state.currentValue = valToSet;
                    state.valueDisplay.textContent = valToSet;
                    state.ledFill.style.height = `${(valToSet / 255) * 100}%`;
                    if (valToSet > 0) state.element.classList.add('active');
                    else state.element.classList.remove('active');
                }
            });
        }
    }

    /**
     * HSV to RGB conversion
     */
    hsvToRgb(h, s, v) {
        h = h / 60;
        const c = v * s;
        const x = c * (1 - Math.abs((h % 2) - 1));
        const m = v - c;

        let r, g, b;
        if (h < 1) [r, g, b] = [c, x, 0];
        else if (h < 2) [r, g, b] = [x, c, 0];
        else if (h < 3) [r, g, b] = [0, c, x];
        else if (h < 4) [r, g, b] = [0, x, c];
        else if (h < 5) [r, g, b] = [x, 0, c];
        else[r, g, b] = [c, 0, x];

        return { r: r + m, g: g + m, b: b + m };
    }

    /**
     * Load fader names from database
     */
    async loadFaders() {
        try {
            const res = await fetch(`${API}/api/faders?fixtureId=${this.fixtureId}`);
            const data = await res.json();

            if (data.success && data.faders) {
                Object.keys(data.faders).forEach(channel => {
                    const channelNum = parseInt(channel);
                    const state = this.channels.find(c => c.channel === channelNum);
                    if (state) {
                        state.label.textContent = data.faders[channel];
                    }
                });
            }
        } catch (e) {
            console.error('Failed to load fader names:', e);
        }
    }

    /**
     * Save fader name to database
     */
    async saveFaderName(channel, name) {
        try {
            await fetch(`${API}/api/faders/name`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fixtureId: this.fixtureId, channel, name })
            });
        } catch (e) {
            console.error('Failed to save fader name:', e);
        }
    }

    /**
     * Create fader elements for the current layer
     */
    createFaders() {
        const bank = document.getElementById('fader-bank');
        bank.innerHTML = ''; // Clear existing faders
        this.channels = []; // Clear existing channel states

        for (let i = 0; i < this.channelCount; i++) {
            const channelNum = this.startChannel + i;
            if (channelNum > 512) break; // DMX limit
            if (channelNum > this.fixtureChannelCount) break; // Fixture limit

            const channelState = this.createFaderChannel(channelNum); // Create channel state
            bank.appendChild(channelState.element); // Append its element to the bank
            this.channels.push(channelState); // Add state to our list
        }
    }

    async switchLayer(layer) {
        this.startChannel = (layer - 1) * 16 + 1;
        console.log(`🔄 Switching to Layer ${layer} (starting at CH ${this.startChannel})`);

        this.createFaders();
        await this.refreshFixtureData();
    }

    /**
     * Create a single fader channel
     */
    createFaderChannel(channelNum) {
        const channelEl = document.createElement('div');
        channelEl.className = 'fader-channel';
        channelEl.dataset.channel = channelNum;

        const label = document.createElement('div');
        label.className = 'channel-label';
        label.textContent = `CH ${channelNum}`;

        const controls = document.createElement('div');
        controls.className = 'fader-controls';

        const selectBtn = document.createElement('button');
        selectBtn.className = 'btn-select';
        selectBtn.textContent = 'SELECT';

        // ABC Group Buttons (3x1 grid)
        const groupGrid = document.createElement('div');
        groupGrid.className = 'channel-groups';

        const groups = ['A', 'B', 'C'];
        const groupBtns = {};

        groups.forEach(letter => {
            const btn = document.createElement('button');
            btn.className = `btn-group btn-${letter.toLowerCase()}`;
            btn.textContent = letter;
            groupBtns[letter.toLowerCase()] = btn;
            groupGrid.appendChild(btn);
        });

        // RGBPTW Assignment Buttons (2x3 grid)
        const assignmentGrid = document.createElement('div');
        assignmentGrid.className = 'channel-assignment';

        const assignments = ['R', 'G', 'B', 'P', 'T', 'W'];
        const assignBtns = {};

        assignments.forEach(letter => {
            const btn = document.createElement('button');
            btn.className = `btn-assign btn-${letter.toLowerCase()}`;
            btn.textContent = letter;
            assignBtns[letter.toLowerCase()] = btn;
            assignmentGrid.appendChild(btn);
        });

        const onBtn = document.createElement('button');
        onBtn.className = 'btn-on';
        onBtn.textContent = 'ON';

        controls.appendChild(selectBtn);
        controls.appendChild(groupGrid);
        controls.appendChild(assignmentGrid);
        controls.appendChild(onBtn);

        const faderLedContainer = document.createElement('div');
        faderLedContainer.className = 'fader-led-container';

        const ledStrip = document.createElement('div');
        ledStrip.className = 'led-strip';

        const ledFill = document.createElement('div');
        ledFill.className = 'led-fill';
        ledStrip.appendChild(ledFill);

        const faderContainer = document.createElement('div');
        faderContainer.className = 'fader-container';

        const faderTrack = document.createElement('div');
        faderTrack.className = 'fader-track';

        const fader = document.createElement('input');
        fader.type = 'range';
        fader.className = 'fader';
        fader.min = '0';
        fader.max = '255';
        fader.value = '0';

        faderContainer.appendChild(faderTrack);
        faderContainer.appendChild(fader);

        faderLedContainer.appendChild(ledStrip);
        faderLedContainer.appendChild(faderContainer);

        const valueDisplay = document.createElement('div');
        valueDisplay.className = 'value-display';
        valueDisplay.textContent = '0';

        channelEl.appendChild(label);
        channelEl.appendChild(controls);
        channelEl.appendChild(faderLedContainer);
        channelEl.appendChild(valueDisplay);

        const state = {
            channel: channelNum,
            element: channelEl,
            label: label,
            fader: fader,
            ledFill: ledFill,
            valueDisplay: valueDisplay,
            selectBtn: selectBtn,
            groupBtns: groupBtns,
            assignBtns: assignBtns,
            onBtn: onBtn,
            currentValue: 0,
            isOn: true,
            isSelected: false,
            groups: { a: false, b: false, c: false },
            assignments: { r: false, g: false, b: false, p: false, t: false, w: false, zoom: false },
            hasLoadedOnce: false
        };

        onBtn.classList.add('active');

        label.addEventListener('dblclick', () => {
            this.makeLabelEditable(state);
        });

        this.attachFaderEvents(state);

        return state;
    }

    /**
     * Attach event listeners
     */
    attachFaderEvents(state) {
        state.fader.addEventListener('input', async (e) => {
            // Stop chasers when manually adjusting faders
            this.stopAllChasers();

            const value = parseInt(e.target.value);
            this.updateFaderValue(state, value, true); // Save to DB for active fixture

            // If multiple fixtures are selected, apply to all
            if (this.selectedFixtureIds && this.selectedFixtureIds.length > 1) {
                // Get assignments for this channel
                const channelAssignments = (this.assignmentCache[this.fixtureId] || {})[state.channel] || [];

                if (channelAssignments.length > 0) {
                    // Use cached assignments
                    const allAssignments = await this.getFullAssignments();
                    const updates = {};

                    // Apply to all selected fixtures
                    for (const fixtureId of this.selectedFixtureIds) {
                        // Skip active fixture (already updated by updateFaderValue)
                        if (fixtureId === this.fixtureId || fixtureId === String(this.fixtureId)) continue;

                        const fixture = this.availableFixtures.find(f => f.id == fixtureId);
                        if (!fixture) continue;

                        const assignments = allAssignments[fixtureId];
                        if (!assignments) continue;

                        // Force cache update
                        if (!this.globalValueCache[fixtureId]) this.globalValueCache[fixtureId] = {};

                        // Find channels with the same assignments
                        Object.keys(assignments).forEach(relCh => {
                            const functions = assignments[relCh];
                            const relChNum = parseInt(relCh);

                            // Check if this channel has any of the same functions
                            const hasMatchingFunction = channelAssignments.some(func =>
                                functions.includes(func.toUpperCase())
                            );

                            if (hasMatchingFunction) {
                                const absAddr = fixture.dmx_address + relChNum - 1;
                                updates[absAddr] = value;
                                this.globalValueCache[fixtureId][relChNum] = { value, isOn: true };
                            }
                        });
                    }

                    // Send batched update
                    this.sendSparseDMX(updates);
                }
            }
        });

        // Double click to manually edit value
        state.valueDisplay.addEventListener('dblclick', () => {
            const input = prompt(`DMX Wert für CH ${state.channel} (0-255):`, state.currentValue);
            if (input !== null) {
                let val = parseInt(input);
                if (isNaN(val)) return;
                val = Math.max(0, Math.min(255, val));
                this.updateFaderValue(state, val, true);
            }
        });

        this.bindButton(state.selectBtn, () => {
            state.isSelected = !state.isSelected;
            state.selectBtn.classList.toggle('active');
            this.saveChannelState(state.channel, 'select', state.isSelected);
        });

        // Assignment buttons - save to database
        Object.keys(state.assignBtns).forEach(key => {
            this.bindButton(state.assignBtns[key], () => {
                state.assignments[key] = !state.assignments[key];
                state.assignBtns[key].classList.toggle('active');
                this.saveChannelAssignment(state.channel, key, state.assignments[key]);
            });
        });


        Object.keys(state.groupBtns).forEach(key => {
            this.bindButton(state.groupBtns[key], () => {
                state.groups[key] = !state.groups[key];
                state.groupBtns[key].classList.toggle('active');
                this.saveChannelGroup(state.channel, key, state.groups[key]);
            });
        });
        this.bindButton(state.onBtn, () => {
            this.toggleOnState(state);
        });
    }

    toggleOnState(state, forceState = null, shouldSave = true) {
        state.isOn = (forceState !== null) ? forceState : !state.isOn;

        if (state.isOn) {
            state.onBtn.classList.add('active');
            this.sendToBackend(state.channel, parseInt(state.fader.value));
        } else {
            state.onBtn.classList.remove('active');
            this.sendToBackend(state.channel, 0);
        }

        if (shouldSave) {
            this.saveChannelState(state.channel, 'on', state.isOn);
        }

        // Update cache
        if (!this.globalValueCache[this.fixtureId]) this.globalValueCache[this.fixtureId] = {};

        const currentVal = parseInt(state.fader.value);
        if (this.globalValueCache[this.fixtureId][state.channel]) {
            this.globalValueCache[this.fixtureId][state.channel].isOn = state.isOn;
            this.globalValueCache[this.fixtureId][state.channel].value = currentVal;
        } else {
            this.globalValueCache[this.fixtureId][state.channel] = {
                value: currentVal,
                isOn: state.isOn
            };
        }
    }

    toggleFullLayer(forceOn) {
        console.log(`💡 Toggling Layer: ${forceOn ? 'ALL ON' : 'ALL OFF'}`);
        this.channels.forEach(state => {
            this.toggleOnState(state, forceOn, true);
        });
    }

    /**
     * Central fader value updater
     */
    updateFaderValue(state, value, shouldSaveValue = false) {
        state.fader.value = value;
        state.currentValue = value;
        state.valueDisplay.textContent = value;

        const percentage = (value / 255) * 100;
        state.ledFill.style.height = `${percentage}%`;

        if (state.isOn) {
            this.sendToBackend(state.channel, value);
        }

        // Cache the value globally so it persists across layer switches
        if (!this.globalValueCache[this.fixtureId]) this.globalValueCache[this.fixtureId] = {};
        this.globalValueCache[this.fixtureId][state.channel] = {
            value: value,
            isOn: state.isOn
        };

        if (shouldSaveValue) {
            // Debounce or just send - for now send
            this.saveFaderValue(state.channel, value);
        }
    }

    /**
     * Robust button helper for Touch + Mouse
     */
    bindButton(el, callback) {
        let lastTrigger = 0;
        const handler = (e) => {
            const now = Date.now();
            if (now - lastTrigger < 300) return; // Debounce double fire
            lastTrigger = now;

            // Visual feedback
            el.style.transform = 'scale(0.92)';
            setTimeout(() => el.style.transform = '', 100);

            callback();
            e.preventDefault();
        };

        el.addEventListener('touchstart', handler, { passive: false });
        el.addEventListener('mousedown', (e) => {
            if (e.button === 0) handler(e);
        });
    }

    /**
     * Initialize Macro Section
     */
    initMacros() {
        // 28 Unified Effect Slots (2x14)
        this.chaserStates = [];
        for (let i = 1; i <= 28; i++) {
            this.chaserStates.push({
                id: i,
                type: 'chaser',
                name: `Slot ${i}`,
                start_color: '#333333',
                end_color: '#333333',
                fade_time: 3000,
                color_fade_enabled: false, // Default to static
                zoom_enabled: false,
                zoom_time: 2000,
                zoom_max: 200,
                zoom_invert: false,
                zoom_sawtooth: false,
                strobe_enabled: false,
                strobe_value: 128,
                running: false
            });
        }

        this.presetStates = [];
        this.macrosCollapsed = false;
        this.presetsCollapsed = false;
        this.liveMode = false; // Start in PROG mode

        this.renderMacros();
        this.renderModeToggle();
    }

    renderModeToggle() {
        // Remove existing toggle if any
        const existing = document.querySelector('.mode-toggle-container');
        if (existing) existing.remove();

        const container = document.createElement('div');
        container.className = 'mode-toggle-container';

        const progBtn = document.createElement('button');
        progBtn.className = 'mode-btn active prog-mode';
        progBtn.textContent = 'PROG';
        progBtn.onclick = () => this.setMode('prog');

        const liveBtn = document.createElement('button');
        liveBtn.className = 'mode-btn';
        liveBtn.textContent = 'LIVE';
        liveBtn.onclick = () => this.setMode('live');

        container.appendChild(progBtn);
        container.appendChild(liveBtn);

        // Insert at top of fader-bank-container
        const faderBank = document.querySelector('.fader-bank-container');
        if (faderBank) {
            faderBank.style.position = 'relative'; // For absolute positioning
            faderBank.insertBefore(container, faderBank.firstChild);
        }
    }

    setMode(mode) {
        this.liveMode = (mode === 'live');

        // Update button states
        const progBtn = document.querySelector('.mode-btn.prog-mode');
        const liveBtn = document.querySelector('.mode-btn.live-mode');

        if (progBtn && liveBtn) {
            if (this.liveMode) {
                progBtn.classList.remove('active');
                liveBtn.classList.add('active', 'live-mode');
                console.log('🎭 LIVE MODE (No function yet)');
            } else {
                liveBtn.classList.remove('active', 'live-mode');
                progBtn.classList.add('active', 'prog-mode');
                console.log('💾 PROG MODE (No function yet)');
            }
        }
    }

    renderMacros() {
        const faderBankContainer = document.querySelector('.fader-bank-container');

        if (!faderBankContainer) {
            console.error('Fader bank container not found');
            return;
        }

        // Remove existing container if any to allow re-rendering
        const existing = document.querySelector('.macros-container');
        if (existing) existing.remove();

        const macrosContainer = document.createElement('div');
        macrosContainer.className = 'macros-container';


        // --- EFFECT SLOTS (28) ---
        if (this.chaserStates) {
            this.chaserStates.forEach(state => {
                const item = document.createElement('div');
                item.className = 'macro-item';

                const box = document.createElement('div');
                box.className = 'macro-box chaser-box';

                // Add relative positioning to box to contain absolute layers
                box.style.position = 'relative';

                // Background Layer for visual feedback (Color + Zoom Mask)
                const bgLayer = document.createElement('div');
                bgLayer.className = 'macro-bg-layer';
                bgLayer.style.position = 'absolute';
                bgLayer.style.inset = '0';
                bgLayer.style.zIndex = '0';
                bgLayer.style.pointerEvents = 'none'; // Allow clicks to pass through to box
                bgLayer.style.transition = 'background 0.2s';
                box.appendChild(bgLayer);

                // Box Display Logic: Gradient if Color Fade is ON, else Solid Color
                // + Zoom Spot Masking
                const updateBoxDisplay = () => {
                    // 1. Zoom Masking (Spot vs Wide)
                    // DMX 0 -> Wide (100%), DMX 255 -> Spot (30%)
                    let maskScale = 100;
                    if (state.zoom_enabled) {
                        const max = state.zoom_max !== undefined ? state.zoom_max : 255;
                        // Map 0 -> 100, 255 -> 30
                        maskScale = 100 - ((max / 255) * 70);
                    }

                    // Apply Mask to BG Layer
                    const maskFn = `radial-gradient(circle, black ${maskScale}%, transparent ${maskScale}%)`;
                    bgLayer.style.webkitMaskImage = maskFn;
                    bgLayer.style.maskImage = maskFn;

                    // 2. Color (Background)
                    if (state.color_fade_enabled !== false) {
                        bgLayer.style.background = `linear-gradient(90deg, ${state.start_color} 0%, ${state.start_color} 50%, ${state.end_color} 50%, ${state.end_color} 100%)`;
                    } else {
                        bgLayer.style.background = state.start_color;
                    }
                };
                updateBoxDisplay();

                // Running state logic: Only show running if CURRENTLY SELECTED fixture is in the target list
                // OR if NO fixture is selected, show if running anywhere (optional, but per-fixture is safer)

                // Ensure active set of IDs to check against
                const currentSelectionChecks = (this.selectedFixtureIds && this.selectedFixtureIds.length > 0)
                    ? this.selectedFixtureIds
                    : [this.fixtureId];

                const isRunningHere = state.running && state.targetFixtureIds && state.targetFixtureIds.some(fid =>
                    currentSelectionChecks.some(sel => String(sel) === String(fid))
                );

                if (isRunningHere) {
                    box.classList.add('running');
                } else {
                    box.classList.remove('running');
                }

                // Hidden color pickers
                const startPicker = document.createElement('input');
                startPicker.type = 'color';
                startPicker.value = state.start_color;
                startPicker.style.display = 'none';

                const endPicker = document.createElement('input');
                endPicker.type = 'color';
                endPicker.value = state.end_color;
                endPicker.style.display = 'none';

                // Right-click to edit colors (detect left/right half)
                box.addEventListener('contextmenu', (e) => {
                    e.preventDefault(); // Block default context menu
                    e.stopPropagation();

                    const rect = box.getBoundingClientRect();
                    const clickX = e.clientX - rect.left;

                    if (clickX < rect.width / 2 || state.color_fade_enabled === false) {
                        startPicker.click();
                    } else {
                        endPicker.click();
                    }
                });

                // Start color picker change
                startPicker.onchange = () => {
                    state.start_color = startPicker.value;
                    updateBoxDisplay();
                    this.saveChaser(state.id, state.start_color, state.end_color, state.fade_time, state.mode, state.zoom_enabled, state.zoom_time, state.zoom_max, state.zoom_invert, state.zoom_sawtooth, state.color_fade_enabled, state.strobe_enabled, state.strobe_value);
                };

                // End color picker change
                endPicker.onchange = () => {
                    state.end_color = endPicker.value;
                    updateBoxDisplay();
                    this.saveChaser(state.id, state.start_color, state.end_color, state.fade_time, state.mode, state.zoom_enabled, state.zoom_time, state.zoom_max, state.zoom_invert, state.zoom_sawtooth, state.color_fade_enabled, state.strobe_enabled, state.strobe_value);
                };

                // Single-click to select chaser
                this.bindButton(box, () => {
                    this.selectChaser(state);
                });

                item.appendChild(box);
                item.appendChild(startPicker);
                item.appendChild(endPicker);
                macrosContainer.appendChild(item);

                state.box = box;
                state.updateBoxDisplay = updateBoxDisplay;
            });
        }

        // Insert BEFORE fixture-selector-bar (so macros are between faders and fixtures)
        const fixtureSelector = document.querySelector('.fixture-selector-bar');
        if (fixtureSelector) {
            faderBankContainer.insertBefore(macrosContainer, fixtureSelector);
        } else {
            // Fallback if selector not found yet
            faderBankContainer.appendChild(macrosContainer);
        }

        // --- PRESETS SIDEBAR (Right Side) ---
        // Decoupled: Do not render sidebar here inside renderMacros, as it causes recreation of active controls
    }

    renderPresetsSidebar() {
        const layout = document.querySelector('.main-layout');
        const encodersCol = document.querySelector('.encoders-column');

        if (!layout || !encodersCol) return;

        // Remove existing sidebar if any
        const existing = document.querySelector('.presets-sidebar');
        if (existing) existing.remove();

        const sidebar = document.createElement('div');
        sidebar.className = 'presets-sidebar';

        // --- LAYER HEADER ---
        const layerHeader = document.createElement('div');
        layerHeader.className = 'sidebar-layers';

        const layers = [
            { id: 1, label: '1-16', start: 1 },
            { id: 2, label: '17-32', start: 17 }
        ].filter(l => l.start <= this.fixtureChannelCount);

        layers.forEach(l => {
            const btn = document.createElement('button');
            btn.className = 'btn-select layer-btn-sidebar';

            const currentLayer = Math.floor((this.startChannel - 1) / 16) + 1;
            if (currentLayer === l.id) btn.classList.add('active');

            btn.textContent = `CH ${l.label}`;

            btn.onclick = (e) => {
                this.switchLayer(l.id);
                this.renderPresetsSidebar();
                e.stopPropagation();
            };
            layerHeader.appendChild(btn);
        });

        // FULL ON/OFF Toggle Badge (right side of layer buttons)
        const fullToggle = document.createElement('div');
        fullToggle.className = 'full-toggle-badge';

        const visibleOnCount = this.channels.filter(c => c.isOn).length;
        const allOn = visibleOnCount > this.channels.length / 2;

        fullToggle.textContent = allOn ? 'FULL OFF' : 'FULL ON';
        if (allOn) fullToggle.classList.add('all-on');

        fullToggle.onclick = () => {
            this.toggleFullLayer(!allOn);
            this.renderPresetsSidebar();
        };

        layerHeader.appendChild(fullToggle);
        sidebar.appendChild(layerHeader);

        // MASTER CONTROLS CONTAINER (Stacked Layout)
        const masterContainer = document.createElement('div');
        masterContainer.style.cssText = `
            grid-column: 1 / -1;
            display: flex;
            align-items: flex-start;
            justify-content: center;
            padding: 12px 10px;
            border-bottom: 1px solid #333;
            margin-bottom: 15px;
            background: rgba(255,255,255,0.02);
            border-radius: 12px;
            gap: 15px;
        `;

        const btnColumn = document.createElement('div');
        btnColumn.style.cssText = `display: flex; flex-direction: column; gap: 4px; width: 65px;`;

        const encoderColumn = document.createElement('div');
        encoderColumn.style.cssText = `display: flex; flex-direction: column; gap: 12px; align-items: center;`;

        // helper to save
        const saveCurrentChaser = () => {
            if (this.selectedChaser) {
                this.saveChaser(
                    this.selectedChaser.id,
                    this.selectedChaser.start_color,
                    this.selectedChaser.end_color,
                    this.selectedChaser.fade_time,
                    this.selectedChaser.mode,
                    this.selectedChaser.zoom_enabled,
                    this.selectedChaser.zoom_time,
                    this.selectedChaser.zoom_max,
                    this.selectedChaser.zoom_invert,
                    this.selectedChaser.zoom_sawtooth,
                    this.selectedChaser.color_fade_enabled,
                    this.selectedChaser.strobe_enabled,
                    this.selectedChaser.strobe_value,
                    this.selectedChaser.dimmer_enabled,
                    this.selectedChaser.dimmer_value,
                    this.selectedChaser.w_enabled
                );
            }
        };

        // --- BUTTONS ---
        const fadeBtn = document.createElement('button');
        fadeBtn.textContent = 'FADE';
        fadeBtn.style.cssText = `font-size: 8px; font-weight: 700; color: #00d4ff; background: #111; border: 1px solid #333; border-radius: 3px; padding: 2px 4px; cursor: pointer; text-transform: uppercase; transition: all 0.2s;`;

        const zoomBtn = document.createElement('button');
        zoomBtn.textContent = 'ZOOM';
        zoomBtn.style.cssText = `font-size: 8px; font-weight: 700; color: #ff9900; background: #111; border: 1px solid #333; border-radius: 3px; padding: 2px 4px; cursor: pointer; text-transform: uppercase; transition: all 0.2s;`;

        const invBtn = document.createElement('button');
        invBtn.textContent = 'INV';
        invBtn.style.cssText = `font-size: 8px; font-weight: 700; color: #00d4ff; background: #111; border: 1px solid #333; border-radius: 3px; padding: 2px 4px; cursor: pointer; text-transform: uppercase; transition: all 0.2s;`;

        const sawBtn = document.createElement('button');
        sawBtn.textContent = 'SAW';
        sawBtn.style.cssText = `font-size: 8px; font-weight: 700; color: #ff00ff; background: #111; border: 1px solid #333; border-radius: 3px; padding: 2px 4px; cursor: pointer; text-transform: uppercase; transition: all 0.2s;`;

        const strobeBtn = document.createElement('button');
        strobeBtn.textContent = 'STROBE';
        strobeBtn.style.cssText = `font-size: 8px; font-weight: 700; color: #ff0055; background: #111; border: 1px solid #333; border-radius: 3px; padding: 2px 4px; cursor: pointer; text-transform: uppercase; transition: all 0.2s; margin-top: 4px;`;

        const dimBtn = document.createElement('button');
        dimBtn.textContent = 'DIM';
        dimBtn.style.cssText = `font-size: 8px; font-weight: 700; color: #ffffff; background: #111; border: 1px solid #333; border-radius: 3px; padding: 2px 4px; cursor: pointer; text-transform: uppercase; transition: all 0.2s; margin-top: 4px;`;

        // Ensure default is true if undefined
        if (this.selectedChaser && this.selectedChaser.color_fade_enabled === undefined) this.selectedChaser.color_fade_enabled = true;



        const wBtn = document.createElement('button');
        wBtn.textContent = '+W';
        wBtn.style.cssText = `font-size: 8px; font-weight: 700; color: #eebb99; background: #111; border: 1px solid #333; border-radius: 3px; padding: 2px 4px; cursor: pointer; text-transform: uppercase; transition: all 0.2s; margin-top: 4px;`;

        const saveCueBtn = document.createElement('button');
        saveCueBtn.textContent = 'SAVE CUE';
        saveCueBtn.style.cssText = `font-size: 8px; font-weight: 700; color: #aaa; background: #1a1a1a; border: 1px solid #444; border-radius: 3px; padding: 4px 4px; cursor: pointer; text-transform: uppercase; transition: all 0.2s; margin-top: 10px; width: 100%;`;
        saveCueBtn.onmouseover = () => { saveCueBtn.style.background = '#00ff88'; saveCueBtn.style.color = '#000'; };
        saveCueBtn.onmouseout = () => { saveCueBtn.style.background = '#1a1a1a'; saveCueBtn.style.color = '#aaa'; };

        // --- SAMMEL DISPLAY ---
        const sammelDisplay = document.createElement('div');
        sammelDisplay.style.cssText = `
            background: #000;
            border: 1px solid #333;
            border-radius: 6px;
            padding: 8px 6px;
            margin-top: 10px;
            font-family: 'JetBrains Mono', 'Consolas', monospace;
            font-size: 10px;
            color: #eee;
            line-height: 1.6;
            display: flex;
            flex-direction: column;
            gap: 3px;
            box-shadow: inset 0 2px 8px rgba(0,0,0,0.8);
            border: 1px solid rgba(255,255,255,0.05);
        `;
        const valFade = document.createElement('div');
        const valZoom = document.createElement('div');
        const valStrobe = document.createElement('div');
        const valDim = document.createElement('div');
        sammelDisplay.appendChild(valFade);
        sammelDisplay.appendChild(valZoom);
        sammelDisplay.appendChild(valStrobe);
        sammelDisplay.appendChild(valDim);

        // --- ENCODERS ---
        const createEncoder = (color) => {
            const wheel = document.createElement('div');
            wheel.className = 'encoder-wheel-small';
            wheel.style.cssText = `width: 38px; height: 38px; border-radius: 50%; background: linear-gradient(135deg, #2a2a2a, #111); border: 2px solid #555; position: relative; cursor: grab; box-shadow: inset 0 2px 4px rgba(0,0,0,0.8); touch-action: none;`;
            const indicator = document.createElement('div');
            indicator.style.cssText = `position: absolute; top:4px; left:50%; transform:translateX(-50%); transform-origin: center 15px; width:2px; height:10px; background:${color}; box-shadow:0 0 6px ${color}; pointer-events:none;`;
            wheel.appendChild(indicator);
            return { wheel, indicator };
        };

        const eFade = createEncoder('#00d4ff');
        const eZoom = createEncoder('#ff9900');
        const eStrobe = createEncoder('#ff0055');
        const eDim = createEncoder('#ffffff');

        // --- ENCODER LOGIC ---
        const bindEnc = (enc, prop, sensitivity, min, max) => {
            let dragging = false, lastY = 0, rotation = 0;
            const onDown = (e) => {
                dragging = true; lastY = e.clientY || e.touches?.[0]?.clientY || 0;
                enc.wheel.style.cursor = 'grabbing';
                enc.wheel.style.borderColor = '#00d4ff';
                e.preventDefault();
            };
            const onMove = (e) => {
                if (!dragging || !this.selectedChaser) return;
                const cy = e.clientY || e.touches?.[0]?.clientY || 0;
                const dy = lastY - cy; lastY = cy; rotation += dy * 2;
                enc.indicator.style.transform = `translateX(-50%) rotate(${rotation}deg)`;
                if (prop === 'fade_time') {
                    const c = (this.selectedChaser.fade_time || 3000) / 1000;
                    this.selectedChaser.fade_time = Math.max(min, Math.min(max, c + (dy * sensitivity * 0.1))) * 1000; // Slower coarse adjustment
                } else {
                    const c = this.selectedChaser[prop] || 0;
                    this.selectedChaser[prop] = Math.max(min, Math.min(max, Math.round(c + dy * sensitivity)));
                }
                updateEffectUI(this.selectedChaser);
                e.preventDefault();
            };
            const onUp = () => { if (!dragging) return; dragging = false; enc.wheel.style.cursor = 'grab'; enc.wheel.style.borderColor = '#555'; saveCurrentChaser(); };
            enc.wheel.onmousedown = onDown; enc.wheel.ontouchstart = onDown;
            window.addEventListener('mousemove', onMove); window.addEventListener('touchmove', onMove, { passive: false });
            window.addEventListener('mouseup', onUp); window.addEventListener('touchend', onUp);

            // Mouse wheel support for effect encoders
            enc.wheel.addEventListener('wheel', (e) => {
                if (!this.selectedChaser) return;
                e.preventDefault();
                const dy = -e.deltaY;
                rotation += (dy > 0 ? 30 : -30);
                enc.indicator.style.transform = `translateX(-50%) rotate(${rotation}deg)`;

                if (prop === 'fade_time') {
                    const c = (this.selectedChaser.fade_time || 3000) / 1000;
                    this.selectedChaser.fade_time = Math.max(min, Math.min(max, c + (dy > 0 ? 0.2 : -0.2))) * 1000;
                } else {
                    const c = this.selectedChaser[prop] || 0;
                    this.selectedChaser[prop] = Math.max(min, Math.min(max, Math.round(c + (dy > 0 ? 10 : -10))));
                }
                updateEffectUI(this.selectedChaser);
                saveCurrentChaser();
            }, { passive: false });
        };

        bindEnc(eFade, 'fade_time', 0.1, 0.1, 10, true);
        bindEnc(eZoom, 'zoom_max', 2, 0, 255);
        bindEnc(eStrobe, 'strobe_value', 2, 0, 255);
        bindEnc(eDim, 'dimmer_value', 2, 0, 255);

        // --- UI UPDATE ---
        const updateEffectUI = (state) => {
            if (!state) return;
            const cfActive = state.color_fade_enabled !== false;
            fadeBtn.style.background = cfActive ? '#00d4ff' : '#111';
            fadeBtn.style.color = cfActive ? '#000' : '#00d4ff';
            fadeBtn.style.borderColor = cfActive ? '#00d4ff' : '#333';

            zoomBtn.style.background = state.zoom_enabled ? '#ff9900' : '#111';
            zoomBtn.style.color = state.zoom_enabled ? '#000' : '#ff9900';
            zoomBtn.style.borderColor = state.zoom_enabled ? '#ff9900' : '#333';

            invBtn.style.background = state.zoom_invert ? '#00d4ff' : '#111';
            invBtn.style.color = state.zoom_invert ? '#000' : '#00d4ff';
            invBtn.style.borderColor = state.zoom_invert ? '#00d4ff' : '#333';

            sawBtn.style.background = state.zoom_sawtooth ? '#ff00ff' : '#111';
            sawBtn.style.color = state.zoom_sawtooth ? '#000' : '#ff00ff';
            sawBtn.style.borderColor = state.zoom_sawtooth ? '#ff00ff' : '#333';

            strobeBtn.style.background = state.strobe_enabled ? '#ff0055' : '#111';
            strobeBtn.style.color = state.strobe_enabled ? '#000' : '#ff0055';
            strobeBtn.style.borderColor = state.strobe_enabled ? '#ff0055' : '#333';

            valFade.innerHTML = `<span style="color:#00d4ff">F:</span> ${(state.fade_time / 1000).toFixed(1)}s`;
            valZoom.innerHTML = `<span style="color:#ff9900">Z:</span> ${state.zoom_max || 0}`;
            valStrobe.innerHTML = `<span style="color:#ff0055">S:</span> ${state.strobe_value || 0}`;
            valDim.innerHTML = `<span style="color:#ffffff">D:</span> ${state.dimmer_value || 0}`;

            dimBtn.style.background = state.dimmer_enabled ? '#ffffff' : '#111';
            dimBtn.style.color = state.dimmer_enabled ? '#000' : '#ffffff';
            dimBtn.style.borderColor = state.dimmer_enabled ? '#ffffff' : '#333';

            wBtn.style.background = state.w_enabled ? '#eebb99' : '#111';
            wBtn.style.color = state.w_enabled ? '#000' : '#eebb99';
            wBtn.style.borderColor = state.w_enabled ? '#eebb99' : '#333';

            // Also refresh the macro grid to show running status correctly immediately
            this.renderMacros();
        };

        // --- EVENT HANDLERS ---
        fadeBtn.onclick = () => { if (this.selectedChaser) { this.selectedChaser.color_fade_enabled = !this.selectedChaser.color_fade_enabled; updateEffectUI(this.selectedChaser); saveCurrentChaser(); } };
        zoomBtn.onclick = () => { if (this.selectedChaser) { this.selectedChaser.zoom_enabled = !this.selectedChaser.zoom_enabled; updateEffectUI(this.selectedChaser); saveCurrentChaser(); } };
        invBtn.onclick = () => { if (this.selectedChaser) { this.selectedChaser.zoom_invert = !this.selectedChaser.zoom_invert; updateEffectUI(this.selectedChaser); saveCurrentChaser(); } };
        sawBtn.onclick = () => { if (this.selectedChaser) { this.selectedChaser.zoom_sawtooth = !this.selectedChaser.zoom_sawtooth; updateEffectUI(this.selectedChaser); saveCurrentChaser(); } };
        strobeBtn.onclick = () => {
            if (this.selectedChaser) {
                this.selectedChaser.strobe_enabled = !this.selectedChaser.strobe_enabled;
                updateEffectUI(this.selectedChaser);
                saveCurrentChaser();
                // If turning OFF, force reset to 0
                if (!this.selectedChaser.strobe_enabled) {
                    this.resetSpecialChannels(this.selectedChaser, 'strobe');
                }
            }
        };
        dimBtn.onclick = () => { if (this.selectedChaser) { this.selectedChaser.dimmer_enabled = !this.selectedChaser.dimmer_enabled; updateEffectUI(this.selectedChaser); saveCurrentChaser(); } };
        wBtn.onclick = () => {
            if (this.selectedChaser) {
                this.selectedChaser.w_enabled = !this.selectedChaser.w_enabled;
                updateEffectUI(this.selectedChaser);
                saveCurrentChaser();
                // If turning OFF, force reset to 0
                if (!this.selectedChaser.w_enabled) {
                    this.resetSpecialChannels(this.selectedChaser, 'w');
                }
            }
        };
        saveCueBtn.onclick = () => { if (this.selectedChaser) this.saveChaserAsScene(this.selectedChaser); };

        // --- ASSEMBLY ---
        btnColumn.appendChild(fadeBtn);
        btnColumn.appendChild(zoomBtn);
        btnColumn.appendChild(invBtn);
        btnColumn.appendChild(sawBtn);
        btnColumn.appendChild(strobeBtn);
        btnColumn.appendChild(dimBtn);
        btnColumn.appendChild(wBtn);
        btnColumn.appendChild(sammelDisplay);
        btnColumn.appendChild(saveCueBtn);

        encoderColumn.appendChild(eFade.wheel);
        encoderColumn.appendChild(eZoom.wheel);
        encoderColumn.appendChild(eStrobe.wheel);
        encoderColumn.appendChild(eDim.wheel);

        masterContainer.appendChild(btnColumn);
        masterContainer.appendChild(encoderColumn);
        sidebar.appendChild(masterContainer);

        this.updateEffectUI = updateEffectUI;
        this.updateFadeUI = updateEffectUI; // link them for now since it's merged



        // --- PRESET MACROS ---
        this.presetStates.forEach(p => this.createPresetElement(p, sidebar));

        // --- GLOBAL PALETTES ---
        if (this.globalPaletteStates.length > 0) {
            const separator = document.createElement('div');
            separator.className = 'macro-separator';
            separator.innerHTML = '<span style="font-size: 8px; opacity: 0.3;">GLOBAL PALETTES</span>';
            separator.style.gridColumn = '1 / -1';
            separator.style.textAlign = 'center';
            separator.style.padding = '5px 0';
            sidebar.appendChild(separator);

            this.globalPaletteStates.forEach(p => this.createPaletteElement(p, sidebar));
        }

        // --- ADD BUTTONS ---
        const addItem = document.createElement('div');
        addItem.className = 'macro-item';
        addItem.style.display = 'flex';
        addItem.style.flexDirection = 'column';
        addItem.style.gap = '5px';

        const addLocalBtn = document.createElement('div');
        addLocalBtn.className = 'macro-box add-macro-btn';
        addLocalBtn.innerHTML = '<span style="font-size: 14px;">+ PRESET</span>';
        addLocalBtn.style.background = '#222';
        addLocalBtn.style.borderStyle = 'dashed';
        addLocalBtn.style.height = '35px';
        this.bindButton(addLocalBtn, () => this.createNewPreset());

        const addGlobalBtn = document.createElement('div');
        addGlobalBtn.className = 'macro-box add-macro-btn';
        addGlobalBtn.innerHTML = '<span style="font-size: 14px;">+ GLOBAL</span>';
        addGlobalBtn.style.background = '#222';
        addGlobalBtn.style.borderStyle = 'dashed';
        addGlobalBtn.style.height = '35px';
        this.bindButton(addGlobalBtn, () => this.createNewGlobalPalette());

        addItem.appendChild(addLocalBtn);
        addItem.appendChild(addGlobalBtn);
        sidebar.appendChild(addItem);

        // Insert between faders and encoders
        layout.insertBefore(sidebar, encodersCol);

        // Sidebar Toggle Button (Move to body to prevent clipping)
        if (!document.querySelector('.preset-toggle-btn')) {
            const toggle = document.createElement('div');
            toggle.className = 'preset-toggle-btn';
            toggle.innerHTML = '‹';
            document.body.appendChild(toggle);
            this.bindButton(toggle, () => this.togglePresetsSidebar());
        }
    }

    togglePresetsSidebar() {
        const sidebar = document.querySelector('.presets-sidebar');
        const btn = document.querySelector('.preset-toggle-btn');
        if (!sidebar || !btn) return;

        this.presetsCollapsed = !this.presetsCollapsed;
        sidebar.classList.toggle('collapsed', this.presetsCollapsed);
        btn.classList.toggle('collapsed', this.presetsCollapsed);
        btn.innerHTML = this.presetsCollapsed ? '›' : '‹';
    }

    // ===== CHASER FUNCTIONS =====

    selectChaser(state) {
        console.log(`🎯 Selected Chaser ${state.id}: ${state.name}`);

        // Only cleanup current selection if we are starting fresh
        const targets = [...this.selectedFixtureIds];
        targets.forEach(fid => this.resetFixtureEffects(fid));

        // Initialize Zoom parameters if missing
        if (state.zoom_max === undefined) state.zoom_max = 255;
        if (state.zoom_invert === undefined) state.zoom_invert = false;
        if (state.zoom_sawtooth === undefined) state.zoom_sawtooth = false;
        if (state.color_fade_enabled === undefined) state.color_fade_enabled = true;
        if (state.strobe_enabled === undefined) state.strobe_enabled = false;
        if (state.strobe_value === undefined) state.strobe_value = 128;
        if (state.dimmer_enabled === undefined) state.dimmer_enabled = true;
        if (state.dimmer_value === undefined) state.dimmer_value = 255;
        if (state.w_enabled === undefined) state.w_enabled = false;
        if (!state.zoom_time) state.zoom_time = Math.round(state.fade_time / 2);

        this.selectedChaser = state;
        this.selectedChaserFadeTime = state.fade_time / 1000; // ms to seconds

        // Update fade time input if it exists
        if (this.fadeTimeInput) {
            this.fadeTimeInput.value = this.selectedChaserFadeTime.toFixed(1);
        }

        // Update zoom controls
        if (this.updateEffectUI) {
            this.updateEffectUI(state);
        }

        // Visual feedback: highlight selected chaser


        // Multi-chaser support: we no longer stop others here
        // Each chaser slot can run independently on its captured targetFixtureIds

        // Also toggle the chaser animation
        this.toggleChaser(state);
    }

    toggleChaser(state) {
        // Check if ANY of the currently selected fixtures are in this chaser's target list
        // If yes -> Stop specific fixtures (remove them from this chaser)
        // If no -> Start specific fixtures (add/transfer them to this chaser)

        const targets = this.selectedFixtureIds.length > 0 ? this.selectedFixtureIds : [this.fixtureId];
        const isRunningOnSelection = state.running && state.targetFixtureIds.some(fid =>
            targets.some(sel => String(sel) === String(fid))
        );

        if (isRunningOnSelection) {
            // Stop ONLY for selected fixtures
            this.stopChaser(state, false, targets);
        } else {
            // Start for selected fixtures (this effectively adds them to the chaser)
            this.startChaser(state);
        }
    }

    startChaser(state) {
        console.log(`▶ Starting Chaser ${state.id}:`, state.name);

        // 1. Capture current selection (ensure it's an array of strings/numbers)
        let targets = [...this.selectedFixtureIds];
        if (targets.length === 0) targets = [this.fixtureId]; // Fallback to active fixture

        // 2. EXCLUSIVITY: Remove THESE fixtures from ALL other running chasers
        // We iterate BACKWARDS or use a separate loop to avoid skipping due to array mutation issues if any
        this.chaserStates.forEach(ch => {
            if (ch.running && ch.id !== state.id && ch.targetFixtureIds) {
                const originalCount = ch.targetFixtureIds.length;
                ch.targetFixtureIds = ch.targetFixtureIds.filter(fid =>
                    !targets.some(t => String(t) === String(fid))
                );

                if (ch.targetFixtureIds.length !== originalCount) {
                    console.log(`✂️ Removed fixtures from Chaser ${ch.id} (overlap with new chaser)`);
                }

                // If a chaser has no more fixtures, stop it
                if (ch.targetFixtureIds.length === 0) {
                    this.stopChaser(ch);
                }
            }
        });

        // 3. Set targets for THIS new chaser
        // Merge with existing targets instead of overwriting, to allow multi-fixture build-up if desired
        // But first, ensure we don't have duplicates (though the exclusivity check above should have handled it if we are stealing)
        // Actually, for "independent instances", sharing the same stored state means they share parameters.
        // If we want to add to the group:
        state.targetFixtureIds = [...(state.targetFixtureIds || []), ...targets];
        // Deduplicate just in case
        state.targetFixtureIds = [...new Set(state.targetFixtureIds.map(String))].map(id => isNaN(id) ? id : parseInt(id));

        state.running = true;
        // Don't auto-add class here, renderMacros/updateBoxDisplay handles it based on selection context
        // if (state.box) state.box.classList.add('running'); 
        this.updateEffectUI(state); // Update render

        // 4. Start animation loop IF NOT ALREADY RUNNING
        // If it's already running, the loop will just pick up the updated targetFixtureIds automatically.
        if (!state.animationFrame) {
            this.runChaserAnimation(state);
        }
    }

    /**
     * Remove running chasers from specific fixtures
     */
    stopChasersOnFixtures(fixtureIds) {
        if (!fixtureIds || fixtureIds.length === 0) return;

        this.chaserStates.forEach(ch => {
            if (ch.running && ch.targetFixtureIds) {
                // Filter out the fixtures that are now getting a new look
                ch.targetFixtureIds = ch.targetFixtureIds.filter(fid =>
                    !fixtureIds.some(targetId => String(targetId) === String(fid))
                );

                // If a chaser has no more fixtures to run on, stop it entirely
                if (ch.targetFixtureIds.length === 0) {
                    this.stopChaser(ch);
                }
            }
        });
    }

    stopChaser(state, resetDMX = false, specificTargets = null) {
        console.log(`⏹ Stopping Chaser ${state.id} for targets:`, specificTargets || 'ALL');

        // If specific targets provided, remove only them
        if (specificTargets) {
            if (state.targetFixtureIds) {
                state.targetFixtureIds = state.targetFixtureIds.filter(fid =>
                    !specificTargets.some(t => String(t) === String(fid))
                );
            }
            if (resetDMX) {
                specificTargets.forEach(fid => this.resetFixtureEffects(fid));
            }
            // If targets remain, keep running
            if (state.targetFixtureIds.length > 0) {
                this.updateEffectUI(state); // Refresh UI
                return;
            }
        } else {
            // Stop ALL (Old behavior)
            if (resetDMX) {
                const targets = state.targetFixtureIds || [];
                targets.forEach(fid => this.resetFixtureEffects(fid));
            }
            state.targetFixtureIds = [];
        }

        // If we get here, the chaser is fully empty or forced stop
        state.running = false;
        // if (state.box) state.box.classList.remove('running'); // Handled by updateBoxDisplay

        // Cancel animation frame if exists
        if (state.animationFrame) {
            cancelAnimationFrame(state.animationFrame);
            state.animationFrame = null;
        }
        this.updateEffectUI(state);
    }

    runChaserAnimation(state) {
        if (!state.running) return;

        let lastTime = performance.now();
        let colorPhase = 0; // 0..2 (0->1 Up, 1->2 Down)

        // For Zoom context, we can Keep using absolute time if zoom_time is static, 
        // or we could apply similar logic. For now, we keep zoom simple but ensure it reads current zoom_time.
        const startTime = performance.now();

        // Parse hex colors to RGB
        const startRGB = this.hexToRgb(state.start_color);
        const endRGB = this.hexToRgb(state.end_color);

        const animate = (currentTime) => {
            if (!state.running) return;

            // Delta time for smooth speed changes
            const dt = currentTime - lastTime;
            lastTime = currentTime;

            // --- COLOR FADE LOGIC ---
            // Read fade_time dynamically every frame
            const currentFadeTime = state.fade_time > 100 ? state.fade_time : 100; // Safety floor
            const cycleDuration = currentFadeTime * 2; // Loop: A→B→A

            // Increment phase
            const phaseStep = (dt / cycleDuration) * 2;
            colorPhase = (colorPhase + phaseStep) % 2;

            let progress;
            if (state.mode === 'pulse') {
                progress = (colorPhase < 1) ? colorPhase : 0;
            } else {
                // Linear / Default (Ping-Pong)
                if (colorPhase < 1) {
                    progress = colorPhase;
                } else {
                    progress = 1 - (colorPhase - 1);
                }
            }

            // Apply Color Fade (if enabled)
            let r, g, b;
            if (state.color_fade_enabled) {
                r = Math.round(startRGB.r + (endRGB.r - startRGB.r) * progress);
                g = Math.round(startRGB.g + (endRGB.g - startRGB.g) * progress);
                b = Math.round(startRGB.b + (endRGB.b - startRGB.b) * progress);
            } else {
                // Solid Color (Start Color)
                r = startRGB.r;
                g = startRGB.g;
                b = startRGB.b;
            }

            // Limit DMX output rate (e.g., 30Hz / every 33ms) to save CPU/Network
            const now = performance.now();
            const shouldSendDMX = !state.lastDmxSend || (now - state.lastDmxSend > 33);
            if (shouldSendDMX) state.lastDmxSend = now;

            // Apply to its captured target fixtures
            const targetIds = state.targetFixtureIds || [this.fixtureId];

            targetIds.forEach(fixtureId => {
                const fixture = this.availableFixtures.find(f => f.id === fixtureId);
                if (!fixture) return;

                const fStartAddr = fixture.dmx_address;
                const fAssignments = this.assignmentCache[fixtureId] || {};

                // Find channels with assignments
                Object.keys(fAssignments).forEach(relCh => {
                    const chFunctions = fAssignments[relCh];
                    const relChNum = parseInt(relCh);
                    const absAddr = fStartAddr + relChNum - 1;

                    // Color Channels (Apply even if fade is false, using start color)
                    if (chFunctions.some(a => a.toLowerCase() === 'r')) {
                        if (shouldSendDMX) this.sendAbsoluteDMX(absAddr, r);
                    } else if (chFunctions.some(a => a.toLowerCase() === 'g')) {
                        if (shouldSendDMX) this.sendAbsoluteDMX(absAddr, g);
                    } else if (chFunctions.some(a => a.toLowerCase() === 'b')) {
                        if (shouldSendDMX) this.sendAbsoluteDMX(absAddr, b);
                    }

                    // Zoom Channels
                    if (chFunctions.some(a => a.toLowerCase() === 'zoom')) {
                        let zVal = 0;
                        if (state.zoom_enabled) {
                            const zoomMax = state.zoom_max !== undefined ? state.zoom_max : 255;

                            // Check if configured for oscillation (Zoom Enabled + Color/Master Fade Enabled)
                            // If Fade is OFF, we treat Zoom as a STATIC value (at Max)
                            const shouldOscillate = (state.color_fade_enabled !== false);

                            if (shouldOscillate) {
                                const zEffectiveProgress = state.zoom_sawtooth ?
                                    ((currentTime - startTime) % (currentFadeTime / 2) / (currentFadeTime / 2)) :
                                    (() => {
                                        const zTime = currentFadeTime / 2;
                                        const zElapsed = (currentTime - startTime) % (zTime * 2);
                                        return zElapsed < zTime ? (zElapsed / zTime) : (1 - ((zElapsed - zTime) / zTime));
                                    })();

                                const zFinalProgress = state.zoom_invert ? (1 - zEffectiveProgress) : zEffectiveProgress;
                                zVal = Math.round(zFinalProgress * zoomMax);
                            } else {
                                // Static Zoom
                                zVal = zoomMax;
                            }
                        }

                        if (shouldSendDMX) this.sendAbsoluteDMX(absAddr, zVal);

                        // Visual feedback ONLY for the currently active fixture in the fader bank
                        if (fixtureId === this.fixtureId) {
                            const chState = this.channels.find(c => c.channel === relChNum);
                            if (chState) {
                                chState.fader.value = zVal;
                                chState.valueDisplay.textContent = zVal;
                                chState.ledFill.style.height = `${(zVal / 255) * 100}%`;
                            }
                        }
                    }

                    // Strobe Channels
                    // Only apply if Strobe is enabled in the chaser. If disabled, leave it to manual control.
                    if (chFunctions.some(a => a.toLowerCase() === 'strobe')) {
                        if (state.strobe_enabled) {
                            const sVal = state.strobe_value !== undefined ? state.strobe_value : 128;
                            if (shouldSendDMX) this.sendAbsoluteDMX(absAddr, sVal);

                            // Visual feedback ONLY for the currently active fixture
                            if (fixtureId === this.fixtureId) {
                                const chState = this.channels.find(c => c.channel === relChNum);
                                if (chState) {
                                    chState.fader.value = sVal;
                                    chState.valueDisplay.textContent = sVal;
                                    chState.ledFill.style.height = `${(sVal / 255) * 100}%`;
                                }
                            }
                        }
                    }

                    // Dimmer Channels (DIM only, not W)
                    // Only apply if Dimmer is enabled in the chaser. If disabled, leave it to manual control.
                    if (state.dimmer_enabled && chFunctions.some(a => ['dim'].includes(a.toLowerCase()))) {
                        const dVal = state.dimmer_value !== undefined ? state.dimmer_value : 255;
                        if (shouldSendDMX) this.sendAbsoluteDMX(absAddr, dVal);

                        // Visual feedback
                        if (fixtureId === this.fixtureId) {
                            const chState = this.channels.find(c => c.channel === relChNum);
                            if (chState) {
                                chState.fader.value = dVal;
                                chState.valueDisplay.textContent = dVal;
                                chState.ledFill.style.height = `${(dVal / 255) * 100}%`;
                            }
                        }
                    }

                    // W Channels (+W logic)
                    // Only apply if W is explicitly enabled
                    if (state.w_enabled && chFunctions.some(a => ['w'].includes(a.toLowerCase()))) {
                        const wVal = state.dimmer_value !== undefined ? state.dimmer_value : 255;
                        if (shouldSendDMX) this.sendAbsoluteDMX(absAddr, wVal);

                        // Visual feedback
                        if (fixtureId === this.fixtureId) {
                            const chState = this.channels.find(c => c.channel === relChNum);
                            if (chState) {
                                chState.fader.value = wVal;
                                chState.valueDisplay.textContent = wVal;
                                chState.ledFill.style.height = `${(wVal / 255) * 100}%`;
                            }
                        }
                    }

                    // Update visual feedback for color channels on ACTIVE fixture
                    if (fixtureId === this.fixtureId) {
                        const chState = this.channels.find(c => c.channel === relChNum);
                        if (chState) {
                            const isR = chFunctions.some(a => a.toLowerCase() === 'r');
                            const isG = chFunctions.some(a => a.toLowerCase() === 'g');
                            const isB = chFunctions.some(a => a.toLowerCase() === 'b');

                            if (isR || isG || isB) {
                                const val = isR ? r : (isG ? g : b);
                                chState.fader.value = val;
                                chState.valueDisplay.textContent = val;
                                chState.ledFill.style.height = `${(val / 255) * 100}%`;
                            }
                        }
                    }
                }); // end inner channel loop
            }); // end outer fixture loop


            state.animationFrame = requestAnimationFrame(animate);
        };

        state.animationFrame = requestAnimationFrame(animate);
    }

    /**
     * Force reset special channels (Strobe, W) to 0 for target fixtures
     */
    resetSpecialChannels(state, type) {
        if (!state.targetFixtureIds) return;

        console.log(`🧹 Resetting ${type} for Chaser ${state.id}`);
        state.targetFixtureIds.forEach(fid => {
            const fixture = this.availableFixtures.find(f => f.id === fid);
            if (!fixture) return;

            const fStartAddr = fixture.dmx_address;
            const fAssignments = this.assignmentCache[fid] || {};

            Object.keys(fAssignments).forEach(relCh => {
                const chFunctions = fAssignments[relCh].map(f => f.toLowerCase());
                const relChNum = parseInt(relCh);
                const absAddr = fStartAddr + relChNum - 1;

                if (chFunctions.includes(type.toLowerCase())) {
                    this.sendAbsoluteDMX(absAddr, 0);

                    // UI Update if active
                    if (fid === this.fixtureId) {
                        const chState = this.channels.find(c => c.channel === relChNum);
                        if (chState) {
                            chState.fader.value = 0;
                            chState.valueDisplay.textContent = 0;
                            chState.ledFill.style.height = '0%';
                            chState.element.classList.remove('active');
                        }
                    }
                }
            });
        });
    }

    resetFixtureEffects(fixtureId) {
        console.log(`🧹 Resetting Zoom/Strobe for Fixture ${fixtureId}`);
        const fixture = this.availableFixtures.find(f => f.id === fixtureId);
        if (!fixture) return;

        const fStartAddr = fixture.dmx_address;
        const fAssignments = this.assignmentCache[fixtureId] || {};

        Object.keys(fAssignments).forEach(relCh => {
            const chFunctions = fAssignments[relCh].map(f => f.toLowerCase());
            const relChNum = parseInt(relCh);
            const absAddr = fStartAddr + relChNum - 1;

            // Reset only truly 'effect' channels like Zoom or Strobe. 
            // DO NOT reset DIM or W here, as it causes unintended blackouts on fixture/slot switches.
            if (chFunctions.includes('zoom') || chFunctions.includes('strobe')) {
                this.sendAbsoluteDMX(absAddr, 0);

                // Update global cache
                if (!this.globalValueCache[fixtureId]) this.globalValueCache[fixtureId] = {};
                this.globalValueCache[fixtureId][relChNum] = {
                    value: 0,
                    isOn: this.globalValueCache[fixtureId][relChNum]?.isOn !== false
                };

                // UI Reset if active
                if (fixtureId === this.fixtureId) {
                    const chState = this.channels.find(c => c.channel === relChNum);
                    if (chState) {
                        chState.fader.value = 0;
                        chState.valueDisplay.textContent = 0;
                        chState.ledFill.style.height = '0%';
                        chState.currentValue = 0;
                    }
                }
            }
        });
    }

    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 0, g: 0, b: 0 };
    }

    stopAllChasers() {
        this.chaserStates.forEach(s => {
            if (s.running) {
                this.stopChaser(s);
            }
        });
    }

    openChaserEditor(state) {
        console.log(`✏️ Opening Chaser Editor for:`, state);
        alert(`Chaser Editor coming soon!\nChaser ${state.id}: ${state.name}\nSteps: ${state.steps.length}`);
        // TODO: Open editor popup
    }

    // ===== CHASER DATA =====

    async loadChasers() {
        try {
            const res = await fetch(`${API}/api/faders/chasers`);
            const data = await res.json();
            if (data.success && data.chasers) {
                console.log(`📦 Loaded ${data.chasers.length} chasers from DB`);

                // Update chaser states with DB data
                data.chasers.forEach(dbChaser => {
                    const state = this.chaserStates.find(s => s.id === dbChaser.id);
                    if (state) {
                        state.start_color = dbChaser.start_color;
                        state.end_color = dbChaser.end_color;
                        state.fade_time = dbChaser.fade_time;
                        state.mode = dbChaser.mode;
                        state.zoom_enabled = dbChaser.zoom_enabled || false;
                        state.zoom_time = dbChaser.zoom_time || 2000;
                        state.zoom_max = dbChaser.zoom_max !== undefined ? dbChaser.zoom_max : 255;
                        state.zoom_invert = dbChaser.zoom_invert || false;
                        state.zoom_sawtooth = dbChaser.zoom_sawtooth || false;
                        state.color_fade_enabled = dbChaser.color_fade_enabled !== undefined ? (dbChaser.color_fade_enabled === true || dbChaser.color_fade_enabled === 1) : true;

                        // Load EXTENDED properties
                        state.strobe_enabled = dbChaser.strobe_enabled === 1 || dbChaser.strobe_enabled === true;
                        state.strobe_value = dbChaser.strobe_value !== undefined ? dbChaser.strobe_value : 128;
                        state.dimmer_enabled = dbChaser.dimmer_enabled !== undefined ? (dbChaser.dimmer_enabled === 1 || dbChaser.dimmer_enabled === true) : true;
                        state.dimmer_value = dbChaser.dimmer_value !== undefined ? dbChaser.dimmer_value : 255;
                        state.w_enabled = dbChaser.w_enabled === 1 || dbChaser.w_enabled === true;

                        // Update UI if box exists
                        if (state.box) {
                            if (state.color_fade_enabled) {
                                state.box.style.background = `linear-gradient(90deg, ${state.start_color} 0%, ${state.start_color} 50%, ${state.end_color} 50%, ${state.end_color} 100%)`;
                            } else {
                                state.box.style.background = state.start_color;
                            }
                        }
                    }
                });

                // Re-render to apply changes
                this.renderMacros();
            }
        } catch (e) {
            console.error('Failed to load chasers:', e);
        }
    }

    async saveChaser(id, start_color, end_color, fade_time, mode = 'linear', zoom_enabled = false, zoom_time = 2000, zoom_max = 255, zoom_invert = false, zoom_sawtooth = false, color_fade_enabled = true, strobe_enabled = false, strobe_value = 128, dimmer_enabled = true, dimmer_value = 255, w_enabled = false) {
        try {
            // Ensure boolean conversion for safety
            const isZoomEnabled = zoom_enabled === true || zoom_enabled === 1 || zoom_enabled === '1';
            const isInverted = zoom_invert === true || zoom_invert === 1 || zoom_invert === '1';
            const isSawtooth = zoom_sawtooth === true || zoom_sawtooth === 1 || zoom_sawtooth === '1';
            const isStrobeEnabled = strobe_enabled === true || strobe_enabled === 1 || strobe_enabled === '1';
            const isColorFade = color_fade_enabled !== false;
            const isDimmerEnabled = dimmer_enabled !== false;
            const isWEnabled = w_enabled === true;

            const body = {
                id,
                start_color,
                end_color,
                fade_time,
                mode,
                zoom_enabled: isZoomEnabled,
                zoom_time,
                zoom_max,
                zoom_invert: isInverted,
                zoom_sawtooth: isSawtooth,
                color_fade_enabled: isColorFade,
                strobe_enabled: isStrobeEnabled,
                strobe_value,
                dimmer_enabled: isDimmerEnabled,
                dimmer_value,
                w_enabled: isWEnabled
            };

            console.log('📡 Saving Chaser to API:', body);

            const res = await fetch(`${API}/api/faders/chasers`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await res.json();
            if (data.success) {
                console.log(`✅ Saved Chaser ${id}: Zoom=${isZoomEnabled ? 'ON' : 'OFF'} | Mode=${isSawtooth ? 'SAW' : 'PULSE'}`);
            }
        } catch (e) {
            console.error('Failed to save chaser:', e);
        }
    }


    toggleMacros() {
        const container = document.querySelector('.macros-container');
        const btn = document.querySelector('.macro-toggle-btn');
        if (!container || !btn) return;

        this.macrosCollapsed = !this.macrosCollapsed;
        container.classList.toggle('collapsed', this.macrosCollapsed);
        btn.classList.toggle('collapsed', this.macrosCollapsed);
        btn.innerHTML = this.macrosCollapsed ? '›' : '‹';
    }

    createPresetElement(state, container) {
        const item = document.createElement('div');
        item.className = 'macro-item';

        const box = document.createElement('div');
        box.className = 'macro-box preset-box';

        // Try to determine color from values
        if (state.values && this.assignmentCache[this.fixtureId]) {
            let r = 0, g = 0, b = 0, found = false;
            const assignments = this.assignmentCache[this.fixtureId];
            state.values.forEach(v => {
                const funcsRaw = assignments[v.channel] || [];
                const funcs = funcsRaw.map(f => f.toUpperCase());
                if (funcs.includes('R')) { r = v.value; found = true; }
                if (funcs.includes('G')) { g = v.value; found = true; }
                if (funcs.includes('B')) { b = v.value; found = true; }
            });
            if (found) {
                box.style.background = `rgb(${r},${g},${b})`;
                box.title = `RGB(${r},${g},${b})`;
                // Adjust text color for contrast
                if ((r * 0.299 + g * 0.587 + b * 0.114) > 150) {
                    box.style.color = '#000';
                    box.style.textShadow = 'none';
                } else {
                    box.style.color = '#fff';
                }
            } else {
                const chs = state.values.map(v => v.channel).join(',');
                const asgDetails = state.values.map(v => {
                    const asg = assignments[v.channel] || [];
                    return `${v.channel}:${asg.join('')}`;
                }).join(' ');
                box.title = `No Color. Chs: ${chs}. Asg: ${asgDetails}`;
                // Fallback style
                box.style.background = '#333';
                box.style.color = '#aaa';
            }
        }

        const nameEl = document.createElement('div');
        nameEl.className = 'preset-name';
        nameEl.textContent = state.name;
        box.appendChild(nameEl);

        const controls = document.createElement('div');
        controls.className = 'preset-controls';

        const saveBtn = document.createElement('div');
        saveBtn.className = 'macro-save-btn';
        saveBtn.textContent = 'SAVE';

        const delBtn = document.createElement('div');
        delBtn.className = 'preset-delete-btn-new';
        delBtn.textContent = 'DEL';

        controls.appendChild(saveBtn);
        controls.appendChild(delBtn);

        item.appendChild(box);
        item.appendChild(controls);
        container.appendChild(item);

        state.box = box;
        state.nameEl = nameEl;

        // Apply Preset
        this.bindButton(box, () => this.recallPreset(state));

        // Delete Preset
        this.bindButton(delBtn, () => {
            if (confirm(`Preset "${state.name}" wirklich löschen?`)) {
                console.log('User confirmed deletion of preset:', state.id);
                this.deletePresetFromDB(state);
            }
        });

        // Save Preset
        this.bindButton(saveBtn, () => this.savePresetToDB(state));

        // Double click name to rename
        box.ondblclick = (e) => {
            e.stopPropagation();
            const newName = prompt('Preset Name:', state.nameEl.textContent);
            if (newName) this.renamePreset(state, newName);
        };
    }

    async loadMacros() {
        try {
            console.log(`🔍 Loading global macros`);
            const res = await fetch(`${API}/api/faders/macros`); // Global, no fixtureId
            const data = await res.json();
            console.log('📦 Macros API Data:', data);

            if (data.success && data.macros) {
                data.macros.forEach(m => {
                    const state = this.macroStates.find(s => s.id == m.id); // Loose equality
                    if (state) {
                        console.log(`   -> Update State ${state.id}: ${state.color} -> ${m.color}`);
                        state.color = m.color;
                        if (state.box) state.box.style.backgroundColor = m.color;
                        if (state.picker) state.picker.value = m.color;
                    } else {
                        console.warn(`   -> Macro State not found for ID ${m.id}`);
                    }
                });
                this.renderMacros(); // Ensure UI updates
            }
        } catch (e) {
            console.error('Failed to load macros:', e);
        }
    }

    async saveMacro(id, color) {
        try {
            await fetch(`${API}/api/faders/macros`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, color }) // Global macros, no fixtureId
            });
        } catch (e) {
            console.error('Failed to save macro:', e);
        }
    }

    async syncMacroToPreset(macroId, hex) {
        console.log(`Syncing Quick Color ${macroId} to presets...`);
        const name = `Quick Color ${macroId}`;
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);

        // 1. Build values based on assignments
        const assignments = this.assignmentCache[this.fixtureId];
        if (!assignments) return;

        let values = [];
        Object.keys(assignments).forEach(chStr => {
            const funcsRaw = assignments[chStr] || [];
            const funcs = funcsRaw.map(f => f.toUpperCase());
            const ch = parseInt(chStr);

            if (funcs.includes('R')) values.push({ channel: ch, value: r, isOn: true });
            if (funcs.includes('G')) values.push({ channel: ch, value: g, isOn: true });
            if (funcs.includes('B')) values.push({ channel: ch, value: b, isOn: true });
        });

        if (values.length === 0) return;

        // 2. Find existing preset by name
        let preset = this.presetStates.find(p => p.name === name);
        let presetId;

        if (!preset) {
            // Create new
            const res = await fetch(`${API}/api/faders/presets/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fixtureId: this.fixtureId, name })
            });
            const data = await res.json();
            if (data.success) presetId = data.id;
        } else {
            presetId = preset.id;
        }

        if (presetId) {
            await fetch(`${API}/api/faders/presets`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: presetId, fixtureId: this.fixtureId, values })
            });
            await this.loadPresets(); // Refresh list to show colors
        }
    }

    async loadPresets() {
        try {
            const res = await fetch(`${API}/api/faders/presets?fixtureId=${this.fixtureId}`);
            const data = await res.json();
            if (data.success && data.presets) {
                this.presetStates = data.presets.map(p => ({
                    id: p.id,
                    name: p.name,
                    values: p.values
                }));
            } else {
                this.presetStates = [];
            }
            this.renderMacros(); // Always render, even if no presets
        } catch (e) {
            console.error('Failed to load presets:', e);
        }
    }

    async createNewPreset() {
        console.log('Attempting to create a new preset for fixture:', this.fixtureId);
        try {
            const res = await fetch(`${API}/api/faders/presets/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fixtureId: this.fixtureId, name: 'New Preset' })
            });
            const data = await res.json();
            if (data.success) {
                console.log('Preset created successfully:', data);
                this.presetStates.push({
                    id: data.id,
                    name: data.name,
                    values: []
                });
                this.renderMacros();
            } else {
                console.error('Server failed to create preset:', data.error);
                alert('Fehler beim Erstellen des Presets: ' + (data.error || 'Serverfehler'));
            }
        } catch (e) {
            console.error('Network/Fetch failed for create preset:', e);
            alert('Netzwerkfehler beim Erstellen des Presets');
        }
    }

    async savePresetToDB(state) {
        try {
            // Collect values only for the channels this fixture actually has
            const values = [];
            if (!this.globalValueCache[this.fixtureId]) this.globalValueCache[this.fixtureId] = {};

            for (let i = 1; i <= this.fixtureChannelCount; i++) {
                // Use cached value if available, otherwise use backend value or 0
                const cached = this.globalValueCache[this.fixtureId][i];

                // For backend lookup during save, we need the absolute address
                const absAddr = this.fixtureStartAddress + i - 1;
                const bkValue = this.backendValues[absAddr - 1] || 0;

                values.push({
                    channel: i,
                    value: cached ? cached.value : bkValue,
                    isOn: cached ? cached.isOn : true
                });
            }

            await fetch(`${API}/api/faders/presets`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: state.id, values, fixtureId: this.fixtureId })
            });

            state.values = values;

            // Flash green for success
            const oldBg = state.box.style.background;
            state.box.style.background = '#2e7d32';
            setTimeout(() => state.box.style.background = oldBg, 500);

            console.log(`Preset ${state.id} saved.`);
        } catch (e) {
            console.error('Failed to save preset:', e);
        }
    }

    async recallPreset(state) {
        if (!state.values || state.values.length === 0) {
            alert('Preset is empty! Set faders and click SAVE first.');
            return;
        }

        console.log(`🎨 Recalling preset "${state.name}" for selected fixtures:`, this.selectedFixtureIds);

        // Load all assignments
        const res = await fetch(`${API}/api/faders/all-assignments`);
        const data = await res.json();
        if (!data.success) return;
        const allAssignments = data.mapping;

        // Stop all running chasers to prevent conflicts
        this.stopAllChasers();

        // Convert channel-based preset to function-based values
        // Use the ACTIVE fixture's assignments to determine which functions are stored
        const activeAssignments = this.assignmentCache[this.fixtureId] || {};
        const functionValues = {}; // { 'R': 255, 'G': 128, 'DIM': 200, 'P': 127, 'T': 64, ... }
        const functionOnStates = {};

        state.values.forEach(v => {
            const channelAssignments = activeAssignments[v.channel] || [];
            channelAssignments.forEach(func => {
                const f = func.toUpperCase();
                functionValues[f] = v.value;
                functionOnStates[f] = (v.is_on === 1 || v.is_on === true || v.is_on === undefined || v.is_on === null);
            });
        });

        console.log('Function values extracted from preset:', functionValues);

        // Apply to ALL selected fixtures
        for (const fixtureId of this.selectedFixtureIds) {
            // KILL any running effects on this fixture
            this.resetFixtureEffects(fixtureId);

            const fixture = this.availableFixtures.find(f => f.id === fixtureId);
            if (!fixture) {
                console.warn(`Fixture ${fixtureId} not found in availableFixtures`);
                continue;
            }

            const assignments = allAssignments[fixtureId];
            if (!assignments) {
                console.warn(`Fixture ${fixtureId} has no assignments`);
                continue;
            }

            console.log(`Applying preset to Fixture ${fixtureId} (DMX ${fixture.dmx_address}):`, assignments);

            // For each channel, check if it has a function that's in our preset
            let dmxCommands = 0;
            Object.keys(assignments).forEach(relCh => {
                const functions = assignments[relCh];
                const relChNum = parseInt(relCh);
                const absAddr = fixture.dmx_address + relChNum - 1;

                functions.forEach(f => {
                    const val = functionValues[f];
                    if (val !== undefined) {
                        console.log(`  → CH${absAddr} (${f}) = ${val}`);
                        this.sendAbsoluteDMX(absAddr, val);
                        dmxCommands++;
                    }
                });
            });
            console.log(`Sent ${dmxCommands} DMX commands for Fixture ${fixtureId}`);
        }

        // Update UI if active fixture is in selection
        // Update UI if active fixture is in selection
        if (this.selectedFixtureIds.some(id => id == this.fixtureId)) {
            this.channels.forEach(chState => {
                const chAssignments = (this.assignmentCache[this.fixtureId]?.[chState.channel] || []).map(f => f.toUpperCase());

                chAssignments.forEach(f => {
                    const val = functionValues[f];
                    const isOn = functionOnStates[f];

                    if (val !== undefined) {
                        // Update global cache
                        if (!this.globalValueCache[this.fixtureId]) this.globalValueCache[this.fixtureId] = {};
                        this.globalValueCache[this.fixtureId][chState.channel] = {
                            value: val,
                            isOn: isOn !== undefined ? isOn : chState.isOn
                        };

                        // Update Fader UI
                        this.updateFaderValue(chState, val, false);
                        if (isOn !== undefined) {
                            this.toggleOnState(chState, isOn, false);
                        }
                    }
                });
            });
        }
    }

    async renamePreset(state, newName) {
        try {
            await fetch(`${API}/api/faders/presets/rename`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: state.id, name: newName, fixtureId: this.fixtureId })
            });
            state.name = newName;
            state.nameEl.textContent = newName;
        } catch (e) {
            console.error('Failed to rename preset:', e);
        }
    }

    async deletePresetFromDB(state) {
        try {
            console.log('Deleting preset from DB:', state.id);
            const res = await fetch(`${API}/api/faders/presets/delete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: state.id, fixtureId: this.fixtureId })
            });
            const data = await res.json();
            if (data.success) {
                console.log('Preset deleted successfully');
                this.presetStates = this.presetStates.filter(p => p.id !== state.id);
                this.renderMacros();
            } else {
                console.error('Delete failed:', data.error);
                alert('Löschen fehlgeschlagen: ' + (data.error || 'Serverfehler'));
            }
        } catch (e) {
            console.error('Failed to delete preset:', e);
            alert('Löschen fehlgeschlagen (Netzwerkfehler)');
        }
    }

    async applyMacroColor(hex, shouldSave = true) {
        // Only stop chasers on the CURRENTLY selected fixtures
        this.stopChasersOnFixtures(this.selectedFixtureIds);

        if (!hex || hex.length < 7) {
            console.error('Invalid Macro Color:', hex);
            return;
        }

        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);

        console.log(`🎨 Applying color ${hex} to selected fixtures:`, this.selectedFixtureIds);

        const allAssignments = await this.getFullAssignments();
        const updates = {};

        for (const fixtureId of this.selectedFixtureIds) {
            const fixture = this.availableFixtures.find(f => f.id == fixtureId);
            if (!fixture) continue;

            const assignments = allAssignments[fixtureId];
            if (!assignments) continue;

            if (!this.globalValueCache[fixtureId]) this.globalValueCache[fixtureId] = {};

            Object.keys(assignments).forEach(relCh => {
                const functions = assignments[relCh];
                const relChNum = parseInt(relCh);
                const absAddr = fixture.dmx_address + relChNum - 1;

                functions.forEach(f => {
                    let val = -1;
                    if (f === 'R' || f === 'r') val = r;
                    else if (f === 'G' || f === 'g') val = g;
                    else if (f === 'B' || f === 'b') val = b;
                    else if (f === 'W' || f === 'w') val = 0; // Fix: reset white for RGB macros
                    else if (f === 'DIM' || f === 'dim') val = 255; // Force turn on for color pick
                    else if (f === 'STROBE' || f === 'strobe') val = 255; // Force open shutter

                    if (val !== -1) {
                        updates[absAddr] = val;
                        this.globalValueCache[fixtureId][relChNum] = { value: val, isOn: true };
                    }
                });
            });
        }

        await this.sendSparseDMX(updates);

        if (this.selectedFixtureIds.some(id => id == this.fixtureId)) {
            this.channels.forEach(state => {
                let valToSet = -1;
                if (state.assignments.r) valToSet = r;
                else if (state.assignments.g) valToSet = g;
                else if (state.assignments.b) valToSet = b;
                else if (state.assignments.w) valToSet = 0;
                else if (state.assignments.dim) valToSet = 255;
                else if (state.assignments.strobe) valToSet = 255;

                if (valToSet !== -1) {
                    state.fader.value = valToSet;
                    state.currentValue = valToSet;
                    state.valueDisplay.textContent = valToSet;
                    state.ledFill.style.height = `${(valToSet / 255) * 100}%`;
                    if (valToSet > 0) state.element.classList.add('active');
                    else state.element.classList.remove('active');
                }
            });
        }
    }

    /**
     * Rename and Color Picker Overlay (Auto-save)
     */
    makeLabelEditable(state) {
        if (state.isEditing) return;
        state.isEditing = true;

        const overlay = document.createElement('div');
        overlay.className = 'color-editor-overlay';

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.placeholder = 'Kanalname...';
        nameInput.value = state.label.textContent || '';

        const colorInput = document.createElement('input');
        colorInput.type = 'color';
        const currentColor = state.customColor || '#333333';
        colorInput.value = currentColor.startsWith('rgba') ? '#333333' : currentColor;

        overlay.appendChild(nameInput);
        overlay.appendChild(colorInput);
        state.element.appendChild(overlay);
        nameInput.focus();

        const close = () => {
            document.removeEventListener('mousedown', checkClickOutside);
            overlay.remove();
            state.isEditing = false;
        };

        const checkClickOutside = (e) => {
            if (!overlay.contains(e.target) && e.target !== state.label) {
                close();
            }
        };

        // Add small delay to listeners so we don't catch the initial click
        setTimeout(() => {
            document.addEventListener('mousedown', checkClickOutside);
        }, 10);

        // Auto-save name
        let nameTimeout;
        nameInput.oninput = () => {
            const newName = nameInput.value.trim() || `CH ${state.channel}`;
            state.label.textContent = newName;
            clearTimeout(nameTimeout);
            nameTimeout = setTimeout(() => this.saveFaderName(state.channel, newName), 500);
        };

        // Auto-save color
        colorInput.oninput = () => {
            const newColor = colorInput.value;
            state.customColor = newColor;
            state.element.style.setProperty('--channel-color', newColor);
            this.saveChannelColor(state.channel, newColor);
        };

        nameInput.onkeydown = (e) => {
            if (e.key === 'Enter' || e.key === 'Escape') close();
        };
    }

    /**
     * Send DMX value to backend
     */
    async sendToBackend(channel, value) {
        if (this.isInitializing) return; // Ignore pushes during fixture/layer switch

        // channel is relative (1..32)
        const dmxAddress = this.fixtureStartAddress + channel - 1;
        try {
            const res = await fetch(`${API}/api/dmx/channel`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ channel: dmxAddress, value })
            });
            if (!res.ok) {
                const data = await res.json();
                console.error(`❌ DMX Error (Ch:${dmxAddress}, Val:${value}):`, data.error || res.statusText);
            }
        } catch (e) {
            // Silent fail
        }
    }

    /**
     * Monitor backend DMX values
     */
    async startBackendMonitor() {
        const updateValues = async () => {
            try {
                const res = await fetch(`${API}/api/dmx/channels`);
                const data = await res.json();

                if (data.channels) {
                    this.backendValues = data.channels;

                    // Update global cache for the current fixture with latest backend data
                    if (!this.globalValueCache[this.fixtureId]) this.globalValueCache[this.fixtureId] = {};
                    for (let i = 1; i <= 32; i++) {
                        const absAddr = this.fixtureStartAddress + i - 1;
                        if (absAddr > 512) break;
                        const val = this.backendValues[absAddr - 1] || 0;
                        if (!this.globalValueCache[this.fixtureId][i]) {
                            this.globalValueCache[this.fixtureId][i] = { value: val, isOn: true };
                        } else {
                            this.globalValueCache[this.fixtureId][i].value = val;
                        }
                    }

                    this.channels.forEach(state => {
                        const absoluteChannel = this.fixtureStartAddress + state.channel - 1;
                        const backendValue = this.backendValues[absoluteChannel - 1] || 0;

                        const percentage = (backendValue / 255) * 100;
                        state.ledFill.style.height = `${percentage}%`;

                        if (!state.hasLoadedOnce) {
                            state.fader.value = backendValue;
                            state.valueDisplay.textContent = backendValue;
                            state.currentValue = backendValue;

                            if (backendValue > 0) {
                                state.element.classList.add('active');
                            }

                            state.hasLoadedOnce = true;
                        }
                    });

                    // Sync global encoders with active fixture values
                    this.syncEncodersFromActiveFixture();
                }
            } catch (e) {
                console.error('Failed to fetch backend values:', e);
            }
        };

        this.updateValues = updateValues;
        await updateValues();
        setInterval(updateValues, 150); // High-speed sync
    }

    /**
     * Backend heartbeat
     */
    async startHeartbeat() {
        const checkStatus = async () => {
            try {
                const res = await fetch(`${API}/health`);
                const data = await res.json();

                const bStatus = document.getElementById('backend-status');
                const dStatus = document.getElementById('dmx-status');

                if (bStatus) bStatus.classList.add('online');

                if (dStatus) {
                    if (data.dmx) {
                        dStatus.classList.add('online');
                    } else {
                        dStatus.classList.remove('online');
                    }
                }
            } catch (e) {
                const bStatus = document.getElementById('backend-status');
                const dStatus = document.getElementById('dmx-status');
                if (bStatus) bStatus.classList.remove('online');
                if (dStatus) dStatus.classList.remove('online');
            }
        };

        await checkStatus();
        setInterval(checkStatus, 3000);
    }

    /**
     * Save channel state (ON/SELECT) to database
     */
    async saveChannelState(channel, type, enabled) {
        try {
            await fetch(`${API}/api/faders/state`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fixtureId: this.fixtureId,
                    channel,
                    type,
                    enabled
                })
            });
            console.log(`CH${channel}: State ${type.toUpperCase()} -> ${enabled}`);
        } catch (e) {
            console.error('Failed to save channel state:', e);
        }
    }

    /**
     * Load channel groups from database
     */
    async loadChannelGroups() {
        try {
            const res = await fetch(`${API}/api/faders/groups?fixtureId=${this.fixtureId}`);
            const data = await res.json();

            if (data.success && data.groups) {
                this.groupCache[this.fixtureId] = data.groups; // Cache all 32 groups

                Object.keys(data.groups).forEach(channelStr => {
                    const channelNum = parseInt(channelStr);
                    const state = this.channels.find(c => c.channel === channelNum);
                    if (state) {
                        const groups = data.groups[channelNum];
                        Object.keys(state.groups).forEach(letter => {
                            const active = groups.includes(letter.toUpperCase());
                            state.groups[letter] = active;
                            if (state.groupBtns[letter]) {
                                if (active) state.groupBtns[letter].classList.add('active');
                                else state.groupBtns[letter].classList.remove('active');
                            }
                        });
                    }
                });
            }
        } catch (e) {
            console.error('Failed to load channel groups:', e);
        }
    }


    async loadGlobalPalettes() {
        try {
            const res = await fetch(`${API}/api/faders/palettes`);
            const data = await res.json();
            if (data.success) {
                this.globalPaletteStates = data.palettes;
                this.renderPresetsSidebar(); // Re-render sidebar to show palettes
            }
        } catch (e) {
            console.error('Failed to load global palettes:', e);
        }
    }

    createPaletteElement(state, container) {
        const item = document.createElement('div');
        item.className = 'macro-item';

        const box = document.createElement('div');
        box.className = 'macro-box palette-box';
        box.style.border = '1px solid #444';

        // Check for Color
        let r = 0, g = 0, b = 0, hasColor = false;
        if (state.values) {
            state.values.forEach(v => {
                if (v.type === 'R') { r = v.value; hasColor = true; }
                if (v.type === 'G') { g = v.value; hasColor = true; }
                if (v.type === 'B') { b = v.value; hasColor = true; }
            });
        }

        if (hasColor) {
            box.style.background = `rgb(${r},${g},${b})`;
            // Contrast check
            if ((r * 0.299 + g * 0.587 + b * 0.114) > 150) {
                box.style.color = '#000';
                box.style.textShadow = 'none';
            } else {
                box.style.color = '#fff';
            }
        } else {
            box.style.background = 'linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%)';
        }

        const nameEl = document.createElement('div');
        nameEl.className = 'preset-name';
        nameEl.textContent = state.name;
        nameEl.style.color = '#fff';
        box.appendChild(nameEl);

        const controls = document.createElement('div');
        controls.className = 'preset-controls';

        const saveBtn = document.createElement('div');
        saveBtn.className = 'macro-save-btn';
        saveBtn.style.background = '#00695c';
        saveBtn.textContent = 'SAVE';

        const delBtn = document.createElement('div');
        delBtn.className = 'preset-delete-btn-new';
        delBtn.textContent = 'DEL';

        controls.appendChild(saveBtn);
        controls.appendChild(delBtn);

        item.appendChild(box);
        item.appendChild(controls);
        container.appendChild(item);

        this.bindButton(box, () => this.recallGlobalPalette(state));
        this.bindButton(saveBtn, () => this.saveGlobalPaletteToDB(state));
        this.bindButton(delBtn, () => this.deleteGlobalPalette(state));
    }

    async recallGlobalPalette(state) {
        // Determine which fixtures to apply to:
        // 1. If MULTIPLE fixtures are selected, use those (override)
        // 2. Otherwise, use the saved fixture_ids from the palette
        let targetFixtures = [];

        // Only use selectedFixtureIds if more than one is selected
        // (single selection is just the active fixture, not a multi-select)
        if (this.selectedFixtureIds && this.selectedFixtureIds.length > 1) {
            targetFixtures = this.selectedFixtureIds;
        } else {
            targetFixtures = state.fixture_ids || [];
        }

        console.log(`🌍 Recalling Global Palette: ${state.name} for fixtures:`, targetFixtures);

        if (targetFixtures.length === 0) {
            alert('Keine Lampen ausgewählt und keine Lampen in der Palette gespeichert!');
            return;
        }

        try {
            // 1. Get current assignments for ALL fixtures
            const res = await fetch(`${API}/api/faders/all-assignments`);
            const data = await res.json();
            if (!data.success) return;

            const assignmentMapping = data.mapping;

            // 2. Map palette values for easier lookup
            const paletteMap = {};
            state.values.forEach(v => {
                paletteMap[v.type.toUpperCase()] = v.value;
            });

            // 3. For each target fixture, apply palette to assigned channels
            for (const fixtureId of targetFixtures) {
                const fixtureAssignments = assignmentMapping[fixtureId];
                if (!fixtureAssignments) continue;

                // Find the fixture object to get its start address
                const fixture = this.availableFixtures.find(f => f.id === fixtureId);
                const startAddr = fixture ? fixture.dmx_address : 1;

                // Iterate channels of this fixture and check assignments
                Object.keys(fixtureAssignments).forEach(relChannel => {
                    const functions = fixtureAssignments[relChannel];
                    const relChNum = parseInt(relChannel);

                    // Check if any function of this channel is in our palette
                    functions.forEach(f => {
                        const val = paletteMap[f.toUpperCase()];
                        if (val !== undefined) {
                            // Send to backend via absolute DMX
                            this.sendAbsoluteDMX(startAddr + relChNum - 1, val);
                        }
                    });
                });
            }

            // Sync UI if the active fixture was modified
            if (targetFixtures.some(id => id == this.fixtureId)) {
                setTimeout(() => this.updateValues(), 200);
            }
        } catch (e) {
            console.error('Failed to recall global palette:', e);
        }
    }

    async sendAbsoluteDMX(address, value) {
        // Validation Clamp
        const safeValue = Math.max(0, Math.min(255, Math.round(value)));

        try {
            const res = await fetch(`${API}/api/dmx/channel`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ channel: address, value: safeValue })
            });
            if (!res.ok) {
                const data = await res.json();
                console.error(`❌ DMX Error (Ch:${address}, Val:${value}):`, data.error || res.statusText);
            }
        } catch (e) { }
    }

    async sendSparseDMX(updates) {
        if (Object.keys(updates).length === 0) return;
        try {
            const res = await fetch(`${API}/api/dmx/sparse`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ channels: updates })
            });
            if (!res.ok) {
                const data = await res.json();
                console.error('❌ Sparse DMX Error:', data.error || res.statusText);
            }
        } catch (e) {
            console.error('❌ Sparse DMX Request Failed:', e);
        }
    }

    async createNewGlobalPalette() {
        const name = prompt('Name für neue globale Palette:', 'Global Color');
        if (!name) return;
        try {
            const res = await fetch(`${API}/api/faders/palettes/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            });
            const data = await res.json();
            if (data.success) {
                await this.loadGlobalPalettes();
                this.renderMacros();
            }
        } catch (e) { }
    }

    async saveGlobalPaletteToDB(state) {
        try {
            const values = [];
            const processedTypes = new Set();

            await this.loadChannelAssignments();
            const assignments = this.assignmentCache[this.fixtureId];
            if (!assignments) {
                alert('Zuerst Assignments (R,G,B...) für dieses Fixture anlegen!');
                return;
            }

            Object.keys(assignments).forEach(relCh => {
                const types = assignments[relCh];
                const relChNum = parseInt(relCh);

                const cached = (this.globalValueCache[this.fixtureId] || {})[relChNum];
                const absAddr = this.fixtureStartAddress + relChNum - 1;
                const val = cached ? cached.value : (this.backendValues[absAddr - 1] || 0);

                types.forEach(t => {
                    if (!processedTypes.has(t)) {
                        values.push({ type: t, value: val });
                        processedTypes.add(t);
                    }
                });
            });

            if (values.length === 0) {
                alert('Keine Kanäle mit Zuweisungen (R,G,B...) gefunden!');
                return;
            }

            await fetch(`${API}/api/faders/palettes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: state.id,
                    values,
                    fixtureIds: this.selectedFixtureIds // Remember which fixtures this palette applies to
                })
            });

            await this.loadGlobalPalettes();
            alert(`Palette "${state.name}" gespeichert!`);
        } catch (e) { }
    }

    async deleteGlobalPalette(state) {
        if (!confirm(`Global Palette "${state.name}" löschen?`)) return;
        try {
            await fetch(`${API}/api/faders/palettes/${state.id}`, { method: 'DELETE' });
            await this.loadGlobalPalettes();
            this.renderMacros();
        } catch (e) { }
    }



    /**
     * Save channel group to database
     */
    async saveChannelGroup(channel, groupLetter, enabled) {
        try {
            await fetch(`${API}/api/faders/groups`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    channel,
                    groupLetter: groupLetter.toUpperCase(),
                    enabled,
                    fixtureId: this.fixtureId
                })
            });
            console.log(`CH${channel}: Group ${groupLetter.toUpperCase()} ${enabled ? 'ON' : 'OFF'}`);
        } catch (e) {
            console.error('Failed to save channel group:', e);
        }
    }

    /**
     * Save fader value to database
     */
    async saveFaderValue(channel, value) {
        try {
            await fetch(`${API}/api/faders/value`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fixtureId: this.fixtureId,
                    channel,
                    value
                })
            });
        } catch (e) {
            console.error('Failed to save fader value:', e);
        }
    }

    /**
     * Save channel state (ON/SELECT) to database
     */
    async saveChannelState(channel, type, enabled) {
        try {
            await fetch(`${API}/api/faders/state`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fixtureId: this.fixtureId,
                    channel,
                    type,
                    enabled
                })
            });
            console.log(`CH${channel}: State ${type.toUpperCase()} -> ${enabled}`);
        } catch (e) {
            console.error('Failed to save channel state:', e);
        }
    }

    /**
     * Save channel color to database
     */
    async saveChannelColor(channel, color) {
        try {
            await fetch(`${API}/api/faders/color`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fixtureId: this.fixtureId,
                    channel,
                    color
                })
            });
        } catch (e) {
            console.error('Failed to save channel color:', e);
        }
    }

    /**
     * Save current chaser as a Scene (CUE)
     */
    async saveChaserAsScene(chaserState) {
        const name = prompt('Cue Name:', `${chaserState.name} (Copy)`);
        if (!name) return;

        try {
            // Clean up state object to only save necessary data
            const cleanState = {
                start_color: chaserState.start_color,
                end_color: chaserState.end_color,
                fade_time: chaserState.fade_time,
                mode: chaserState.mode,
                zoom_enabled: chaserState.zoom_enabled,
                zoom_time: chaserState.zoom_time,
                zoom_max: chaserState.zoom_max,
                zoom_invert: chaserState.zoom_invert,
                zoom_sawtooth: chaserState.zoom_sawtooth,
                color_fade_enabled: chaserState.color_fade_enabled,
                strobe_value: chaserState.strobe_value,
                dimmer_enabled: chaserState.dimmer_enabled,
                dimmer_value: chaserState.dimmer_value,
                w_enabled: chaserState.w_enabled,
                w_enabled: chaserState.w_enabled,
                targetFixtureIds: this.selectedFixtureIds.length > 0 ? [...this.selectedFixtureIds] : (this.fixtureId ? [this.fixtureId] : [])
            };

            console.log('💾 Saving Chaser Cue with targets:', cleanState.targetFixtureIds);

            // Calculate duration (ensure integer)
            let duration = 1000;
            if (chaserState.color_fade_enabled) {
                duration = parseInt(chaserState.fade_time) || 1000;
            }

            const res = await fetch(`${API}/api/scenes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: name,
                    type: 'chaser',
                    folder_id: null,
                    color: '#ff9900', // Orange for Chasers
                    duration: duration,
                    channel_data: cleanState
                })
            });
            const data = await res.json();
            if (data.success) {
                alert(`Chaser saved as Cue: "${name}"`);
            } else {
                alert('Error saving cue: ' + data.error);
            }
        } catch (e) {
            console.error('Failed to save chaser as cue:', e);
            alert('Failed to save cue');
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.faderConsole = new FaderConsole(16);
});
