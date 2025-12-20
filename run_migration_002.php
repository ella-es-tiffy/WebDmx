<?php
/**
 * Run Migration: 002_fixture_channel_assignments.sql
 */

$host = 'localhost';
$port = 8889;
$dbname = 'dmx';
$username = 'dmx_user';
$password = 'dmx123';

try {
    $pdo = new PDO("mysql:host=$host;port=$port;dbname=$dbname;charset=utf8mb4", $username, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    echo "Connected to database.\n\n";
    
    // Read migration file
    $sql = file_get_contents(__DIR__ . '/backend/database/migrations/002_fixture_channel_assignments.sql');
    
    // Split by semicolon and execute each statement
    $statements = array_filter(array_map('trim', explode(';', $sql)));
    
    foreach ($statements as $statement) {
        if (empty($statement) || strpos($statement, '--') === 0) continue;
        
        echo "Executing: " . substr($statement, 0, 60) . "...\n";
        $pdo->exec($statement);
    }
    
    echo "\n✅ Migration 002 completed successfully!\n";
    echo "\nTable 'fixture_channel_assignments' created.\n";
    
    // Show table structure
    $stmt = $pdo->query("DESCRIBE fixture_channel_assignments");
    echo "\nTable structure:\n";
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        echo "  - {$row['Field']}: {$row['Type']}\n";
    }
    
} catch (PDOException $e) {
    echo "❌ Error: " . $e->getMessage() . "\n";
    exit(1);
}
