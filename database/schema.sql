-- WebDMX Database Schema
-- Version: 0.1.0

-- Devices/Fixtures Table
CREATE TABLE IF NOT EXISTS devices (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    manufacturer VARCHAR(255),
    model VARCHAR(255),
    dmx_address INT NOT NULL,
    universe INT DEFAULT 1,
    channel_count INT NOT NULL,
    device_type ENUM('dimmer', 'rgb', 'rgba', 'rgbw', 'cmy', 'moving_head', 'scanner', 'strobe', 'generic') DEFAULT 'generic',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_address (universe, dmx_address)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Device Channel Definitions
CREATE TABLE IF NOT EXISTS device_channels (
    id INT AUTO_INCREMENT PRIMARY KEY,
    device_id INT NOT NULL,
    channel_offset INT NOT NULL,
    channel_name VARCHAR(100) NOT NULL,
    channel_type ENUM('intensity', 'red', 'green', 'blue', 'white', 'amber', 'cyan', 'magenta', 'yellow', 'pan', 'tilt', 'pan_fine', 'tilt_fine', 'speed', 'strobe', 'gobo', 'color_wheel', 'prism', 'focus', 'zoom', 'shutter', 'generic') NOT NULL,
    min_value INT DEFAULT 0,
    max_value INT DEFAULT 255,
    default_value INT DEFAULT 0,
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
    UNIQUE KEY unique_device_channel (device_id, channel_offset)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Scenes Table
CREATE TABLE IF NOT EXISTS scenes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Scene Channel Values
CREATE TABLE IF NOT EXISTS scene_values (
    id INT AUTO_INCREMENT PRIMARY KEY,
    scene_id INT NOT NULL,
    device_id INT NOT NULL,
    channel_offset INT NOT NULL,
    value INT NOT NULL CHECK (value >= 0 AND value <= 255),
    FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE CASCADE,
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
    UNIQUE KEY unique_scene_channel (scene_id, device_id, channel_offset)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Cues Table
CREATE TABLE IF NOT EXISTS cues (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cue_number DECIMAL(10,2) NOT NULL,
    name VARCHAR(255) NOT NULL,
    scene_id INT,
    fade_in_time DECIMAL(10,2) DEFAULT 0.0,
    fade_out_time DECIMAL(10,2) DEFAULT 0.0,
    delay_time DECIMAL(10,2) DEFAULT 0.0,
    wait_time DECIMAL(10,2) DEFAULT 0.0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE SET NULL,
    UNIQUE KEY unique_cue_number (cue_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Cue Lists / Sequences
CREATE TABLE IF NOT EXISTS cue_lists (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Cue List Items (Timeline)
CREATE TABLE IF NOT EXISTS cue_list_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cue_list_id INT NOT NULL,
    cue_id INT NOT NULL,
    position INT NOT NULL,
    FOREIGN KEY (cue_list_id) REFERENCES cue_lists(id) ON DELETE CASCADE,
    FOREIGN KEY (cue_id) REFERENCES cues(id) ON DELETE CASCADE,
    UNIQUE KEY unique_position (cue_list_id, position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Stage Map / Fixture Positions
CREATE TABLE IF NOT EXISTS fixture_positions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    device_id INT NOT NULL,
    x_position DECIMAL(10,2) NOT NULL DEFAULT 0,
    y_position DECIMAL(10,2) NOT NULL DEFAULT 0,
    rotation DECIMAL(10,2) DEFAULT 0,
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
    UNIQUE KEY unique_device_position (device_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Insert some default test data
INSERT INTO devices (name, manufacturer, model, dmx_address, channel_count, device_type) VALUES
('Test Dimmer', 'Generic', 'Dimmer 1ch', 1, 1, 'dimmer'),
('Test RGB Par', 'Generic', 'RGB Par', 10, 3, 'rgb'),
('Test RGBW Par', 'Generic', 'RGBW Par', 20, 4, 'rgbw');

INSERT INTO device_channels (device_id, channel_offset, channel_name, channel_type) VALUES
(1, 0, 'Intensity', 'intensity'),
(2, 0, 'Red', 'red'),
(2, 1, 'Green', 'green'),
(2, 2, 'Blue', 'blue'),
(3, 0, 'Red', 'red'),
(3, 1, 'Green', 'green'),
(3, 2, 'Blue', 'blue'),
(3, 3, 'White', 'white');
