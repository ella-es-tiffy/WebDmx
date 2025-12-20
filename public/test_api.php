<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WebDMX API Tester</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: #1a1a1a;
            color: #e0e0e0;
            padding: 20px;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
        }

        h1 {
            color: #00ff88;
            margin-bottom: 10px;
            font-size: 28px;
        }

        .status-bar {
            background: #2a2a2a;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 20px;
            display: flex;
            gap: 20px;
            align-items: center;
        }

        .status-indicator {
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .status-dot {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: #ff4444;
        }

        .status-dot.connected {
            background: #00ff88;
            box-shadow: 0 0 10px #00ff88;
        }

        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
            gap: 20px;
            margin-bottom: 20px;
        }

        .card {
            background: #2a2a2a;
            border-radius: 8px;
            padding: 20px;
        }

        .card h2 {
            color: #00aaff;
            margin-bottom: 15px;
            font-size: 18px;
            border-bottom: 2px solid #00aaff;
            padding-bottom: 8px;
        }

        .form-group {
            margin-bottom: 15px;
        }

        label {
            display: block;
            margin-bottom: 5px;
            color: #aaa;
            font-size: 14px;
        }

        input[type="number"],
        input[type="text"],
        select {
            width: 100%;
            padding: 10px;
            background: #1a1a1a;
            border: 1px solid #444;
            border-radius: 4px;
            color: #e0e0e0;
            font-size: 14px;
        }

        input[type="range"] {
            width: 100%;
            height: 8px;
            background: #1a1a1a;
            border-radius: 4px;
            outline: none;
        }

        input[type="range"]::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 20px;
            height: 20px;
            background: #00aaff;
            border-radius: 50%;
            cursor: pointer;
        }

        .value-display {
            display: inline-block;
            min-width: 40px;
            text-align: center;
            background: #1a1a1a;
            padding: 5px 10px;
            border-radius: 4px;
            margin-left: 10px;
            color: #00ff88;
            font-weight: bold;
        }

        button {
            background: #00aaff;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            font-weight: bold;
            transition: all 0.3s;
            width: 100%;
            margin-top: 10px;
        }

        button:hover {
            background: #0088cc;
            transform: translateY(-2px);
        }

        button.danger {
            background: #ff4444;
        }

        button.danger:hover {
            background: #cc0000;
        }

        .response {
            background: #1a1a1a;
            border: 1px solid #444;
            border-radius: 4px;
            padding: 12px;
            margin-top: 10px;
            font-family: 'Courier New', monospace;
            font-size: 12px;
            max-height: 200px;
            overflow-y: auto;
            white-space: pre-wrap;
        }

        .channel-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 10px;
            margin-top: 10px;
        }

        .slider-group {
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .slider-group label {
            flex: 0 0 80px;
            margin: 0;
        }

        .slider-group input[type="range"] {
            flex: 1;
        }

        input[type="color"] {
            width: 100%;
            height: 50px;
            border: 1px solid #444;
            border-radius: 4px;
            cursor: pointer;
            background: #1a1a1a;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>WebDMX API Tester</h1>

        <div class="status-bar">
            <div class="status-indicator">
                <div class="status-dot" id="statusDot"></div>
                <span id="statusText">Checking...</span>
            </div>
            <div id="timestamp"></div>
        </div>

        <div class="grid">
            <!-- Single Channel Control -->
            <div class="card">
                <h2>Single Channel</h2>
                <div class="form-group">
                    <label>Channel (1-512)</label>
                    <input type="number" id="singleChannel" min="1" max="512" value="1">
                </div>
                <div class="form-group">
                    <label>Value (0-255) <span class="value-display" id="singleValueDisplay">0</span></label>
                    <input type="range" id="singleValue" min="0" max="255" value="0">
                </div>
                <button onclick="setSingleChannel()">Set Channel</button>
                <button onclick="getChannel()">Get Channel Value</button>
                <div class="response" id="singleResponse"></div>
            </div>

            <!-- MANUAL CHANNEL TESTER 1-16 -->
            <div class="card" style="grid-column: span 2;">
                <h2>Manual Tester (Ch 1-16)</h2>
                <div class="channel-grid" id="faderContainer">
                    <!-- Faders generated by JS -->
                </div>
                <button onclick="resetFaders()" class="danger" style="margin-top: 15px;">Reset All 1-16 to 0</button>
            </div>

            <!-- Quick Actions -->
            <div class="card">
                <h2>Quick Actions</h2>
                <button onclick="setFullOn()">Full On (All 255)</button>
                <button onclick="blackout()" class="danger">Blackout (All 0)</button>
                <button onclick="getStatus()">Get DMX Status</button>
                <button onclick="getAllChannels()">Get All Channels</button>
                <div class="response" id="quickResponse"></div>
            </div>

            <!-- API Info -->
            <div class="card">
                <h2>API Information</h2>
                <div class="response">
Backend URL: http://localhost:3000

Endpoints:
GET  /health
GET  /api/dmx/status
GET  /api/dmx/channels
GET  /api/dmx/channel/:ch
POST /api/dmx/channel
POST /api/dmx/channels
POST /api/dmx/blackout
GET  /api/devices
                </div>
            </div>
        </div>
    </div>

    <script>
        const API_BASE = `http://${window.location.hostname}:3000`;

        // Update value displays
        document.getElementById('singleValue').addEventListener('input', (e) => {
            document.getElementById('singleValueDisplay').textContent = e.target.value;
        });

        document.getElementById('redSlider').addEventListener('input', (e) => {
            document.getElementById('redValue').textContent = e.target.value;
            updateColorFromSliders();
        });

        document.getElementById('greenSlider').addEventListener('input', (e) => {
            document.getElementById('greenValue').textContent = e.target.value;
            updateColorFromSliders();
        });

        document.getElementById('blueSlider').addEventListener('input', (e) => {
            document.getElementById('blueValue').textContent = e.target.value;
            updateColorFromSliders();
        });

        document.getElementById('colorPicker').addEventListener('input', (e) => {
            const hex = e.target.value;
            const r = parseInt(hex.substr(1, 2), 16);
            const g = parseInt(hex.substr(3, 2), 16);
            const b = parseInt(hex.substr(5, 2), 16);

            document.getElementById('redSlider').value = r;
            document.getElementById('greenSlider').value = g;
            document.getElementById('blueSlider').value = b;
            document.getElementById('redValue').textContent = r;
            document.getElementById('greenValue').textContent = g;
            document.getElementById('blueValue').textContent = b;
        });

        function updateColorFromSliders() {
            const r = parseInt(document.getElementById('redSlider').value);
            const g = parseInt(document.getElementById('greenSlider').value);
            const b = parseInt(document.getElementById('blueSlider').value);

            const hex = '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
            document.getElementById('colorPicker').value = hex;
        }

        async function apiCall(endpoint, method = 'GET', body = null) {
            try {
                const options = {
                    method,
                    headers: { 'Content-Type': 'application/json' }
                };

                if (body) {
                    options.body = JSON.stringify(body);
                }

                const response = await fetch(API_BASE + endpoint, options);
                const data = await response.json();
                return { success: true, data };
            } catch (error) {
                return { success: false, error: error.message };
            }
        }

        async function setSingleChannel() {
            const channel = parseInt(document.getElementById('singleChannel').value);
            const value = parseInt(document.getElementById('singleValue').value);

            const result = await apiCall('/api/dmx/channel', 'POST', { channel, value });
            document.getElementById('singleResponse').textContent = JSON.stringify(result, null, 2);
        }

        async function getChannel() {
            const channel = parseInt(document.getElementById('singleChannel').value);
            const result = await apiCall(`/api/dmx/channel/${channel}`);
            document.getElementById('singleResponse').textContent = JSON.stringify(result, null, 2);
        }

        async function setRGB() {
            const startChannel = parseInt(document.getElementById('rgbStartChannel').value);
            const r = parseInt(document.getElementById('redSlider').value);
            const g = parseInt(document.getElementById('greenSlider').value);
            const b = parseInt(document.getElementById('blueSlider').value);

            const result = await apiCall('/api/dmx/channels', 'POST', {
                startChannel,
                values: [r, g, b]
            });
            document.getElementById('rgbResponse').textContent = JSON.stringify(result, null, 2);
        }

        async function setMultipleChannels() {
            const startChannel = parseInt(document.getElementById('multiStartChannel').value);
            const valuesStr = document.getElementById('multiValues').value;
            const values = valuesStr.split(',').map(v => parseInt(v.trim()));

            const result = await apiCall('/api/dmx/channels', 'POST', { startChannel, values });
            document.getElementById('multiResponse').textContent = JSON.stringify(result, null, 2);
        }

        async function setFullOn() {
            const values = Array(512).fill(255);
            const result = await apiCall('/api/dmx/channels', 'POST', { startChannel: 1, values });
            document.getElementById('quickResponse').textContent = JSON.stringify(result, null, 2);
        }

        async function blackout() {
            const result = await apiCall('/api/dmx/blackout', 'POST');
            document.getElementById('quickResponse').textContent = JSON.stringify(result, null, 2);
        }

        async function getStatus() {
            const result = await apiCall('/api/dmx/status');
            document.getElementById('quickResponse').textContent = JSON.stringify(result, null, 2);
        }

        async function getAllChannels() {
            const result = await apiCall('/api/dmx/channels');
            // Show only first 20 channels to avoid clutter
            if (result.success && result.data.channels) {
                result.data.channels = result.data.channels.slice(0, 20);
                result.data.note = 'Showing first 20 channels only';
            }
            document.getElementById('quickResponse').textContent = JSON.stringify(result, null, 2);
        }

        // Specific Fixture Functions
        async function openDimmer() {
            // Ch 6 = Dimmer (255), Ch 7 = Strobe/Shutter (255)
            // Send as one block starting at 6: [255, 255]
            const result = await apiCall('/api/dmx/channels', 'POST', {
                startChannel: 6, values: [255, 255]
            });
            alert('Dimmer & Shutter OPENED! Jetzt Farbe wählen.');
        }

        async function closeDimmer() {
            const result = await apiCall('/api/dmx/channels', 'POST', {
                startChannel: 6, values: [0, 0]
            });
        }

        // Preset functions (Dynamic based on input)
        async function presetRed() {
            const start = parseInt(document.getElementById('rgbStartChannel').value);
            const result = await apiCall('/api/dmx/channels', 'POST', {
                startChannel: start, values: [255, 0, 0, 0] // R, G, B, W
            });
        }

        async function presetGreen() {
            const start = parseInt(document.getElementById('rgbStartChannel').value);
            const result = await apiCall('/api/dmx/channels', 'POST', {
                startChannel: start, values: [0, 255, 0, 0]
            });
        }

        async function presetBlue() {
            const start = parseInt(document.getElementById('rgbStartChannel').value);
            const result = await apiCall('/api/dmx/channels', 'POST', {
                startChannel: start, values: [0, 0, 255, 0]
            });
        }

        // Generate Faders
        const faderContainer = document.getElementById('faderContainer');
        for (let i = 1; i <= 16; i++) {
            const div = document.createElement('div');
            div.style.textAlign = 'center';
            div.innerHTML = `
                <div style="margin-bottom:5px; font-weight:bold; color:var(--accent-yellow)">CH ${i}</div>
                <input type="range" min="0" max="255" value="0" style="writing-mode: bt-lr; appearance: slider-vertical; width: 40px; height: 150px;" oninput="updateFader(${i}, this.value)">
                <div id="val-${i}" style="margin-top:5px; font-size:12px;">0</div>
            `;
            faderContainer.appendChild(div);
        }

        async function updateFader(channel, value) {
            document.getElementById(`val-${channel}`).textContent = value;
            // Send API call (debounced ideally, but raw is fine for local test)
            await apiCall('/api/dmx/channel', 'POST', { channel: parseInt(channel), value: parseInt(value) });
        }

        async function resetFaders() {
            // Reset UI
            const inputs = faderContainer.getElementsByTagName('input');
            for(let input of inputs) {
                input.value = 0;
            }
            // Reset DMX
            const values = Array(16).fill(0);
            await apiCall('/api/dmx/channels', 'POST', { startChannel: 1, values });
        }

        // Check status on load
        async function updateStatus() {
            const result = await apiCall('/health');
            if (result.success && result.data.dmx) {
                document.getElementById('statusDot').classList.add('connected');
                document.getElementById('statusText').textContent = 'DMX Connected';
            } else {
                document.getElementById('statusDot').classList.remove('connected');
                document.getElementById('statusText').textContent = 'DMX Disconnected';
            }
            document.getElementById('timestamp').textContent = new Date().toLocaleTimeString();
        }

        // Update status every 2 seconds
        updateStatus();
        setInterval(updateStatus, 2000);
    </script>
</body>
</html>
