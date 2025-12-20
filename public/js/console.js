/**
 * WebDMX Console - GrandMA2 Style Interface
 * Main Application Controller
 */

const API = `http://${window.location.hostname}:3000`;

class DMXConsole {
    constructor() {
        this.selectedFixtures = [];
        this.channelData = new Array(512).fill(0);

        this.init();
    }

    async init() {
        console.log('🎭 Initializing DMX Console...');

        // Initialize UI components
        this.initChannelMonitor();
        this.initExecutors();
        this.initPools();
        this.initCommandLine();
        this.initPlayback();  // NEW: Playback controls

        // Start backend connection monitoring
        this.startHeartbeat();

        // Load initial data
        await this.loadFixtures();
        await this.loadGroups();
        await this.loadPresets();
        await this.loadCues();  // NEW: Load cues
    }

    /**
     * Initialize Playback Controls
     */
    initPlayback() {
        // Transport button event listeners
        document.getElementById('btn-load').addEventListener('click', () => this.playbackLoad());
        document.getElementById('btn-play').addEventListener('click', () => this.playbackStart());
        document.getElementById('btn-stop').addEventListener('click', () => this.playbackStop());
        document.getElementById('btn-pause').addEventListener('click', () => this.playbackPause());
        document.getElementById('btn-next').addEventListener('click', () => this.playbackNext());
        document.getElementById('btn-prev').addEventListener('click', () => this.playbackPrevious());
        document.getElementById('btn-loop').addEventListener('click', () => this.playbackToggleLoop());

        // Speed slider
        const speedSlider = document.getElementById('speed-slider');
        speedSlider.addEventListener('input', (e) => {
            const speed = parseFloat(e.target.value);
            document.getElementById('speed-value').textContent = speed.toFixed(1) + 'x';
            this.playbackSetSpeed(speed);
        });

        // Start playback status monitor
        this.startPlaybackMonitor();
    }

    /**
     * Initialize DMX Channel Monitor (512 channels)
     */
    initChannelMonitor() {
        const monitor = document.getElementById('channel-monitor');

        // Create first 64 channels for performance
        for (let i = 1; i <= 64; i++) {
            const cell = document.createElement('div');
            cell.className = 'channel-cell';
            cell.dataset.channel = i;
            cell.innerHTML = `
                <div class="channel-number">${i}</div>
                <div class="channel-value">0</div>
            `;

            cell.addEventListener('click', () => this.selectChannel(i));
            monitor.appendChild(cell);
        }

        // Start channel update loop
        this.startChannelMonitor();
    }

    /**
     * Initialize Executor Faders
     */
    initExecutors() {
        const faders = document.querySelectorAll('.exec-fader');

        faders.forEach((fader, index) => {
            const executor = fader.closest('.executor');
            const execNum = executor.dataset.exec;
            const valueDisplay = executor.querySelector('.exec-value');

            fader.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                const percent = Math.round((value / 255) * 100);
                valueDisplay.textContent = `${percent}%`;

                // TODO: Trigger executor action
                console.log(`Executor ${execNum}: ${percent}%`);
            });

            // Flash button
            const flashBtn = executor.querySelector('.exec-btn:first-child');
            flashBtn.addEventListener('mousedown', () => {
                console.log(`Flash Exec ${execNum}`);
                // TODO: Implement flash
            });
        });
    }

    /**
     * Initialize Pool Windows
     */
    initPools() {
        // Add buttons for pools
        document.querySelectorAll('.pool-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const poolWindow = e.target.closest('.pool-window');
                const poolTitle = poolWindow.querySelector('.pool-title').textContent;
                console.log(`Add new ${poolTitle}`);
                // TODO: Open add dialog
            });
        });
    }

    /**
     * Initialize Command Line
     */
    initCommandLine() {
        const input = document.getElementById('command-input');
        const display = document.getElementById('command-display');

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const command = input.value.trim();
                if (command) {
                    this.executeCommand(command);
                    display.textContent = `> ${command}`;
                    input.value = '';
                }
            }
        });

        input.addEventListener('input', (e) => {
            display.textContent = `> ${e.target.value}`;
        });
    }

    /**
     * Execute Command Line Command
     */
    executeCommand(command) {
        console.log(`Execute: ${command}`);

        // Simple command parser
        const parts = command.toLowerCase().split(' ');
        const cmd = parts[0];

        switch (cmd) {
            case 'fixture':
            case 'fix':
                // Select fixture
                const fixNum = parseInt(parts[1]);
                console.log(`Select Fixture ${fixNum}`);
                break;

            case 'group':
                const groupNum = parseInt(parts[1]);
                console.log(`Select Group ${groupNum}`);
                break;

            case 'at':
                // Set value
                const value = parseInt(parts[1]);
                console.log(`Set value to ${value}`);
                break;

            case 'clear':
                // Clear selection
                this.selectedFixtures = [];
                console.log('Selection cleared');
                break;

            default:
                console.log(`Unknown command: ${cmd}`);
        }
    }

    /**
     * Select a DMX channel
     */
    selectChannel(channel) {
        console.log(`Selected channel ${channel}`);

        // Visual feedback
        document.querySelectorAll('.channel-cell').forEach(cell => {
            cell.classList.remove('active');
        });

        const cell = document.querySelector(`[data-channel="${channel}"]`);
        if (cell) {
            cell.classList.add('active');
        }
    }

    /**
     * Start DMX Channel Monitor Updates
     */
    async startChannelMonitor() {
        setInterval(async () => {
            try {
                const res = await fetch(`${API}/api/dmx/channels`);
                const data = await res.json();

                if (data.channels) {
                    this.channelData = data.channels;
                    this.updateChannelMonitor();
                }
            } catch (e) {
                // Silent fail - heartbeat will show connection status
            }
        }, 1000); // Update every second
    }

    /**
     * Update Channel Monitor Display
     */
    updateChannelMonitor() {
        document.querySelectorAll('.channel-cell').forEach(cell => {
            const channel = parseInt(cell.dataset.channel);
            const value = this.channelData[channel - 1] || 0;

            const valueEl = cell.querySelector('.channel-value');
            valueEl.textContent = value;

            // Highlight active channels
            if (value > 0) {
                cell.classList.add('active');
                cell.style.setProperty('--intensity', value / 255);
            } else {
                cell.classList.remove('active');
            }
        });
    }

    /**
     * Backend Heartbeat - Check Connection Status
     */
    async startHeartbeat() {
        const checkStatus = async () => {
            try {
                const res = await fetch(`${API}/health`);
                const data = await res.json();

                // Update backend status
                const backendStatus = document.getElementById('backend-status');
                backendStatus.classList.add('online');

                // Update DMX status
                const dmxStatus = document.getElementById('dmx-status');
                if (data.dmx) {
                    dmxStatus.classList.add('online');
                } else {
                    dmxStatus.classList.remove('online');
                }
            } catch (e) {
                // Offline
                document.getElementById('backend-status').classList.remove('online');
                document.getElementById('dmx-status').classList.remove('online');
            }
        };

        // Check immediately
        await checkStatus();

        // Then check every 3 seconds
        setInterval(checkStatus, 3000);
    }

    /**
     * Load Fixtures from Backend
     */
    async loadFixtures() {
        const pool = document.getElementById('fixtures-pool');

        // TODO: Fetch from backend API
        // For now, create dummy data
        const dummyFixtures = [
            { id: 1, name: 'MovHead 1', type: 'Moving Head' },
            { id: 2, name: 'MovHead 2', type: 'Moving Head' },
            { id: 3, name: 'PAR 1', type: 'PAR LED' },
            { id: 4, name: 'PAR 2', type: 'PAR LED' },
        ];

        dummyFixtures.forEach(fixture => {
            const item = document.createElement('div');
            item.className = 'pool-item';
            item.dataset.id = fixture.id;
            item.textContent = fixture.name;

            item.addEventListener('click', () => {
                item.classList.toggle('active');
                console.log(`Toggle Fixture ${fixture.id}`);
            });

            pool.appendChild(item);
        });
    }

    /**
     * Load Groups from Backend
     */
    async loadGroups() {
        const pool = document.getElementById('groups-pool');

        // TODO: Fetch from backend API
        const dummyGroups = [
            { id: 1, name: 'All MovHeads' },
            { id: 2, name: 'All PARs' },
            { id: 3, name: 'Stage Left' },
        ];

        dummyGroups.forEach(group => {
            const item = document.createElement('div');
            item.className = 'pool-item';
            item.dataset.id = group.id;
            item.textContent = group.name;

            item.addEventListener('click', () => {
                item.classList.toggle('active');
                console.log(`Toggle Group ${group.id}`);
            });

            pool.appendChild(item);
        });
    }

    /**
     * Load Presets from Backend
     */
    async loadPresets() {
        const pool = document.getElementById('presets-pool');

        // TODO: Fetch from backend API
        const dummyPresets = [
            { id: 1, name: 'Red', type: 'color' },
            { id: 2, name: 'Blue', type: 'color' },
            { id: 3, name: 'Center', type: 'position' },
        ];

        dummyPresets.forEach(preset => {
            const item = document.createElement('div');
            item.className = 'pool-item';
            item.dataset.id = preset.id;
            item.textContent = preset.name;

            item.addEventListener('click', () => {
                console.log(`Apply Preset ${preset.id}`);
                // TODO: Apply preset to selected fixtures
            });

            pool.appendChild(item);
        });
    }

    /**
     * Load Cues from Backend
     */
    async loadCues() {
        try {
            const res = await fetch(`${API}/api/cues`);
            const data = await res.json();

            if (data.success && data.cues) {
                this.renderCues(data.cues);
            }
        } catch (e) {
            console.error('Failed to load cues:', e);
        }
    }

    /**
     * Render cues in the cue list
     */
    renderCues(cues) {
        const cueList = document.getElementById('cue-list');
        cueList.innerHTML = '';

        cues.forEach(cue => {
            const item = document.createElement('div');
            item.className = 'cue-item';
            item.dataset.number = cue.number;
            item.innerHTML = `
                <div class="cue-number">${cue.number}</div>
                <div class="cue-name">${cue.name}</div>
                <div class="cue-timing">Fade: ${cue.fadeIn}ms</div>
            `;

            item.addEventListener('click', () => this.playbackGoTo(cue.number));
            cueList.appendChild(item);
        });
    }

    /**
     * Playback: Load CueList
     */
    async playbackLoad() {
        try {
            const res = await fetch(`${API}/api/playback/load/1`, { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                console.log('✅ CueList loaded');
            }
        } catch (e) {
            console.error('Failed to load cuelist:', e);
        }
    }

    /**
     * Playback: Start
     */
    async playbackStart() {
        try {
            const res = await fetch(`${API}/api/playback/start`, { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                console.log('▶️ Playback started');
            }
        } catch (e) {
            console.error('Playback error:', e);
        }
    }

    /**
     * Playback: Stop
     */
    async playbackStop() {
        try {
            const res = await fetch(`${API}/api/playback/stop`, { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                console.log('⏹️ Playback stopped');
            }
        } catch (e) {
            console.error('Playback error:', e);
        }
    }

    /**
     * Playback: Pause
     */
    async playbackPause() {
        try {
            await fetch(`${API}/api/playback/pause`, { method: 'POST' });
            console.log('⏸️ Paused');
        } catch (e) { }
    }

    /**
     * Playback: Next Cue
     */
    async playbackNext() {
        try {
            await fetch(`${API}/api/playback/next`, { method: 'POST' });
        } catch (e) { }
    }

    /**
     * Playback: Previous Cue
     */
    async playbackPrevious() {
        try {
            await fetch(`${API}/api/playback/previous`, { method: 'POST' });
        } catch (e) { }
    }

    /**
     * Playback: Go to specific cue
     */
    async playbackGoTo(cueNumber) {
        try {
            await fetch(`${API}/api/playback/goto/${cueNumber}`, { method: 'POST' });
        } catch (e) { }
    }

    /**
     * Playback: Toggle Loop
     */
    async playbackToggleLoop() {
        try {
            const res = await fetch(`${API}/api/playback/toggleloop`, { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                const btn = document.getElementById('btn-loop');
                if (data.loopEnabled) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            }
        } catch (e) { }
    }

    /**
     * Playback: Set Speed
     */
    async playbackSetSpeed(speed) {
        try {
            await fetch(`${API}/api/playback/speed`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ speed })
            });
        } catch (e) { }
    }

    /**
     * Monitor playback status
     */
    async startPlaybackMonitor() {
        const updateStatus = async () => {
            try {
                const res = await fetch(`${API}/api/playback/status`);
                const data = await res.json();

                if (data.success) {
                    const state = data.state;

                    // Update status badge
                    const statusBadge = document.getElementById('playback-status');
                    statusBadge.textContent = state.state.toUpperCase();
                    statusBadge.className = 'playback-status ' + state.state;

                    // Update current cue display
                    const cueDisplay = document.getElementById('current-cue-display');
                    if (state.currentCueNumber) {
                        cueDisplay.textContent = `Cue ${state.currentCueNumber}`;
                    } else {
                        cueDisplay.textContent = '-';
                    }

                    // Highlight active cue in list
                    document.querySelectorAll('.cue-item').forEach(item => {
                        const cueNum = parseFloat(item.dataset.number);
                        if (cueNum === state.currentCueNumber) {
                            item.classList.add('active');
                        } else {
                            item.classList.remove('active');
                        }
                    });

                    // Update loop button
                    const loopBtn = document.getElementById('btn-loop');
                    if (state.loopEnabled) {
                        loopBtn.classList.add('active');
                    } else {
                        loopBtn.classList.remove('active');
                    }
                }
            } catch (e) {
                // Silent fail
            }
        };

        // Initial update
        await updateStatus();

        // Then update every second
        setInterval(updateStatus, 1000);
    }
}

// Initialize console when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.dmxConsole = new DMXConsole();
});
