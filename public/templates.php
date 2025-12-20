<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Fixture Templates - WebDMX</title>
    <link rel="stylesheet" href="css/dashboard.css">
    <link rel="stylesheet" href="css/templates.css">
</head>
<body>
    <div class="app-container">
        <?php include 'components/sidebar.php'; ?>
        
        <div class="main-content">
            <div class="top-bar">
                <h1>📋 Fixture Templates</h1>
                <div class="top-bar-actions">
                    <button class="btn-primary" onclick="templateManager.showTemplateModal()">+ New Template</button>
                </div>
            </div>

            <div id="content-templates" class="content-area">
                <!-- Templates will be rendered here -->
            </div>
        </div>
    </div>

    <script src="js/templates.js"></script>
    <script>
        document.addEventListener('DOMContentLoaded', () => {
            window.templateManager = new TemplateManager();
            templateManager.init();
        });
    </script>
</body>
</html>
