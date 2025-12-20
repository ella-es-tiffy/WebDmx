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
        </div>
    </div>

    <div id="taskbar">
        <div class="taskbar-item" onclick="openProgrammer()"><i class="fas fa-sliders-h icon-live"></i></div>
        <div class="taskbar-item" onclick="openMap()"><i class="fas fa-project-diagram icon-map"></i></div>
        <div class="taskbar-item"><i class="fas fa-cog"></i></div>
    </div>

    <!-- Global System Status -->
    <div id="system-status-global">
        <div class="status-item">
            <span class="status-label">Backend</span>
            <span class="status-indicator" id="backend-status"></span>
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
            wm.createWindow('templates', 'Fixture Templates', {
                width: '900px',
                height: '650px',
                top: '80px',
                left: '250px',
                content: '<div id="content-templates">Loading...</div>'
            });
            if (!window.templateManager) {
                window.templateManager = new TemplateManager();
            }
            templateManager.init();
        }

        async function startDashboardStatus() {
            const checkStatus = async () => {
                try {
                    const res = await fetch(`http://${window.location.hostname}:3000/health`);
                    const data = await res.json();
                    document.getElementById('backend-status').classList.add('online');
                    if (data.dmx) document.getElementById('dmx-status').classList.add('online');
                    else document.getElementById('dmx-status').classList.remove('online');
                } catch (e) {
                    document.getElementById('backend-status').classList.remove('online');
                    document.getElementById('dmx-status').classList.remove('online');
                }
            };
            setInterval(checkStatus, 3000);
            checkStatus();
        }

        startDashboardStatus();
    </script>
</body>
</html>
