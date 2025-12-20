<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WebDMX API Ultimate Tester</title>
    <style>
        :root {
            --bg-dark: #121212;
            --bg-panel: #1e1e1e;
            --accent: #00ff88;
            --accent-dim: rgba(0, 255, 136, 0.1);
        }
        body { background: var(--bg-dark); color: #fff; font-family: monospace; padding: 20px; }
        .container { max-width: 1400px; margin: 0 auto; display: grid; grid-template-columns: 350px 1fr; gap: 20px; }
        
        /* Left Panel: API Controls */
        .panel { background: var(--bg-panel); padding: 20px; border-radius: 8px; border: 1px solid #333; }
        h2 { color: var(--accent); margin-top: 0; border-bottom: 1px solid #333; padding-bottom: 10px; }
        
        .api-group { margin-bottom: 25px; }
        .api-title { font-weight: bold; margin-bottom: 10px; display: block; color: #aaa; }
        
        button {
            width: 100%; margin-bottom: 5px; padding: 10px; 
            background: #333; color: #fff; border: 1px solid #555; cursor: pointer;
            text-align: left; transition: all 0.2s;
        }
        button:hover { background: #444; border-color: var(--accent); }
        button.active { background: var(--accent-dim); border-color: var(--accent); }
        
        .method { font-weight: bold; display: inline-block; width: 40px; }
        .get { color: #61affe; }
        .post { color: #49cc90; }
        
        /* Right Panel: Monitor & Response */
        .monitor-grid {
            display: grid; grid-template-columns: repeat(auto-fill, minmax(40px, 1fr));
            gap: 2px; height: 300px; overflow-y: auto; background: #000; padding: 10px;
            border: 1px solid #333; margin-bottom: 20px;
        }
        .ch-box {
            height: 40px; background: #222; border: 1px solid #333;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            font-size: 10px; position: relative;
        }
        .ch-val { font-weight: bold; font-size: 12px; z-index: 2; }
        .ch-bar {
            position: absolute; bottom: 0; left: 0; right: 0; background: var(--accent);
            opacity: 0.5; z-index: 1; transition: height 0.1s;
        }
        
        #response-output {
            background: #000; color: #0f0; font-family: monospace; padding: 15px; 
            height: 200px; overflow-y: auto; border: 1px solid #333; white-space: pre-wrap;
        }

        .status-badge {
            display: inline-block; padding: 5px 10px; border-radius: 4px; background: #333;
            font-weight: bold; margin-bottom: 20px;
        }
        .online { background: #004400; color: #00ff00; border: 1px solid #00ff00; }
        .offline { background: #440000; color: #ff0000; border: 1px solid #ff0000; }
    </style>
</head>
<body>

    <div id="status" class="status-badge offline">Checking Backend...</div>

    <div class="container">
        <!-- API COMMANDS -->
        <div class="panel">
            <h2>API Endpoints</h2>
            
            <div class="api-group">
                <span class="api-title">System</span>
                <button onclick="callApi('GET', '/health')">
                    <span class="method get">GET</span> /health
                </button>
                <button onclick="callApi('GET', '/api/dmx/status')">
                    <span class="method get">GET</span> /dmx/status
                </button>
            </div>

            <div class="api-group">
                <span class="api-title">DMX Control</span>
                <button onclick="callApi('POST', '/api/dmx/blackout')">
                    <span class="method post">POST</span> /dmx/blackout (All Off)
                </button>
                <button onclick="sendFullOn()">
                    <span class="method post">POST</span> /dmx/channels (Full On)
                </button>
                <button onclick="sendOpenFixture()">
                    <span class="method post">POST</span> /dmx/channels (Open Fixture 1)
                </button>
            </div>

            <div class="api-group">
                <span class="api-title">RGB Tests (Fixture 1)</span>
                <button onclick="sendColor([255,0,0])">🔴 Red</button>
                <button onclick="sendColor([0,255,0])">🟢 Green</button>
                <button onclick="sendColor([0,0,255])">🔵 Blue</button>
                <button onclick="sendColor([255,255,255])">⚪ White</button>
            </div>

            <div class="api-group">
                <span class="api-title">Manual Faders (1-16)</span>
                <div id="fader-container" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px;">
                    <!-- Faders go here -->
                </div>
                <button onclick="resetFaders()" style="margin-top: 10px; background: #500; color: #fff; border: 1px solid #f00;">
                    💥 RESET ALL FADERS (BLACKOUT)
                </button>
            </div>

            <div class="api-group">
                <span class="api-title">Debug</span>
                <button onclick="callApi('GET', '/api/dmx/channels')">
                    <span class="method get">GET</span> /dmx/channels (Read)
                </button>
            </div>
        </div>

        <!-- MONITOR & LOGS -->
        <div>
            <div class="panel">
                <h2>Universe Monitor (512 Channels)</h2>
                <div id="monitor" class="monitor-grid">
                    <!-- Channels generated by JS -->
                </div>
            </div>

            <div class="panel">
                <h2>Response Log</h2>
                <div id="response-output">// Waiting for commands...</div>
            </div>
        </div>
    </div>

    <script>
        const API = 'http://localhost:3000';
        
        // Init Monitor
        const monitor = document.getElementById('monitor');
        // Create 64 channel preview (saving DOM performance, 512 is heavy for simple test)
        for(let i=1; i<=64; i++) {
            const div = document.createElement('div');
            div.className = 'ch-box';
            div.innerHTML = `<span class="ch-val" id="ch-val-${i}">0</span><div class="ch-bar" id="ch-bar-${i}" style="height:0%"></div>`;
            div.title = `Channel ${i}`;
            monitor.appendChild(div);
        }

        // Create Manual Faders with Labels
        const faderContainer = document.getElementById('fader-container');
        
        const channels = [
            { id: 1, label: 'PAN' },
            { id: 2, label: 'PAN FINE' },
            { id: 3, label: 'TILT' },
            { id: 4, label: 'TILT FINE' },
            { id: 5, label: 'PT SPEED' },
            { id: 6, label: 'DIMMER' },
            { id: 7, label: 'STROBE' },
            { id: 8, label: 'RED' },
            { id: 9, label: 'GREEN' },
            { id: 10, label: 'BLUE' },
            { id: 11, label: 'WHITE' },
            { id: 12, label: 'ZOOM' },
            { id: 13, label: 'PRESETS' },
            { id: 14, label: 'PROG SPD' },
            { id: 15, label: 'AUTO' },
            { id: 16, label: 'RESET' }
        ];

        channels.forEach(ch => {
            const div = document.createElement('div');
            div.style.textAlign = 'center';
            div.style.background = '#222';
            div.style.padding = '5px';
            div.style.border = '1px solid #444';
            
            // Color code important channels
            let color = '#aaa';
            if(ch.label.includes('RED')) color = '#ff5555';
            if(ch.label.includes('GREEN')) color = '#55ff55';
            if(ch.label.includes('BLUE')) color = '#5555ff';
            if(ch.label.includes('DIMMER')) color = '#ffffff';

            div.innerHTML = `
                <div style="font-size:10px; font-weight:bold; color:${color}; margin-bottom:5px; height:20px; overflow:hidden;">${ch.label}</div>
                <div style="font-size:9px; color:#666; margin-bottom:2px;">CH ${ch.id}</div>
                <input type="range" min="0" max="255" value="0" 
                    style="width: 100%; accent-color: var(--accent); height: 100px; -webkit-appearance: slider-vertical;"
                    oninput="updateFader(${ch.id}, this.value)"
                >
                <div id="val-${ch.id}" style="margin-top:5px; font-size:11px; font-family:monospace;">0</div>
            `;
            faderContainer.appendChild(div);
        });

        async function resetFaders() {
            // UI Reset
            const inputs = faderContainer.querySelectorAll('input');
            inputs.forEach(i => i.value = 0);
            
            // Backend Reset
            callApi('POST', '/api/dmx/blackout');
        }

        let lastUpdate = 0;
        const UPDATE_LIMIT = 50; // Max 1 request every 50ms

        async function updateFader(ch, val) {
            // Update local first for instant visual feedback
            const elVal = document.getElementById(`ch-val-${ch}`);
            const elBar = document.getElementById(`ch-bar-${ch}`);
            if(elVal) {
                elVal.textContent = val;
                elBar.style.height = (val/255*100) + '%';
            }
            
            // Throttle API calls
            const now = Date.now();
            if (now - lastUpdate < UPDATE_LIMIT) return;
            lastUpdate = now;

            // Send API (Fire and forget)
            fetch(API + '/api/dmx/channel', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ channel: parseInt(ch), value: parseInt(val) })
            }).catch(e => console.log('Dropped frame'));
        }

        async function callApi(method, endpoint, body = null) {
            log(`> ${method} ${endpoint}`);
            try {
                const opts = { method, headers: {'Content-Type': 'application/json'} };
                if(body) opts.body = JSON.stringify(body);
                
                const res = await fetch(API + endpoint, opts);
                const data = await res.json();
                
                log(`< Status: ${res.status}`);
                log(JSON.stringify(data, null, 2));

                if (endpoint.includes('channels') || endpoint.includes('blackout')) {
                    refreshMonitor(); // Update visualizer after write
                }

                return data;
            } catch(e) {
                log(`ERROR: ${e.message}`);
            }
        }

        async function sendFullOn() {
            // All channels 255
            const values = Array(512).fill(255);
            callApi('POST', '/api/dmx/channels', { startChannel: 1, values });
        }

        async function sendOpenFixture() {
            // Open Dimmer (6=255) and disable Strobe (7=0) for constant light
            callApi('POST', '/api/dmx/channels', { startChannel: 6, values: [255, 0] });
        }

        async function sendColor(rgb) {
            // RGB starts at 8
            callApi('POST', '/api/dmx/channels', { startChannel: 8, values: rgb });
        }

        function log(msg) {
            const out = document.getElementById('response-output');
            out.textContent = msg + '\n\n' + out.textContent.substring(0, 1000);
        }

        // Auto Refresh Monitor
        async function refreshMonitor() {
            try {
                const res = await fetch(API + '/api/dmx/channels');
                const data = await res.json();
                if(data.channels) {
                    data.channels.forEach((val, idx) => {
                        const ch = idx + 1;
                        if(ch > 64) return; // Only show first 64
                        const elVal = document.getElementById(`ch-val-${ch}`);
                        const elBar = document.getElementById(`ch-bar-${ch}`);
                        if(elVal) {
                            elVal.textContent = val;
                            elBar.style.height = (val/255*100) + '%';
                            
                            // Visual highlight for active channels
                            if(val > 0) elVal.parentElement.style.borderColor = '#00ff88';
                            else elVal.parentElement.style.borderColor = '#333';
                        }
                    });
                }
            } catch(e) {}
        }
        
        // Heartbeat (reduced frequency to minimize backend load)
        setInterval(async () => {
            try {
                const res = await fetch(API + '/health');
                if(res.ok) {
                    document.getElementById('status').className = 'status-badge online';
                    document.getElementById('status').textContent = 'SYSTEM ONLINE';
                    refreshMonitor();
                } else {
                    throw new Error('Not OK');
                }
            } catch(e) {
                document.getElementById('status').className = 'status-badge offline';
                document.getElementById('status').textContent = 'SYSTEM OFFLINE';
            }
        }, 5000); // 5 seconds - reduced from 3s to minimize DMX interference

    </script>
</body>
</html>
