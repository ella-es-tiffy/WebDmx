/**
 * DMX Fader Console - Professional Mixing Desk
 * Features: Channel assignment (R,G,B,P,T,W), Drag-rotatable encoders, Mute/Unmute
 */

const API = 'http://localhost:3000';

class FaderConsole {
    constructor(channelCount = 16) {
        this.channelCount = channelCount;
        this.channels = [];
        this.backendValues = new Array(512).fill(0);

        // Encoder states
        this.encoders = {
            pan: { value: 0, rotation: 0 },
            tilt: { value: 0, rotation: 0 },
            rgbw: { hue: 0, rotation: 0 }
        };

        this.init();
    }

    async init() {
        console.log('🎚️ Initializing Fader Console...');

        // Create faders
        this.createFaders();

        // Initialize encoders
        this.initEncoders();

        // Load names from backend
        await this.loadFaderNames();

        // Start backend monitoring
        this.startBackendMonitor();
        this.startHeartbeat();
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

                // Handle wrap-around
                if (delta > 180) delta -= 360;
                if (delta < -180) delta += 360;

                currentRotation += delta;
                startAngle = currentAngle;

                // Apply rotation
                wheel.style.transform = `rotate(${currentRotation}deg)`;
                this.encoders[type].rotation = currentRotation;

                // Update value based on rotation
                this.handleEncoderChange(type, delta);
            };

            const end = () => {
                isDragging = false;
                wheel.style.cursor = 'grab';
            };

            // Mouse events
            wheel.addEventListener('mousedown', start);
            document.addEventListener('mousemove', move);
            document.addEventListener('mouseup', end);

            // Touch events
            wheel.addEventListener('touchstart', start);
            document.addEventListener('touchmove', move, { passive: false });
            document.addEventListener('touchend', end);
        });
    }

    /**
     * Handle encoder value changes
     */
    handleEncoderChange(type, delta) {
        const sensitivity = 0.7; // Adjust rotation sensitivity
        const change = Math.round(delta * sensitivity);

        if (type === 'pan' || type === 'tilt') {
            // Pan/Tilt: 0-255
            this.encoders[type].value = Math.max(0, Math.min(255, this.encoders[type].value + change));
            const degrees = Math.round((this.encoders[type].value / 255) * 540 - 270); // -270° to +270°

            document.getElementById(`${type}-value`).textContent = `${degrees}°`;

            // Apply to selected channels with appropriate assignment
            this.applyEncoderToChannels(type, this.encoders[type].value);

        } else if (type === 'rgbw') {
            // RGBW: Rainbow color wheel (0-360°)
            this.encoders.rgbw.hue = (this.encoders.rgbw.hue + change) % 360;
            if (this.encoders.rgbw.hue < 0) this.encoders.rgbw.hue += 360;

            // Convert HSV to RGB
            const rgb = this.hsvToRgb(this.encoders.rgbw.hue, 1, 1);
            document.getElementById('rgbw-value').textContent = `${this.encoders.rgbw.hue}°`;

            // Apply rainbow to selected channels
            this.applyRainbowToChannels(rgb);
        }
    }

    /**
     * Apply encoder value to selected channels with correct assignment
     */
    applyEncoderToChannels(type, value) {
        const assignKey = type === 'pan' ? 'p' : 't';

        this.channels.forEach(state => {
            if (!state.isSelected) return;
            if (!state.assignments[assignKey]) return;

            // Send value to the assigned channel
            const targetChannel = state.channel; // Or offset based on assignment
            this.sendToBackend(targetChannel, value);
        });
    }

    /**
     * Apply rainbow color to selected channels (R,G,B,W assignments)
     */
    applyRainbowToChannels(rgb) {
        this.channels.forEach(state => {
            if (!state.isSelected) return;

            // Apply RGB values to assigned channels
            if (state.assignments.r) this.sendToBackend(state.channel, Math.round(rgb.r * 255));
            if (state.assignments.g) this.sendToBackend(state.channel, Math.round(rgb.g * 255));
            if (state.assignments.b) this.sendToBackend(state.channel, Math.round(rgb.b * 255));
            if (state.assignments.w) this.sendToBackend(state.channel, 0); // White off for pure RGB
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
                        console.log(`CH${channelNum}: Loaded name "${data.faders[channel]}"`);
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
            console.log(`CH${channel}: Saved name "${name}"`);
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
     * Create a single fader channel with R,G,B,P,T,W assignment buttons
     */
    createFaderChannel(channelNum) {
        // Channel container
        const channelEl = document.createElement('div');
        channelEl.className = 'fader-channel';
        channelEl.dataset.channel = channelNum;

        // Channel label
        const label = document.createElement('div');
        label.className = 'channel-label';
        label.textContent = `CH ${channelNum}`;

        // Control buttons container
        const controls = document.createElement('div');
        controls.className = 'fader-controls';

        // SELECT button
        const selectBtn = document.createElement('button');
        selectBtn.className = 'btn-select';
        selectBtn.textContent = 'SELECT';

        // Channel Assignment Grid (2x3: RGB / PTW)
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

        // ON button
        const onBtn = document.createElement('button');
        onBtn.className = 'btn-on';
        onBtn.textContent = 'ON';

        controls.appendChild(selectBtn);
        controls.appendChild(assignmentGrid);
        controls.appendChild(onBtn);

        // Fader + LED container
        const faderLedContainer = document.createElement('div');
        faderLedContainer.className = 'fader-led-container';

        // LED Strip
        const ledStrip = document.createElement('div');
        ledStrip.className = 'led-strip';

        const ledFill = document.createElement('div');
        ledFill.className = 'led-fill';
        ledStrip.appendChild(ledFill);

        // Fader container
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

        // Value display
        const valueDisplay = document.createElement('div');
        valueDisplay.className = 'value-display';
        valueDisplay.textContent = '0';

        // Assemble channel
        channelEl.appendChild(label);
        channelEl.appendChild(controls);
        channelEl.appendChild(faderLedContainer);
        channelEl.appendChild(valueDisplay);

        // Channel state
        const state = {
            channel: channelNum,
            element: channelEl,
            label: label,
            fader: fader,
            ledFill: ledFill,
            valueDisplay: valueDisplay,
            selectBtn: selectBtn,
            assignBtns: assignBtns,
            onBtn: onBtn,
            currentValue: 0,
            isOn: true,
            isSelected: false,
            assignments: { r: false, g: false, b: false, p: false, t: false, w: false },
            hasLoadedOnce: false
        };

        // Set ON button active by default
        onBtn.classList.add('active');

        // Inline name editing
        label.addEventListener('dblclick', () => {
            this.makeLabelEditable(state);
        });

        // Event listeners
        this.attachFaderEvents(state);

        return state;
    }

    /**
     * Attach event listeners to fader controls
     */
    attachFaderEvents(state) {
        // Fader manual control
        state.fader.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            state.currentValue = value;
            state.valueDisplay.textContent = value;

            if (state.isOn) {
                this.updateChannelValue(state, value, true);
            }
        });

        // SELECT button
        state.selectBtn.addEventListener('click', () => {
            state.isSelected = !state.isSelected;
            if (state.isSelected) {
                state.selectBtn.classList.add('active');
            } else {
                state.selectBtn.classList.remove('active');
            }
        });

        // Channel assignment buttons (R,G,B,P,T,W)
        Object.keys(state.assignBtns).forEach(key => {
            state.assignBtns[key].addEventListener('click', () => {
                state.assignments[key] = !state.assignments[key];
                if (state.assignments[key]) {
                    state.assignBtns[key].classList.add('active');
                } else {
                    state.assignBtns[key].classList.remove('active');
                }
            });
        });

        // ON button (mute/unmute)
        state.onBtn.addEventListener('click', () => {
            state.isOn = !state.isOn;
            if (state.isOn) {
                state.onBtn.classList.add('active');
                const faderValue = parseInt(state.fader.value);
                this.updateChannelValue(state, faderValue, true);
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
     * Update channel value
     */
    async updateChannelValue(state, value, sendToBackend = true) {
        state.currentValue = value;
        state.valueDisplay.textContent = value;

        const percentage = (value / 255) * 100;
        state.ledFill.style.height = `${percentage}%`;

        if (value > 0) {
            state.element.classList.add('active');
        } else {
            state.element.classList.remove('active');
        }

        if (sendToBackend && state.isOn) {
            await this.sendToBackend(state.channel, value);
        } else if (sendToBackend && !state.isOn) {
            await this.sendToBackend(state.channel, 0);
        }
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
                            console.log(`CH${state.channel}: Loaded value ${backendValue}`);
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

// Initialize fader console when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.faderConsole = new FaderConsole(16);
});
