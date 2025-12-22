<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WebDMX Dashboard</title>
    <link rel="stylesheet" href="css/dashboard.css?v=<?php echo time(); ?>">
    <link rel="stylesheet" href="css/templates.css?v=<?php echo time(); ?>">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
    <style>
        /* Embedding some specific icons styles */
        .icon-patch { color: #4488ff; }
        .icon-live { color: #00d4ff; }
        .icon-map { color: #28c840; }
        .icon-cues { color: #febc2e; }
    </style>
</head>
<body>
    <div id="desktop">
        <div class="desktop-icons">
            <div class="icon-item" onclick="openProgrammer()">
                <div class="icon-box"><i class="fas fa-sliders-h icon-live"></i></div>
                <span>Programmer</span>
            </div>
            <div class="icon-item" onclick="openPatch()">
                <div class="icon-box"><i class="fas fa-plug icon-patch"></i></div>
                <span>Fixture Patch</span>
            </div>
            <div class="icon-item" onclick="openMap()">
                <div class="icon-box"><i class="fas fa-project-diagram icon-map"></i></div>
                <span>Stage Map</span>
            </div>
            <div class="icon-item">
                <div class="icon-box"><i class="fas fa-list icon-cues"></i></div>
                <span>Cuelists</span>
            </div>
            <div class="icon-item" onclick="openTemplates()">
                <div class="icon-box"><i class="fas fa-file-alt" style="color: #9c27b0;"></i></div>
                <span>Templates</span>
            </div>
            <div class="icon-item" onclick="openScenes()">
                <div class="icon-box"><i class="fas fa-film" style="color: #00bcd4;"></i></div>
                <span>Szenen</span>
            </div>
            <div class="icon-item" onclick="openCueEditor()">
                <div class="icon-box"><i class="fas fa-play-circle" style="color: #febc2e;"></i></div>
                <span>Cue Editor</span>
            </div>
            <div class="icon-item" onclick="openMonitor()">
                <div class="icon-box"><i class="fas fa-desktop" style="color: #00f2ff;"></i></div>
                <span>DMX Monitor</span>
            </div>
            <div class="icon-item" onclick="openGroups()">
                <div class="icon-box"><i class="fas fa-layer-group" style="color: #ff5722;"></i></div>
                <span>Groups</span>
            </div>
        </div>
    </div>

    <div id="taskbar">
        <div class="taskbar-item" onclick="openProgrammer()"><i class="fas fa-sliders-h icon-live"></i></div>
        <div class="taskbar-item" onclick="openMap()"><i class="fas fa-project-diagram icon-map"></i></div>
        <div class="taskbar-item" id="debug-toggle" onclick="toggleDebugMode()" title="Toggle Debug Mode"><i class="fas fa-bug"></i></div>
        <div class="taskbar-item"><i class="fas fa-cog"></i></div>
    </div>

    <!-- Global System Status -->
    <div id="system-status-global">
        <div class="status-item">
            <span class="status-label">Backend</span>
            <span class="status-latency" id="backend-latency">-- ms</span>
            <span class="status-indicator" id="backend-status"></span>
        </div>
        <div class="status-item">
            <span class="status-label">RT-Socket</span>
            <span class="status-latency" id="socket-latency">-- ms</span>
            <span class="status-indicator" id="socket-status"></span>
        </div>
        <div class="status-item">
            <span class="status-label">DMX</span>
            <span class="status-indicator" id="dmx-status"></span>
        </div>
    </div>

    <script src="js/window_manager.js?v=<?php echo time(); ?>"></script>
    <script src="js/visualizer.js?v=<?php echo time(); ?>"></script>
    <script src="js/patch.js?v=<?php echo time(); ?>"></script>
    <script src="js/templates.js?v=<?php echo time(); ?>"></script>
    <script>
        let visualizer = null;

        function openProgrammer() {
            wm.createWindow('programmer', 'Fixture Programmer', {
                width: '1100px',
                height: '700px',
                left: '50px',
                top: '50px',
                content: '<iframe src="faders.php" style="width:100%; height:100%; border:none;"></iframe>'
            });
        }

        function openMap() {
            wm.createWindow('map', 'Stage Map (Live View)', {
                width: '900px',
                height: '600px',
                left: '400px',
                top: '150px',
                content: '<canvas id="stage-map" style="width:100%; height:100%; background:#111; cursor:crosshair;"></canvas>'
            });
            
            // Initialize visualizer on the next frame to ensure canvas is in DOM
            setTimeout(() => {
                visualizer = new DmxVisualizer('stage-map');
                startDmxSync();
            }, 100);
        }

        function startDmxSync() {
            // Poll DMX data to update visualizer
            setInterval(async () => {
                if (!visualizer) return;
                try {
                    const res = await fetch(`http://${window.location.hostname}:3000/api/dmx-output`); 
                    const data = await res.json();
                    if (data.universe) visualizer.updateDmx(data.universe);
                } catch(e) {}
            }, 100);
        }

        function openPatch() {
            wm.createWindow('patch', 'Fixture Library & Patching', {
                width: '800px',
                height: '600px',
                top: '100px',
                left: '200px',
                content: '<div id="content-patch">Loading...</div>'
            });
            patchManager.init();
        }

        function openTemplates() {
            const win = wm.createWindow('templates', 'Fixture Templates', {
                width: '900px',
                height: '650px',
                top: '80px',
                left: '250px',
                content: '<div id="content-templates" style="padding:20px; height:100%; overflow:auto; box-sizing:border-box;">Loading...</div>'
            });
            
            // Add "New Template" button to window header
            const header = win.querySelector('.window-header');
            const btn = document.createElement('button');
            btn.className = 'btn-primary';
            btn.textContent = '+ New Template';
            btn.style.cssText = 'position:absolute; right:120px; top:8px; padding:6px 12px; font-size:12px; background:#00d4ff; color:#000; border:none; border-radius:4px; cursor:pointer;';
            btn.onclick = () => window.templateManager.showTemplateModal();
            header.appendChild(btn);
            
            setTimeout(() => {
                if (!window.templateManager) {
                    window.templateManager = new TemplateManager();
                }
                templateManager.init();
            }, 100);
        }

        function openScenes() {
            wm.createWindow('scenes', 'Szenen-Manager', {
                width: '1200px',
                height: '700px',
                top: '50px',
                left: '100px',
                content: `<iframe src="scenes.html?v=${Date.now()}" style="width:100%; height:100%; border:none;"></iframe>`
            });
        }

        function openCueEditor() {
            wm.createWindow('cue-editor', 'Cue Editor', {
                width: '1400px',
                height: '800px',
                top: '30px',
                left: '50px',
                content: `<iframe src="cue_editor.html?v=${Date.now()}" style="width:100%; height:100%; border:none;"></iframe>`
            });
        }

        function openMonitor() {
            wm.createWindow('dmx-monitor', 'DMX Live Monitor', {
                width: '800px',
                height: '600px',
                top: '100px',
                left: '100px',
                content: `<iframe src="dmx_monitor.html?v=${Date.now()}" style="width:100%; height:100%; border:none;"></iframe>`
            });
        }

        function openGroups() {
            wm.createWindow('groups', 'Fixture Groups', {
                width: '700px',
                height: '500px',
                top: '200px',
                left: '300px',
                content: `<iframe src="groups.html?v=${Date.now()}" style="width:100%; height:100%; border:none;"></iframe>`
            });
        }

        async function startDashboardStatus() {
            // BACKEND Health & Latency
            const checkBackend = async () => {
                const start = performance.now();
                try {
                    const res = await fetch(`http://${window.location.hostname}:3000/health`);
                    const data = await res.json();
                    const latency = Math.round(performance.now() - start);
                    
                    const el = document.getElementById('backend-status');
                    const latEl = document.getElementById('backend-latency');
                    
                    el.classList.add('online');
                    latEl.textContent = latency + ' ms';
                    latEl.style.color = latency < 50 ? '#0f0' : (latency < 150 ? '#fa0' : '#f00');

                    const dmxEl = document.getElementById('dmx-status');
                    if (data.dmx) dmxEl.classList.add('online');
                    else dmxEl.classList.remove('online');
                } catch (e) {
                    document.getElementById('backend-status').classList.remove('online');
                    document.getElementById('dmx-status').classList.remove('online');
                    document.getElementById('backend-latency').textContent = 'OFF';
                    document.getElementById('backend-latency').style.color = '#f00';
                }
            };

            // WEBSOCKET Latency
            const startWebSocket = () => {
                const ws = new WebSocket(`ws://${window.location.hostname}:3000`);
                let pingStart = 0;

                ws.onopen = () => {
                    document.getElementById('socket-status').classList.add('online');
                    // Ping loop
                    setInterval(() => {
                        if (ws.readyState === WebSocket.OPEN) {
                            pingStart = performance.now();
                            ws.send('ping');
                        }
                    }, 1000);
                };

                ws.onmessage = (event) => {
                    if (event.data === 'pong') {
                        const latency = Math.round(performance.now() - pingStart);
                        const latEl = document.getElementById('socket-latency');
                        latEl.textContent = latency + ' ms';
                        latEl.style.color = latency < 20 ? '#0f0' : (latency < 50 ? '#fa0' : '#f00');
                    }
                };

                ws.onclose = () => {
                    document.getElementById('socket-status').classList.remove('online');
                    document.getElementById('socket-latency').textContent = 'OFF';
                    setTimeout(startWebSocket, 2000); // Reconnect
                };
            };

            setInterval(checkBackend, 2000);
            checkBackend();
            startWebSocket();
        }


        function toggleDebugMode() {
            const current = localStorage.getItem('webdmx_debug_mode') === 'true';
            const newState = !current;
            localStorage.setItem('webdmx_debug_mode', newState);
            updateDebugIcon();
            // Notify user
            // Use a simple alert or console for now, or visual cue
            console.log('Debug Mode:', newState ? 'ON' : 'OFF');
        }

        function updateDebugIcon() {
            const debugState = localStorage.getItem('webdmx_debug_mode') === 'true';
            const btn = document.querySelector('#debug-toggle i');
            if(btn) {
                btn.style.color = debugState ? '#ff4444' : '#666';
                btn.style.textShadow = debugState ? '0 0 5px rgba(255,0,0,0.5)' : 'none';
            }
        }

        startDashboardStatus();
        updateDebugIcon(); // Init state
    </script>
    
    <style>
        .status-latency {
            font-size: 10px;
            font-family: monospace;
            margin-right: 5px;
            color: #666;
            min-width: 40px;
            text-align: right;
            display: inline-block;
        }
    </style>
</body>
</html>
