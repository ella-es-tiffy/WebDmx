<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WebDMX - Console</title>
    <link rel="stylesheet" href="css/style.css">
</head>
<body>
    <header>
        <div style="display: flex; align-items: center;">
            <h1>WebDMX</h1>
            <span style="font-size: 0.8rem; margin-left: 10px; color: #666;">v0.1.0</span>
        </div>
        <div id="status-bar">
            <span id="backend-status"><span class="status-indicator"></span>Backend</span>
            <span id="dmx-status" style="margin-left: 15px;"><span class="status-indicator"></span>DMX Out</span>
        </div>
    </header>

    <div class="main-container">
        <aside class="sidebar">
            <button class="nav-btn active" onclick="showView('patch')">Fixture Patch</button>
            <button class="nav-btn" onclick="showView('live')">Live Control</button>
            <button class="nav-btn" onclick="showView('cues')">Cuelist</button>
            <button class="nav-btn" onclick="showView('setup')">Setup</button>
        </aside>

        <main class="content-area" id="main-content">
            <!-- Content will be loaded dynamically here -->
            <div id="loading" style="color: #666; text-align: center; margin-top: 50px;">
                Connecting to System...
            </div>
        </main>
    </div>

    <!-- Templates for Views -->
    <template id="view-patch">
        <div class="panel">
            <div class="panel-header">Fixture Schedule</div>
            <div style="margin-bottom: 15px;">
                <button class="btn btn-primary" onclick="openAddFixtureModal()">+ Add Fixture</button>
                <button class="btn" style="margin-left: 10px;">Auto-Patch</button>
            </div>
            
            <table id="patch-table">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Name</th>
                        <th>Type</th>
                        <th>Mode</th>
                        <th>Address</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody id="fixture-list">
                    <!-- Fixtures will be populated here -->
                </tbody>
            </table>
        </div>
    </template>

    <script src="js/app.js"></script>
</body>
</html>
