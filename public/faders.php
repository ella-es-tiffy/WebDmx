<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DMX Fader Console</title>
    <link rel="stylesheet" href="css/faders.css?v=<?php echo time(); ?>">
</head>
<body>
    <!-- Top Bar -->
    <header class="top-bar">
        <div class="logo">
            <span class="logo-text">DMX Fader Console</span>
        </div>
        <div class="system-status">
            <div class="status-item">
                <span class="status-label">Backend</span>
                <span class="status-indicator" id="backend-status"></span>
            </div>
            <div class="status-item">
                <span class="status-label">DMX</span>
                <span class="status-indicator" id="dmx-status"></span>
            </div>
        </div>
    </header>

    <!-- Main Layout: Faders + Encoders -->
    <div class="main-layout">
        <!-- Fader Bank Container -->
        <div class="fader-bank-container">
            <div id="fader-bank" class="fader-bank">
                <!-- Faders will be dynamically generated here -->
            </div>
        </div>

        <!-- Encoders Column (right side, vertical) -->
        <div class="encoders-column">
            <div class="encoder-large" id="encoder-pan">
                <div class="encoder-wheel-large" data-encoder="pan"></div>
                <div class="encoder-label-large">PAN</div>
                <div class="encoder-value-large" id="pan-value">0°</div>
            </div>
            <div class="encoder-large" id="encoder-tilt">
                <div class="encoder-wheel-large" data-encoder="tilt"></div>
                <div class="encoder-label-large">TILT</div>
                <div class="encoder-value-large" id="tilt-value">0°</div>
            </div>
            <div class="encoder-large" id="encoder-rgbw">
                <div class="encoder-wheel-large" data-encoder="rgbw"></div>
                <div class="encoder-label-large">RGBW</div>
                <div class="encoder-value-large" id="rgbw-value">Rainbow</div>
            </div>
        </div>
    </div>

    <script src="js/faders.js?v=<?php echo time(); ?>"></script>
</body>
</html>