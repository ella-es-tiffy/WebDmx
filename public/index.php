<?php
echo "<h1>DMX Web Tester</h1>";
echo "<p>PHP Version: " . phpversion() . "</p>";

// Test DB Connection
try {
    $pdo = new PDO('mysql:host=db;dbname=dmx', 'dmx_user', 'dmx_pass');
    echo "<p style='color: green;'>✓ Database connected successfully!</p>";
} catch (PDOException $e) {
    echo "<p style='color: red;'>✗ Database connection failed: " . $e->getMessage() . "</p>";
}

phpinfo();
