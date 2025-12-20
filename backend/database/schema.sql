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

-- Initial Data: 16ch RGB Washer Profile
INSERT INTO fixture_types (manufacturer, model, mode, channel_count) 
VALUES ('Generic', 'LED Wash Moving Head', '16ch', 16);

SET @type_id = LAST_INSERT_ID();

-- Mapping based on standard 16ch Chinese Washer layout (verify with user later)
INSERT INTO fixture_channels (fixture_type_id, channel_index, function_type, function_name, default_value) VALUES
(@type_id, 1, 'PAN', 'Pan', 128),
(@type_id, 2, 'TILT', 'Tilt', 128),
(@type_id, 3, 'PAN_FINE', 'Pan Fine', 0),
(@type_id, 4, 'TILT_FINE', 'Tilt Fine', 0),
(@type_id, 5, 'SPEED', 'Pan/Tilt Speed', 0),
(@type_id, 6, 'DIMMER', 'Master Dimmer', 0),
(@type_id, 7, 'STROBE', 'Strobe', 0),
(@type_id, 8, 'COLOR_R', 'Red', 0),
(@type_id, 9, 'COLOR_G', 'Green', 0),
(@type_id, 10, 'COLOR_B', 'Blue', 0),
(@type_id, 11, 'COLOR_W', 'White', 0),
(@type_id, 12, 'MACRO', 'Color Macros', 0),
(@type_id, 13, 'MACRO_SPEED', 'Macro Speed', 0),
(@type_id, 14, 'FOCUS', 'Focus/Zoom', 0), -- Assuming Focus/Zoom channel
(@type_id, 15, 'CONTROL', 'Control/Reset', 0),
(@type_id, 16, 'UNDEFINED', 'Spare', 0);
