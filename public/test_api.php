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

            <!-- RGB Color Control -->
            <div class="card">
                <h2>RGB Color Picker</h2>
                <div class="form-group">
                    <label>Start Channel</label>
                    <input type="number" id="rgbStartChannel" min="1" max="510" value="10">
                </div>
                <div class="form-group">
                    <label>Color Picker</label>
                    <input type="color" id="colorPicker" value="#ff0000">
                </div>
                <div class="slider-group">
                    <label>Red</label>
                    <input type="range" id="redSlider" min="0" max="255" value="255">
                    <span class="value-display" id="redValue">255</span>
                </div>
                <div class="slider-group">
                    <label>Green</label>
                    <input type="range" id="greenSlider" min="0" max="255" value="0">
                    <span class="value-display" id="greenValue">0</span>
                </div>
                <div class="slider-group">
                    <label>Blue</label>
                    <input type="range" id="blueSlider" min="0" max="255" value="0">
                    <span class="value-display" id="blueValue">0</span>
                </div>
                <button onclick="setRGB()">Set RGB</button>
                <div class="response" id="rgbResponse"></div>
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

            <!-- Multiple Channels -->
            <div class="card">
                <h2>Multiple Channels</h2>
                <div class="form-group">
                    <label>Start Channel</label>
                    <input type="number" id="multiStartChannel" min="1" max="512" value="1">
                </div>
                <div class="form-group">
                    <label>Values (comma separated)</label>
                    <input type="text" id="multiValues" placeholder="255,128,64,0" value="255,128,64">
                </div>
                <button onclick="setMultipleChannels()">Set Multiple Channels</button>
                <div class="response" id="multiResponse"></div>
            </div>

            <!-- Preset Scenes -->
            <div class="card">
                <h2>Preset Scenes</h2>
                <button onclick="presetRed()">Preset Red (Ch 10-12)</button>
                <button onclick="presetGreen()">Preset Green (Ch 10-12)</button>
                <button onclick="presetBlue()">Preset Blue (Ch 10-12)</button>
                <button onclick="presetWhite()">Preset White (Ch 10-12)</button>
                <button onclick="presetAmber()">Preset Amber (Ch 10-12)</button>
                <div class="response" id="presetResponse"></div>
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
        const API_BASE = 'http://localhost:3000';

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

        // Preset functions
        async function presetRed() {
            const result = await apiCall('/api/dmx/channels', 'POST', {
                startChannel: 10, values: [255, 0, 0]
            });
            document.getElementById('presetResponse').textContent = JSON.stringify(result, null, 2);
        }

        async function presetGreen() {
            const result = await apiCall('/api/dmx/channels', 'POST', {
                startChannel: 10, values: [0, 255, 0]
            });
            document.getElementById('presetResponse').textContent = JSON.stringify(result, null, 2);
        }

        async function presetBlue() {
            const result = await apiCall('/api/dmx/channels', 'POST', {
                startChannel: 10, values: [0, 0, 255]
            });
            document.getElementById('presetResponse').textContent = JSON.stringify(result, null, 2);
        }

        async function presetWhite() {
            const result = await apiCall('/api/dmx/channels', 'POST', {
                startChannel: 10, values: [255, 255, 255]
            });
            document.getElementById('presetResponse').textContent = JSON.stringify(result, null, 2);
        }

        async function presetAmber() {
            const result = await apiCall('/api/dmx/channels', 'POST', {
                startChannel: 10, values: [255, 191, 0]
            });
            document.getElementById('presetResponse').textContent = JSON.stringify(result, null, 2);
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
