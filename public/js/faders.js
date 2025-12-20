/**
 * DMX Fader Console - Fixture Configuration System
 * Assignments (R,G,B,W,P,T) are stored in database per fixture
 * Encoders work on ALL channels with P/T assignments (ignores SELECT)
 */

const API = 'http://localhost:3000';
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

        // Load names and assignments from database
        await this.loadFaderNames();
        await this.loadChannelAssignments();

        // Start backend monitoring
        this.startBackendMonitor();
        this.startHeartbeat();
    }

    /**
     * Load channel assignments from database
     */
    async loadChannelAssignments() {
        try {
            const res = await fetch(`${API}/api/faders/assignments/${FIXTURE_ID}`);
            const data = await res.json();

            if (data.success && data.assignments) {
                // Apply assignments to channels
                // Format: { 1: ['p'], 8: ['r'], 9: ['g'], ... }
                Object.keys(data.assignments).forEach(channelStr => {
                    const channelNum = parseInt(channelStr);
                    const state = this.channels.find(c => c.channel === channelNum);
                    if (state) {
                        data.assignments[channelNum].forEach(func => {
                            state.assignments[func] = true;
                            state.assignBtns[func].classList.add('active');
                        });
                        console.log(`CH${channelNum}: Loaded assignments: ${data.assignments[channelNum].join(',')}`);
                    }
                });
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
        const sensitivity = 0.7;
        const change = Math.round(delta * sensitivity);

        if (type === 'pan' || type === 'tilt') {
            this.encoders[type].value = Math.max(0, Math.min(255, this.encoders[type].value + change));
            const degrees = Math.round((this.encoders[type].value / 255) * 540 - 270);

            document.getElementById(`${type}-value`).textContent = `${degrees}°`;

            // Apply to ALL channels with P or T assignment (ignores SELECT!)
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
     */
    applyRainbowToChannels(rgb) {
        this.channels.forEach(state => {
            if (state.assignments.r) this.sendToBackend(state.channel, Math.round(rgb.r * 255));
            if (state.assignments.g) this.sendToBackend(state.channel, Math.round(rgb.g * 255));
            if (state.assignments.b) this.sendToBackend(state.channel, Math.round(rgb.b * 255));
            if (state.assignments.w) this.sendToBackend(state.channel, 0);
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
            state.currentValue = value;
            state.valueDisplay.textContent = value;

            const percentage = (value / 255) * 100;
            state.ledFill.style.height = `${percentage}%`;

            if (state.isOn) {
                this.sendToBackend(state.channel, value);
            }
        });

        state.selectBtn.addEventListener('click', () => {
            state.isSelected = !state.isSelected;
            state.selectBtn.classList.toggle('active');
        });

        // Assignment buttons - save to database
        Object.keys(state.assignBtns).forEach(key => {
            state.assignBtns[key].addEventListener('click', () => {
                state.assignments[key] = !state.assignments[key];
                state.assignBtns[key].classList.toggle('active');

                // Save to database
                this.saveChannelAssignment(state.channel, key, state.assignments[key]);
            });
        });

        state.onBtn.addEventListener('click', () => {
            state.isOn = !state.isOn;
            if (state.isOn) {
                state.onBtn.classList.add('active');
                this.sendToBackend(state.channel, parseInt(state.fader.value));
            } else {
                state.onBtn.classList.remove('active');
                this.sendToBackend(state.channel, 0);
            }
        });
    }

    /**
     * Make label editable inline
     */
    makeLabelEditable(state) {
        const label = state.label;
        const currentText = label.textContent;

        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentText;
        input.style.cssText = `
            width: 100%;
            background: #000;
            color: var(--accent-primary);
            border: 1px solid var(--accent-active);
            padding: 4px;
            font-size: 10px;
            text-align: center;
            font-weight: 600;
            text-transform: uppercase;
        `;

        const save = async () => {
            const newName = input.value.trim() || `CH ${state.channel}`;
            label.textContent = newName;
            label.style.display = '';
            input.remove();
            await this.saveFaderName(state.channel, newName);
        };

        input.addEventListener('blur', save);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') {
                label.style.display = '';
                input.remove();
            }
        });

        label.style.display = 'none';
        label.parentElement.insertBefore(input, label);
        input.focus();
        input.select();
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
}

document.addEventListener('DOMContentLoaded', () => {
    window.faderConsole = new FaderConsole(16);
});
