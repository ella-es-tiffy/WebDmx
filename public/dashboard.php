<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WebDMX Dashboard</title>
    <link rel="stylesheet" href="css/dashboard.css?v=<?php echo time(); ?>">
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
        </div>
    </div>

    <div id="taskbar">
        <div class="taskbar-item" onclick="openProgrammer()"><i class="fas fa-sliders-h icon-live"></i></div>
        <div class="taskbar-item" onclick="openMap()"><i class="fas fa-project-diagram icon-map"></i></div>
        <div class="taskbar-item"><i class="fas fa-cog"></i></div>
    </div>

    <script src="js/window_manager.js?v=<?php echo time(); ?>"></script>
    <script src="js/visualizer.js?v=<?php echo time(); ?>"></script>
    <script>
        let visualizer = null;

        function openProgrammer() {
            wm.createWindow('programmer', 'Fixture Programmer', {
                width: '1080px',
                height: '750px',
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
                width: '600px',
                height: '500px',
                top: '200px',
                content: '<div style="padding:30px; line-height:1.6;">' +
                         '<h3>Fixture Universe 1</h3>' +
                         '<div style="background:rgba(255,255,255,0.05); padding:15px; border-radius:10px; border:1px solid rgba(255,255,255,0.1);">' +
                         '<b>[001]</b> Varytec Hero Wash 340 (16ch)<br>' +
                         '<b>[017]</b> Varytec Hero Wash 340 (16ch)<br>' +
                         '<b>[033]</b> Stairville LED Par 56 (7ch)' +
                         '</div>' +
                         '<button style="margin-top:20px; padding:10px 20px; background:#4488ff; border:none; border-radius:5px; color:white; cursor:pointer;">+ Add New Fixture</button>' +
                         '</div>'
            });
        }
    </script>
</body>
</html>
