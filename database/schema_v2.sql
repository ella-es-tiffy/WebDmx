-- WebDMX Database Schema v2.0
-- Based on grandMA2/3 Architecture
-- Complete feature set

-- ============================================
-- 1. FIXTURES & PATCH
-- ============================================

-- Fixture Library (Available fixture types)
CREATE TABLE IF NOT EXISTS fixture_library (
    id INT AUTO_INCREMENT PRIMARY KEY,
    manufacturer VARCHAR(100) NOT NULL,
    model VARCHAR(100) NOT NULL,
    short_name VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_fixture (manufacturer, model)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Fixture Modes (Different channel configurations)
CREATE TABLE IF NOT EXISTS fixture_modes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    library_id INT NOT NULL,
    mode_name VARCHAR(100) NOT NULL,
    channel_count INT NOT NULL,
    description TEXT,
    FOREIGN KEY (library_id) REFERENCES fixture_library(id) ON DELETE CASCADE,
    UNIQUE KEY unique_mode (library_id, mode_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Fixture Attributes (Channel definitions per mode)
CREATE TABLE IF NOT EXISTS fixture_attributes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    mode_id INT NOT NULL,
    channel_offset INT NOT NULL,
    attribute_name VARCHAR(100) NOT NULL,
    attribute_type ENUM('intensity', 'red', 'green', 'blue', 'white', 'amber', 'cyan', 'magenta', 'yellow',
                        'pan', 'tilt', 'pan_fine', 'tilt_fine', 'zoom', 'focus', 'iris', 'frost', 'prism',
                        'gobo', 'gobo_rotate', 'color_wheel', 'shutter', 'strobe', 'speed', 'control', 'generic') NOT NULL,
    min_value INT DEFAULT 0,
    max_value INT DEFAULT 255,
    default_value INT DEFAULT 0,
    FOREIGN KEY (mode_id) REFERENCES fixture_modes(id) ON DELETE CASCADE,
    UNIQUE KEY unique_channel (mode_id, channel_offset)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Patched Fixtures (Actual fixtures in the rig)
CREATE TABLE IF NOT EXISTS fixtures (
    id INT AUTO_INCREMENT PRIMARY KEY,
    fixture_number INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    library_id INT NOT NULL,
    mode_id INT NOT NULL,
    universe INT DEFAULT 1,
    dmx_address INT NOT NULL,
    channel_count INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (library_id) REFERENCES fixture_library(id),
    FOREIGN KEY (mode_id) REFERENCES fixture_modes(id),
    UNIQUE KEY unique_number (fixture_number),
    UNIQUE KEY unique_address (universe, dmx_address)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================
-- 2. GROUPS
-- ============================================

CREATE TABLE IF NOT EXISTS groups (
    id INT AUTO_INCREMENT PRIMARY KEY,
    group_number INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_group_number (group_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS group_fixtures (
    id INT AUTO_INCREMENT PRIMARY KEY,
    group_id INT NOT NULL,
    fixture_id INT NOT NULL,
    selection_order INT NOT NULL,
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
    FOREIGN KEY (fixture_id) REFERENCES fixtures(id) ON DELETE CASCADE,
    UNIQUE KEY unique_group_fixture (group_id, fixture_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================
-- 3. PRESETS
-- ============================================

CREATE TABLE IF NOT EXISTS presets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    preset_number DECIMAL(10,2) NOT NULL,
    name VARCHAR(255) NOT NULL,
    preset_type ENUM('color', 'position', 'beam', 'gobo', 'focus', 'shutter', 'universal') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_preset_number (preset_type, preset_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS preset_values (
    id INT AUTO_INCREMENT PRIMARY KEY,
    preset_id INT NOT NULL,
    attribute_type VARCHAR(50) NOT NULL,
    value INT NOT NULL,
    FOREIGN KEY (preset_id) REFERENCES presets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================
-- 4. SEQUENCES (CUE LISTS)
-- ============================================

CREATE TABLE IF NOT EXISTS sequences (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sequence_number INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    default_fade_in DECIMAL(10,2) DEFAULT 0.0,
    default_fade_out DECIMAL(10,2) DEFAULT 0.0,
    default_delay DECIMAL(10,2) DEFAULT 0.0,
    tracking_enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_sequence_number (sequence_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================
-- 5. CUES
-- ============================================

CREATE TABLE IF NOT EXISTS cues (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sequence_id INT NOT NULL,
    cue_number DECIMAL(10,2) NOT NULL,
    name VARCHAR(255),
    fade_in_time DECIMAL(10,2) DEFAULT NULL,
    fade_out_time DECIMAL(10,2) DEFAULT NULL,
    delay_time DECIMAL(10,2) DEFAULT 0.0,
    wait_time DECIMAL(10,2) DEFAULT 0.0,
    follow_time DECIMAL(10,2) DEFAULT NULL,
    trigger_type ENUM('manual', 'auto', 'timecode', 'follow') DEFAULT 'manual',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (sequence_id) REFERENCES sequences(id) ON DELETE CASCADE,
    UNIQUE KEY unique_cue (sequence_id, cue_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Cue Values (Attribute values per fixture per cue)
CREATE TABLE IF NOT EXISTS cue_values (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cue_id INT NOT NULL,
    fixture_id INT NOT NULL,
    attribute_type VARCHAR(50) NOT NULL,
    value INT NOT NULL CHECK (value >= 0 AND value <= 255),
    FOREIGN KEY (cue_id) REFERENCES cues(id) ON DELETE CASCADE,
    FOREIGN KEY (fixture_id) REFERENCES fixtures(id) ON DELETE CASCADE,
    UNIQUE KEY unique_cue_fixture_attr (cue_id, fixture_id, attribute_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================
-- 6. EXECUTORS (PLAYBACK)
-- ============================================

CREATE TABLE IF NOT EXISTS executors (
    id INT AUTO_INCREMENT PRIMARY KEY,
    executor_number INT NOT NULL,
    page_number INT DEFAULT 1,
    name VARCHAR(255),
    sequence_id INT,
    executor_type ENUM('sequence', 'preset', 'group', 'macro') DEFAULT 'sequence',
    fader_mode ENUM('master', 'speed', 'rate', 'crossfade') DEFAULT 'master',
    button_mode ENUM('go', 'flash', 'black', 'goto') DEFAULT 'go',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (sequence_id) REFERENCES sequences(id) ON DELETE SET NULL,
    UNIQUE KEY unique_executor (page_number, executor_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Executor State (Runtime state)
CREATE TABLE IF NOT EXISTS executor_states (
    id INT AUTO_INCREMENT PRIMARY KEY,
    executor_id INT NOT NULL UNIQUE,
    fader_level DECIMAL(5,2) DEFAULT 0.0,
    is_active BOOLEAN DEFAULT FALSE,
    current_cue_id INT,
    playback_status ENUM('stopped', 'running', 'paused') DEFAULT 'stopped',
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (executor_id) REFERENCES executors(id) ON DELETE CASCADE,
    FOREIGN KEY (current_cue_id) REFERENCES cues(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================
-- 7. EFFECTS
-- ============================================

CREATE TABLE IF NOT EXISTS effects (
    id INT AUTO_INCREMENT PRIMARY KEY,
    effect_number INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    effect_type ENUM('dimmer', 'position', 'color', 'beam', 'universal') NOT NULL,
    form ENUM('sine', 'square', 'triangle', 'sawtooth', 'random') DEFAULT 'sine',
    speed DECIMAL(10,2) DEFAULT 1.0,
    size INT DEFAULT 100,
    phase DECIMAL(10,2) DEFAULT 0.0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_effect_number (effect_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS effect_attributes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    effect_id INT NOT NULL,
    attribute_type VARCHAR(50) NOT NULL,
    min_value INT DEFAULT 0,
    max_value INT DEFAULT 255,
    FOREIGN KEY (effect_id) REFERENCES effects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================
-- 8. PROGRAMMER STATE
-- ============================================

CREATE TABLE IF NOT EXISTS programmer_state (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(255) DEFAULT 'default',
    is_active BOOLEAN DEFAULT FALSE,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_session (session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS programmer_selection (
    id INT AUTO_INCREMENT PRIMARY KEY,
    programmer_id INT NOT NULL,
    fixture_id INT NOT NULL,
    selection_order INT NOT NULL,
    FOREIGN KEY (programmer_id) REFERENCES programmer_state(id) ON DELETE CASCADE,
    FOREIGN KEY (fixture_id) REFERENCES fixtures(id) ON DELETE CASCADE,
    UNIQUE KEY unique_programmer_fixture (programmer_id, fixture_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS programmer_values (
    id INT AUTO_INCREMENT PRIMARY KEY,
    programmer_id INT NOT NULL,
    fixture_id INT NOT NULL,
    attribute_type VARCHAR(50) NOT NULL,
    value INT NOT NULL,
    FOREIGN KEY (programmer_id) REFERENCES programmer_state(id) ON DELETE CASCADE,
    FOREIGN KEY (fixture_id) REFERENCES fixtures(id) ON DELETE CASCADE,
    UNIQUE KEY unique_programmer_attr (programmer_id, fixture_id, attribute_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================
-- 9. STAGE LAYOUT (VISUALIZER)
-- ============================================

CREATE TABLE IF NOT EXISTS stage_layout (
    id INT AUTO_INCREMENT PRIMARY KEY,
    fixture_id INT NOT NULL,
    x_position DECIMAL(10,2) DEFAULT 0,
    y_position DECIMAL(10,2) DEFAULT 0,
    z_position DECIMAL(10,2) DEFAULT 0,
    rotation DECIMAL(10,2) DEFAULT 0,
    FOREIGN KEY (fixture_id) REFERENCES fixtures(id) ON DELETE CASCADE,
    UNIQUE KEY unique_fixture_position (fixture_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================
-- 10. SHOWS & SESSIONS
-- ============================================

CREATE TABLE IF NOT EXISTS shows (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================
-- 11. TIMECODE
-- ============================================

CREATE TABLE IF NOT EXISTS timecode_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    enabled BOOLEAN DEFAULT FALSE,
    timecode_type ENUM('smpte', 'midi', 'audio', 'internal') DEFAULT 'smpte',
    sequence_id INT,
    frame_rate ENUM('24', '25', '30', '29.97') DEFAULT '25',
    FOREIGN KEY (sequence_id) REFERENCES sequences(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS timecode_triggers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sequence_id INT NOT NULL,
    cue_id INT NOT NULL,
    timecode VARCHAR(20) NOT NULL,
    FOREIGN KEY (sequence_id) REFERENCES sequences(id) ON DELETE CASCADE,
    FOREIGN KEY (cue_id) REFERENCES cues(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================
-- SAMPLE DATA - Fixture Library
-- ============================================

-- Generic RGB Par
INSERT INTO fixture_library (manufacturer, model, short_name) VALUES
('Generic', 'RGB Par', 'RGBPar'),
('Generic', 'RGBW Par', 'RGBWPar'),
('Generic', 'Dimmer 1ch', 'Dim'),
('Generic', 'Moving Head', 'MH');

-- RGB Par Mode
INSERT INTO fixture_modes (library_id, mode_name, channel_count, description) VALUES
(1, '3ch RGB', 3, 'Red, Green, Blue'),
(2, '4ch RGBW', 4, 'Red, Green, Blue, White'),
(3, '1ch', 1, 'Single dimmer channel'),
(4, '16ch Extended', 16, 'Full featured moving head');

-- RGB Par Attributes
INSERT INTO fixture_attributes (mode_id, channel_offset, attribute_name, attribute_type) VALUES
(1, 0, 'Red', 'red'),
(1, 1, 'Green', 'green'),
(1, 2, 'Blue', 'blue'),
(2, 0, 'Red', 'red'),
(2, 1, 'Green', 'green'),
(2, 2, 'Blue', 'blue'),
(2, 3, 'White', 'white'),
(3, 0, 'Intensity', 'intensity');

-- Sample Fixtures
INSERT INTO fixtures (fixture_number, name, library_id, mode_id, universe, dmx_address, channel_count) VALUES
(1, 'Par 1', 1, 1, 1, 1, 3),
(2, 'Par 2', 1, 1, 1, 4, 3),
(3, 'Par 3', 1, 1, 1, 7, 3);

-- Sample Group
INSERT INTO groups (group_number, name) VALUES (1, 'All Pars');
INSERT INTO group_fixtures (group_id, fixture_id, selection_order) VALUES
(1, 1, 1),
(1, 2, 2),
(1, 3, 3);

-- Sample Sequence
INSERT INTO sequences (sequence_number, name, default_fade_in, default_fade_out) VALUES
(1, 'Main Show', 3.0, 3.0);

-- Sample Cues
INSERT INTO cues (sequence_id, cue_number, name, fade_in_time, fade_out_time) VALUES
(1, 1.0, 'Blackout', 0.0, 0.0),
(1, 2.0, 'Full Red', 3.0, 3.0),
(1, 3.0, 'Full Blue', 3.0, 3.0);

-- Programmer State
INSERT INTO programmer_state (session_id, is_active) VALUES ('default', FALSE);
