-- Fixture Channel Assignments Schema
-- Stores which DMX channel has which function (R,G,B,W,P,T) for each fixture

CREATE TABLE IF NOT EXISTS fixture_channel_assignments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    fixture_id INT NOT NULL,
    dmx_channel INT NOT NULL COMMENT 'Absolute DMX channel number (1-512)',
    function_type ENUM('R', 'G', 'B', 'W', 'P', 'T') NOT NULL COMMENT 'Channel function: Red, Green, Blue, White, Pan, Tilt',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_fixture_channel_function (fixture_id, dmx_channel, function_type),
    FOREIGN KEY (fixture_id) REFERENCES fixtures(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Index for fast lookups
CREATE INDEX idx_fixture_assignments ON fixture_channel_assignments(fixture_id, dmx_channel);

-- Example: Configure a 16ch fixture starting at DMX channel 1
-- Assuming fixture_id = 1
INSERT INTO fixture_channel_assignments (fixture_id, dmx_channel, function_type) VALUES
-- Pan/Tilt
(1, 1, 'P'),   -- Channel 1 = Pan
(1, 3, 'T'),   -- Channel 3 = Tilt

-- RGBW
(1, 8, 'R'),   -- Channel 8 = Red
(1, 9, 'G'),   -- Channel 9 = Green
(1, 10, 'B'),  -- Channel 10 = Blue
(1, 11, 'W')   -- Channel 11 = White
ON DUPLICATE KEY UPDATE function_type = VALUES(function_type);
