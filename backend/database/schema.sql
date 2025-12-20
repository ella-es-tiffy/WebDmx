-- Database Schema for WebDMX (GrandMA Style Architecture)

CREATE TABLE IF NOT EXISTS fixture_types (
    id INT AUTO_INCREMENT PRIMARY KEY,
    manufacturer VARCHAR(255) NOT NULL,
    model VARCHAR(255) NOT NULL,
    mode VARCHAR(100) DEFAULT 'Standard', -- e.g. "16ch Mode"
    channel_count INT NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS fixture_channels (
    id INT AUTO_INCREMENT PRIMARY KEY,
    fixture_type_id INT,
    channel_index INT NOT NULL, -- 1-based index (e.g., 1 for Ch1)
    function_type VARCHAR(50) NOT NULL, -- Standardized types: DIMMER, PAN, TILT, COLOR_R, COLOR_G, COLOR_B, ZOOM, STROBE
    function_name VARCHAR(100) NOT NULL, -- Display name: "Red", "Master Dimmer"
    default_value INT DEFAULT 0,
    highlight_value INT DEFAULT 255, -- Value to use when "Highlight" is active
    FOREIGN KEY (fixture_type_id) REFERENCES fixture_types(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS fixtures (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL, -- User label: "Wash Left 1"
    fixture_type_id INT,
    universe INT DEFAULT 1,
    start_address INT NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (fixture_type_id) REFERENCES fixture_types(id)
);

-- Insert 16ch Zoom Washer Profile
INSERT INTO fixture_types (model, manufacturer, channel_count, description) VALUES 
('Zoom Wash 16ch', 'Generic China', 16, 'RGBW Zoom Moving Head');

SET @type_id = LAST_INSERT_ID();

INSERT INTO fixture_channels (fixture_type_id, channel_index, function_name, function_type, default_value) VALUES 
(@type_id, 1, 'Pan', 'PAN', 127),
(@type_id, 2, 'Pan Fine', 'PAN_FINE', 0),
(@type_id, 3, 'Tilt', 'TILT', 127),
(@type_id, 4, 'Tilt Fine', 'TILT_FINE', 0),
(@type_id, 5, 'PT Speed', 'SPEED', 0),
(@type_id, 6, 'Dimmer', 'DIMMER', 0),
(@type_id, 7, 'Strobe', 'STROBE', 0), -- 0=Open/Off usually, check manual!
(@type_id, 8, 'Red', 'COLOR_R', 0),
(@type_id, 9, 'Green', 'COLOR_G', 0),
(@type_id, 10, 'Blue', 'COLOR_B', 0),
(@type_id, 11, 'White', 'COLOR_W', 0),
(@type_id, 12, 'Zoom', 'ZOOM', 0),
(@type_id, 13, 'Presets/Prog', 'MACRO', 0), -- 0-9 Off, 10-127 Color, 128+ Progs
(@type_id, 14, 'Prog Speed', 'MACRO_SPEED', 0),
(@type_id, 15, 'Auto/Sound', 'CONTROL', 0), -- 0-9 Off, 10-180 Auto, 181-255 Sound
(@type_id, 16, 'Reset', 'CONTROL', 0); -- 253-255 Reset

-- Reset existing patch
DELETE FROM fixtures;
-- Patch 4 Fixtures (Addr 1, 17, 33, 49)
INSERT INTO fixtures (name, fixture_type_id, start_address, universe) VALUES 
('Washer 1', @type_id, 1, 1),
('Washer 2', @type_id, 17, 1),
('Washer 3', @type_id, 33, 1),
('Washer 4', @type_id, 49, 1);
