/**
 * DMX Fader Console - Fixture Configuration System
 * Assignments (R,G,B,W,P,T) are stored in database per fixture
 * Encoders work on ALL channels with P/T assignments (ignores SELECT)
 */

const API = `http://${window.location.hostname}:3000`;
const FIXTURE_ID = 1; // Currently configuring fixture 1

class FaderConsole {
    constructor(channelCount = 16) {
        this.channelCount = channelCount;
        this.channels = [];
        this.backendValues = new Array(512).fill(0);

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

        // Create faders
        this.createFaders();

        // Initialize encoders
        this.initEncoders();

        // Load names, assignments, and groups from database
        await this.loadFaderNames();
        await this.loadChannelAssignments();
        await this.loadChannelGroups();

        // Start backend monitoring
        this.startBackendMonitor();
        this.startHeartbeat();

        this.initMacros();
        await this.loadMacros();
        await this.loadPresets();
    }

    /**
     * Load channel assignments from database
     */
    async loadChannelAssignments() {
        try {
            const res = await fetch(`${API}/api/faders/assignments/${FIXTURE_ID}`);
            const data = await res.json();

            if (data.success) {
                // 1. Process assignments (R, G, B, P, T, W)
                if (data.assignments) {
                    Object.keys(data.assignments).forEach(channelStr => {
                        const channelNum = parseInt(channelStr);
                        const state = this.channels.find(c => c.channel === channelNum);
                        if (state) {
                            state.element.classList.remove('has-r', 'has-g', 'has-b', 'has-w', 'has-p', 'has-t');
                            data.assignments[channelNum].forEach(func => {
                                state.assignments[func] = true;
                                state.assignBtns[func].classList.add('active');
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
                    fixtureId: FIXTURE_ID,
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
     * Apply encoder to ALL channels with P or T assignment
     * Does NOT check isSelected!
     */
    applyEncoderToChannels(type, value) {
        const assignKey = type === 'pan' ? 'p' : 't';

        this.channels.forEach(state => {
            // Check if channel has P or T assignment
            if (!state.assignments[assignKey]) return;

            // Move fader
            state.fader.value = value;
            state.currentValue = value;
            state.valueDisplay.textContent = value;

            const percentage = (value / 255) * 100;
            state.ledFill.style.height = `${percentage}%`;

            if (value > 0) {
                state.element.classList.add('active');
            } else {
                state.element.classList.remove('active');
            }

            if (state.isOn) {
                this.sendToBackend(state.channel, value);
            }
        });
    }

    /**
     * Apply rainbow to ALL channels with R,G,B,W assignments
     * Updates UI faders so you can see the mix!
     */
    applyRainbowToChannels(rgb) {
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

        this.channels.forEach(state => {
            let valueToSet = -1;

            if (state.assignments.r) valueToSet = rgbValues.r;
            else if (state.assignments.g) valueToSet = rgbValues.g;
            else if (state.assignments.b) valueToSet = rgbValues.b;
            // Note: We leave 'w' (White) untouched here so the user can mix it manually!

            if (valueToSet !== -1) {
                state.fader.value = valueToSet;
                state.currentValue = valueToSet;
                state.valueDisplay.textContent = valueToSet;

                const percentage = (valueToSet / 255) * 100;
                state.ledFill.style.height = `${percentage}%`;

                if (valueToSet > 0) state.element.classList.add('active');
                else state.element.classList.remove('active');

                if (state.isOn) {
                    this.sendToBackend(state.channel, valueToSet);
                }
            }
        });
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
    async loadFaderNames() {
        try {
            const res = await fetch(`${API}/api/faders`);
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
                body: JSON.stringify({ channel, name })
            });
        } catch (e) {
            console.error('Failed to save fader name:', e);
        }
    }

    /**
     * Create dynamic fader channels
     */
    createFaders() {
        const bank = document.getElementById('fader-bank');

        for (let i = 1; i <= this.channelCount; i++) {
            const channel = this.createFaderChannel(i);
            bank.appendChild(channel.element);
            this.channels.push(channel);
        }
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

    toggleOnState(state, forceState = null) {
        state.isOn = (forceState !== null) ? forceState : !state.isOn;
        if (state.isOn) {
            state.onBtn.classList.add('active');
            this.sendToBackend(state.channel, parseInt(state.fader.value));
        } else {
            state.onBtn.classList.remove('active');
            this.sendToBackend(state.channel, 0);
        }
        this.saveChannelState(state.channel, 'on', state.isOn);
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

        // --- ADD PRESET BUTTON ---
        const addItem = document.createElement('div');
        addItem.className = 'macro-item';
        const addBtn = document.createElement('div');
        addBtn.className = 'macro-box add-macro-btn';
        addBtn.innerHTML = '<span style="font-size: 24px;">+</span><br><span style="font-size: 8px;">ADD PRESET</span>';
        addBtn.style.background = '#222';
        addBtn.style.borderStyle = 'dashed';

        addItem.appendChild(addBtn);
        macrosContainer.appendChild(addItem);

        this.bindButton(addBtn, () => this.createNewPreset());

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
            const res = await fetch(`${API}/api/faders/macros?fixtureId=${FIXTURE_ID}`);
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
                body: JSON.stringify({ id, color, fixtureId: FIXTURE_ID })
            });
        } catch (e) {
            console.error('Failed to save macro:', e);
        }
    }

    async loadPresets() {
        try {
            const res = await fetch(`${API}/api/faders/presets?fixtureId=${FIXTURE_ID}`);
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
        console.log('Attempting to create a new preset for fixture:', FIXTURE_ID);
        try {
            const res = await fetch(`${API}/api/faders/presets/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fixtureId: FIXTURE_ID, name: 'New Preset' })
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
            const values = this.channels.map(ch => ({
                channel: ch.channel,
                value: ch.currentValue,
                isOn: ch.isOn
            }));

            await fetch(`${API}/api/faders/presets`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: state.id, values })
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
            const chState = this.channels.find(c => c.channel === v.channel);
            if (chState) {
                // Restore value
                this.updateFaderValue(chState, v.value, true);

                // Restore ON state (is_on comes from DB, mapped to isOn in state)
                const isOn = v.isOn !== undefined ? v.isOn : (v.is_on === 1);
                this.toggleOnState(chState, isOn);
            }
        });
    }

    async renamePreset(state, newName) {
        try {
            await fetch(`${API}/api/faders/presets/rename`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: state.id, name: newName })
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
                body: JSON.stringify({ id: state.id })
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

    applyMacroColor(hex, shouldSave = true) {
        if (!hex || hex.length < 7) {
            console.error('Invalid Macro Color:', hex);
            return;
        }

        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);

        if (shouldSave) {
            console.log(`Macro Action: Applying & Saving ${hex} to active RGB channels`);
        } else {
            console.log(`Macro Action: Applying ${hex} (LIVE) to active RGB channels`);
        }

        let count = 0;
        this.channels.forEach(ch => {
            let chChanged = false;

            // Log what we found - only if saving
            if (shouldSave && (ch.assignments.r || ch.assignments.g || ch.assignments.b)) {
                console.log(`CH${ch.channel} has RGB assignments:`, ch.assignments);
            }

            if (ch.assignments.r) {
                this.updateFaderValue(ch, r, shouldSave);
                chChanged = true;
            }
            if (ch.assignments.g) {
                this.updateFaderValue(ch, g, shouldSave);
                chChanged = true;
            }
            if (ch.assignments.b) {
                this.updateFaderValue(ch, b, shouldSave);
                chChanged = true;
            }

            if (chChanged) count++;
        });

        if (shouldSave) {
            console.log(`Macro update complete. Updated ${count} faders.`);
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
        try {
            await fetch(`${API}/api/dmx/channel`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ channel, value })
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

                    this.channels.forEach(state => {
                        const backendValue = this.backendValues[state.channel - 1] || 0;

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

        await updateValues();
        setInterval(updateValues, 1000);
    }

    /**
     * Backend heartbeat
     */
    async startHeartbeat() {
        const checkStatus = async () => {
            try {
                const res = await fetch(`${API}/health`);
                const data = await res.json();

                document.getElementById('backend-status').classList.add('online');

                if (data.dmx) {
                    document.getElementById('dmx-status').classList.add('online');
                } else {
                    document.getElementById('dmx-status').classList.remove('online');
                }
            } catch (e) {
                document.getElementById('backend-status').classList.remove('online');
                document.getElementById('dmx-status').classList.remove('online');
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
                    fixtureId: FIXTURE_ID,
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
            const res = await fetch(`${API}/api/faders/groups`);
            const data = await res.json();

            if (data.success && data.groups) {
                Object.keys(data.groups).forEach(channelStr => {
                    const channelNum = parseInt(channelStr);
                    const state = this.channels.find(c => c.channel === channelNum);
                    if (state) {
                        data.groups[channelNum].forEach(group => {
                            state.groups[group] = true;
                            state.groupBtns[group].classList.add('active');
                        });
                        console.log(`CH${channelNum}: Loaded groups: ${data.groups[channelNum].join(',')}`);
                    }
                });
            }
        } catch (e) {
            console.error('Failed to load channel groups:', e);
        }
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
                    fixtureId: FIXTURE_ID
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
                    fixtureId: FIXTURE_ID,
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
                    fixtureId: FIXTURE_ID,
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
                    fixtureId: FIXTURE_ID,
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
