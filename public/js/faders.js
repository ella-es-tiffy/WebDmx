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
        this.selectedFixtureIds = [1]; // For multi-fixture actions
        this.isInitializing = false; // Flag to prevent accidental DMX pushes
        this.globalPaletteStates = [];

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
        this.renderFixtureSelector();

        // Create faders
        this.createFaders();

        // Initialize encoders
        this.initEncoders();

        // Load data for the initial fixture
        await this.refreshFixtureData();

        // Start backend monitoring
        this.startBackendMonitor();
        this.startHeartbeat();

        this.initMacros();
        await this.loadMacros();
        await this.loadPresets();
        await this.loadGlobalPalettes();
    }

    async refreshFixtureData() {
        console.log(`📡 Refreshing data for Fixture ${this.fixtureId}...`);
        await this.loadFaders(); // This loads names and other channel info
        await this.loadChannelAssignments();
        await this.loadChannelGroups();
    }

    async loadFixtures() {
        try {
            const res = await fetch(`${API}/api/devices`);
            this.availableFixtures = await res.json();
            console.log('Fixtures loaded:', this.availableFixtures);
        } catch (e) {
            console.error('Failed to load fixtures:', e);
        }
    }

    renderFixtureSelector() {
        const container = document.getElementById('fixture-selector');
        if (!container) return;

        container.innerHTML = '';
        this.availableFixtures.forEach(fix => {
            const btn = document.createElement('div');
            const isActive = this.fixtureId === fix.id;
            const isSelected = this.selectedFixtureIds.includes(fix.id);

            btn.className = `fixture-btn ${isActive ? 'active' : ''} ${isSelected ? 'selected' : ''}`;
            btn.innerHTML = `
                <div class="fix-btn-id">#${fix.id}</div>
                <div class="fix-btn-name">${fix.name}</div>
                <div style="font-size:7px; opacity:0.5;">CH ${fix.dmx_address}</div>
            `;

            btn.onclick = (e) => {
                if (e.shiftKey || e.ctrlKey || e.metaKey) {
                    this.toggleFixtureSelection(fix.id);
                } else {
                    this.selectFixture(fix);
                }
            };

            // Drag-to-select: Add to selection when mouse enters while pressed
            btn.onmouseenter = (e) => {
                if (e.buttons === 1 && (e.shiftKey || e.ctrlKey || e.metaKey)) {
                    if (!this.selectedFixtureIds.includes(fix.id)) {
                        this.selectedFixtureIds.push(fix.id);
                        this.renderFixtureSelector();
                    }
                }
            };

            container.appendChild(btn);
        });
    }

    toggleFixtureSelection(id) {
        if (this.selectedFixtureIds.includes(id)) {
            if (this.selectedFixtureIds.length > 1) {
                this.selectedFixtureIds = this.selectedFixtureIds.filter(fid => fid !== id);
            }
        } else {
            this.selectedFixtureIds.push(id);
        }
        this.renderFixtureSelector();
    }

    async selectFixture(fixture) {
        if (this.fixtureId === fixture.id) {
            // If already active, just ensure it's selected
            if (!this.selectedFixtureIds.includes(fixture.id)) {
                this.selectedFixtureIds = [fixture.id];
                this.renderFixtureSelector();
            }
            return;
        }
        this.isInitializing = true; // Block DMX pushes while switching

        this.fixtureId = fixture.id;
        this.selectedFixtureIds = [fixture.id]; // Reset selection to just this one
        this.fixtureStartAddress = fixture.dmx_address;
        this.fixtureChannelCount = fixture.channel_count || 16;
        this.startChannel = 1; // Reset to Page 1 (Relative 1-16)

        console.log(`🎯 Active Fixture changed to: ${fixture.name} (ID: ${fixture.id}, DMX Start: ${fixture.dmx_address})`);

        // Update UI
        this.renderFixtureSelector();

        // Re-create faders starting at the fixture's DMX address
        this.createFaders();

        // Immediate sync from backend before allowing pushes
        if (this.updateValues) await this.updateValues();

        // Reload all data for the new fixture
        await this.refreshFixtureData();
        await this.loadMacros();
        await this.loadPresets();
        this.renderMacros(); // Refresh sidebar to show global palettes

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
                            state.element.classList.remove('has-r', 'has-g', 'has-b', 'has-w', 'has-p', 'has-t');
                            Object.keys(state.assignments).forEach(k => state.assignments[k] = false);

                            data.assignments[channelNum].forEach(func => {
                                state.assignments[func] = true;
                                if (state.assignBtns[func]) state.assignBtns[func].classList.add('active');
                                state.element.classList.add(`has-${func}`);
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
                wheel.style.cursor = 'grab';
            };

            wheel.addEventListener('mousedown', start);
            document.addEventListener('mousemove', move);
            document.addEventListener('mouseup', end);

            wheel.addEventListener('touchstart', start);
            document.addEventListener('touchmove', move, { passive: false });
            document.addEventListener('touchend', end);
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

            // Calculate degrees for display (-270 to 270 for a typical 540° fixture)
            const degrees = Math.round((this.encoders[type].value / 255) * 540 - 270);
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

        // Apply to ALL selected fixtures
        for (const fixtureId of this.selectedFixtureIds) {
            const fixture = this.availableFixtures.find(f => f.id === fixtureId);
            if (!fixture) continue;

            const assignments = allAssignments[fixtureId];
            if (!assignments) continue;

            // For each channel with P or T assignment, send DMX
            Object.keys(assignments).forEach(relCh => {
                const functions = assignments[relCh];
                const relChNum = parseInt(relCh);

                if (functions.includes(assignKey)) {
                    const absAddr = fixture.dmx_address + relChNum - 1;
                    this.sendAbsoluteDMX(absAddr, value);
                }
            });
        }

        // Update UI if active fixture is in selection
        if (this.selectedFixtureIds.includes(this.fixtureId)) {
            const assignments = this.assignmentCache[this.fixtureId] || {};

            for (let relCh = 1; relCh <= 32; relCh++) {
                const channelAssignments = assignments[relCh] || [];
                if (!channelAssignments.includes(assignKey)) continue;

                // Update Cache
                if (!this.globalValueCache[this.fixtureId]) this.globalValueCache[this.fixtureId] = {};
                const cached = this.globalValueCache[this.fixtureId][relCh] || { value: 0, isOn: true };
                this.globalValueCache[this.fixtureId][relCh] = { value, isOn: cached.isOn };

                // Update UI if fader is visible
                const state = this.channels.find(c => c.channel === relCh);
                if (state) {
                    state.fader.value = value;
                    state.currentValue = value;
                    state.valueDisplay.textContent = value;
                    state.ledFill.style.height = `${(value / 255) * 100}%`;
                    if (value > 0) state.element.classList.add('active');
                    else state.element.classList.remove('active');
                }
            }
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

        // Update the preview display in the encoder column
        const preview = document.getElementById('rgbw-value');
        preview.style.backgroundColor = `rgb(${rgbValues.r}, ${rgbValues.g}, ${rgbValues.b})`;
        preview.style.color = (rgb.r + rgb.g + rgb.b > 1.5) ? '#000' : '#fff';
        preview.textContent = `${this.encoders.rgbw.hue}°`;

        // Load all assignments
        const res = await fetch(`${API}/api/faders/all-assignments`);
        const data = await res.json();
        if (!data.success) return;
        const allAssignments = data.mapping;

        // Apply to ALL selected fixtures
        for (const fixtureId of this.selectedFixtureIds) {
            const fixture = this.availableFixtures.find(f => f.id === fixtureId);
            if (!fixture) continue;

            const assignments = allAssignments[fixtureId];
            if (!assignments) continue;

            // For each channel with R/G/B assignment, send DMX
            Object.keys(assignments).forEach(relCh => {
                const functions = assignments[relCh];
                const relChNum = parseInt(relCh);
                const absAddr = fixture.dmx_address + relChNum - 1;

                functions.forEach(f => {
                    if (f === 'R') this.sendAbsoluteDMX(absAddr, rgbValues.r);
                    if (f === 'G') this.sendAbsoluteDMX(absAddr, rgbValues.g);
                    if (f === 'B') this.sendAbsoluteDMX(absAddr, rgbValues.b);
                });
            });
        }

        // Update UI if active fixture is in selection
        if (this.selectedFixtureIds.includes(this.fixtureId)) {
            const assignments = this.assignmentCache[this.fixtureId] || {};
            if (!this.globalValueCache[this.fixtureId]) this.globalValueCache[this.fixtureId] = {};

            for (let relCh = 1; relCh <= 32; relCh++) {
                const channelAssignments = assignments[relCh] || [];
                let valueToSet = -1;

                if (channelAssignments.includes('R')) valueToSet = rgbValues.r;
                else if (channelAssignments.includes('G')) valueToSet = rgbValues.g;
                else if (channelAssignments.includes('B')) valueToSet = rgbValues.b;

                if (valueToSet !== -1) {
                    const cached = this.globalValueCache[this.fixtureId][relCh] || { value: 0, isOn: true };

                    // Update Cache
                    this.globalValueCache[this.fixtureId][relCh] = { value: valueToSet, isOn: cached.isOn };

                    // Update UI if fader is visible
                    const state = this.channels.find(c => c.channel === relCh);
                    if (state) {
                        state.fader.value = valueToSet;
                        state.currentValue = valueToSet;
                        state.valueDisplay.textContent = valueToSet;
                        state.ledFill.style.height = `${(valueToSet / 255) * 100}%`;
                        if (valueToSet > 0) state.element.classList.add('active');
                        else state.element.classList.remove('active');
                    }
                }
            }
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
            assignments: { r: false, g: false, b: false, p: false, t: false, w: false },
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
        state.fader.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            this.updateFaderValue(state, value, true); // Save to DB
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
        this.macroStates = [
            { id: 1, color: '#333333' },
            { id: 2, color: '#333333' },
            { id: 3, color: '#333333' },
            { id: 4, color: '#333333' }
        ];
        this.presetStates = [];
        this.macrosCollapsed = false;

        this.renderMacros();
    }

    renderMacros() {
        const layout = document.querySelector('.main-layout');
        const encodersCol = document.querySelector('.encoders-column');

        if (!layout || !encodersCol) {
            console.error('Macro insertion points not found');
            return;
        }

        // Remove existing container if any to allow re-rendering
        const existing = document.querySelector('.macros-container');
        if (existing) existing.remove();

        const macrosContainer = document.createElement('div');
        macrosContainer.className = 'macros-container';

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
                this.renderMacros();
                e.stopPropagation();
            };
            layerHeader.appendChild(btn);
        });

        // FULL ON/OFF Toggle Badge
        const fullToggle = document.createElement('div');
        fullToggle.className = 'full-toggle-badge';

        // Count visible faders that are ON
        const visibleOnCount = this.channels.filter(c => c.isOn).length;
        const allOn = visibleOnCount > this.channels.length / 2;

        fullToggle.textContent = allOn ? 'FULL OFF' : 'FULL ON';
        if (allOn) fullToggle.classList.add('all-on');

        fullToggle.onclick = () => {
            this.toggleFullLayer(!allOn);
            this.renderMacros(); // Re-render to update the badge state
        };

        layerHeader.appendChild(fullToggle);
        macrosContainer.appendChild(layerHeader);

        // --- COLOR MACROS (4) ---
        this.macroStates.forEach(state => {
            const item = document.createElement('div');
            item.className = 'macro-item';

            const box = document.createElement('div');
            box.className = 'macro-box';
            box.style.backgroundColor = state.color;

            const pickerContainer = document.createElement('div');
            pickerContainer.className = 'macro-picker-container';

            const setBtn = document.createElement('div');
            setBtn.className = 'macro-set-btn';
            setBtn.textContent = 'COLOR';

            const picker = document.createElement('input');
            picker.type = 'color';
            picker.className = 'macro-hidden-picker';
            picker.value = state.color;

            pickerContainer.appendChild(setBtn);
            pickerContainer.appendChild(picker);

            item.appendChild(box);
            item.appendChild(pickerContainer);
            macrosContainer.appendChild(item);

            // Update state with new DOM elements
            state.box = box;
            state.picker = picker;

            // Apply Color 
            this.bindButton(box, () => this.applyMacroColor(state.color, true));

            // Picker change = Real-time preview (LIVE)
            picker.oninput = () => {
                state.color = picker.value;
                box.style.backgroundColor = state.color;
                this.applyMacroColor(state.color, false); // Live apply to lamps (DMX only, no DB save during drag)
            };

            // Picker close = Final save
            picker.onchange = () => {
                this.saveMacro(state.id, state.color);
                this.applyMacroColor(state.color, true); // Persist fader values to DB
            };
        });

        // --- PRESET MACROS ---
        this.presetStates.forEach(p => this.createPresetElement(p, macrosContainer));

        // --- GLOBAL PALETTES ---
        if (this.globalPaletteStates.length > 0) {
            const separator = document.createElement('div');
            separator.className = 'macro-separator';
            separator.innerHTML = '<span style="font-size: 8px; opacity: 0.3;">GLOBAL PALETTES</span>';
            separator.style.gridColumn = '1 / -1';
            separator.style.textAlign = 'center';
            separator.style.padding = '5px 0';
            macrosContainer.appendChild(separator);

            this.globalPaletteStates.forEach(p => this.createPaletteElement(p, macrosContainer));
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
        macrosContainer.appendChild(addItem);

        // Insert between faders and encoders
        layout.insertBefore(macrosContainer, encodersCol);

        // Sidebar Toggle Button (Move to body to prevent clipping)
        if (!document.querySelector('.macro-toggle-btn')) {
            const toggle = document.createElement('div');
            toggle.className = 'macro-toggle-btn';
            toggle.innerHTML = '‹';
            document.body.appendChild(toggle);
            this.bindButton(toggle, () => this.toggleMacros());
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
            const res = await fetch(`${API}/api/faders/macros?fixtureId=${this.fixtureId}`);
            const data = await res.json();
            if (data.success && data.macros) {
                data.macros.forEach(m => {
                    const state = this.macroStates.find(s => s.id === m.id);
                    if (state) {
                        state.color = m.color;
                        if (state.box) state.box.style.backgroundColor = m.color;
                        if (state.picker) state.picker.value = m.color;
                    }
                });
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
                body: JSON.stringify({ id, color, fixtureId: this.fixtureId })
            });
        } catch (e) {
            console.error('Failed to save macro:', e);
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
                this.renderMacros();
            }
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

        console.log(`Recalling preset ${state.id}...`);

        state.values.forEach(v => {
            // CRITICAL: Only recall channels that are within the current fixture's range
            if (v.channel > this.fixtureChannelCount) return;

            // Ensure isOn has a sane default (true) if missing or null
            const is_on = (v.is_on === 1 || v.is_on === true || v.is_on === undefined || v.is_on === null);

            // Update global cache
            if (!this.globalValueCache[this.fixtureId]) this.globalValueCache[this.fixtureId] = {};
            this.globalValueCache[this.fixtureId][v.channel] = {
                value: v.value,
                isOn: is_on
            };

            // If channel is currently visible, update the UI
            const chState = this.channels.find(c => c.channel === v.channel);
            if (chState) {
                this.updateFaderValue(chState, v.value, false);
                this.toggleOnState(chState, is_on, false); // Don't save to DB while recalling
            } else {
                // Even if not visible, send to DMX output
                if (is_on) {
                    this.sendToBackend(v.channel, v.value);
                } else {
                    this.sendToBackend(v.channel, 0);
                }
            }
        });
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
        if (!hex || hex.length < 7) {
            console.error('Invalid Macro Color:', hex);
            return;
        }

        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);

        console.log(`🎨 Applying color ${hex} to selected fixtures:`, this.selectedFixtureIds);

        // Load all assignments if not cached
        const res = await fetch(`${API}/api/faders/all-assignments`);
        const data = await res.json();
        if (!data.success) return;
        const allAssignments = data.mapping;

        // Apply to ALL selected fixtures
        for (const fixtureId of this.selectedFixtureIds) {
            const fixture = this.availableFixtures.find(f => f.id === fixtureId);
            if (!fixture) continue;

            const assignments = allAssignments[fixtureId];
            if (!assignments) {
                console.warn(`Fixture ${fixtureId} has no assignments yet`);
                continue;
            }

            // For each channel with R/G/B assignment, send DMX
            Object.keys(assignments).forEach(relCh => {
                const functions = assignments[relCh];
                const relChNum = parseInt(relCh);
                const absAddr = fixture.dmx_address + relChNum - 1;

                functions.forEach(f => {
                    if (f === 'R') this.sendAbsoluteDMX(absAddr, r);
                    if (f === 'G') this.sendAbsoluteDMX(absAddr, g);
                    if (f === 'B') this.sendAbsoluteDMX(absAddr, b);
                });
            });
        }

        // Also update UI if active fixture is in selection
        if (this.selectedFixtureIds.includes(this.fixtureId)) {
            let count = 0;
            this.channels.forEach(ch => {
                if (ch.assignments.r) {
                    this.updateFaderValue(ch, r, shouldSave);
                    count++;
                }
                if (ch.assignments.g) {
                    this.updateFaderValue(ch, g, shouldSave);
                    count++;
                }
                if (ch.assignments.b) {
                    this.updateFaderValue(ch, b, shouldSave);
                    count++;
                }
            });
            console.log(`Updated ${count} faders in UI`);
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
            await fetch(`${API}/api/dmx/channel`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ channel: dmxAddress, value })
            });
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
        box.style.background = 'linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%)';

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
        // 1. If fixtures are selected, use those (override)
        // 2. Otherwise, use the saved fixture_ids from the palette
        let targetFixtures = this.selectedFixtureIds;
        if (!targetFixtures || targetFixtures.length === 0) {
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
            if (targetFixtures.includes(this.fixtureId)) {
                setTimeout(() => this.updateValues(), 200);
            }
        } catch (e) {
            console.error('Failed to recall global palette:', e);
        }
    }

    async sendAbsoluteDMX(address, value) {
        try {
            await fetch(`${API}/api/dmx/channel`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ channel: address, value })
            });
        } catch (e) { }
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
}

document.addEventListener('DOMContentLoaded', () => {
    window.faderConsole = new FaderConsole(16);
});
