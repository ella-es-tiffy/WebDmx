<?php
$host = 'localhost';
$user = 'dmx_user';
$pass = 'dmx_pass';
$db   = 'dmx';

// Try alternative credentials if first fail (for different environments)
$conn = @new mysqli($host, $user, $pass, $db);
if ($conn->connect_error) {
    $conn = new mysqli('localhost', 'root', '', 'dmx_database');
}

if ($conn->connect_error) {
    die("Connection failed: " . $conn->connect_error);
}

echo "Running Migration...<br>";

$queries = [
    "ALTER TABLE devices ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'sonstiges'",
    "ALTER TABLE devices ADD COLUMN IF NOT EXISTS position VARCHAR(50) DEFAULT 'front'",
    "ALTER TABLE devices ADD COLUMN IF NOT EXISTS manufacturer VARCHAR(100) DEFAULT NULL",
    "ALTER TABLE devices ADD COLUMN IF NOT EXISTS model VARCHAR(100) DEFAULT NULL",
    "ALTER TABLE devices ADD COLUMN IF NOT EXISTS universe INT DEFAULT 1"
];

foreach ($queries as $q) {
    if ($conn->query($q)) {
        echo "Success: $q <br>";
    } else {
        echo "Error: " . $conn->error . " for query $q <br>";
    }
}

echo "Migration finished.";
$conn->close();
?>
