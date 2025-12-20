-- Channel Groups for cross-fixture grouping
-- Allows assigning channels to groups A, B, C for collective control

CREATE TABLE IF NOT EXISTS channel_groups (
    id INT AUTO_INCREMENT PRIMARY KEY,
    group_letter ENUM('A', 'B', 'C') NOT NULL COMMENT 'Group identifier',
    dmx_channel INT NOT NULL COMMENT 'DMX channel number (1-512)',
    fixture_id INT DEFAULT NULL COMMENT 'Optional fixture reference',
    label VARCHAR(100) DEFAULT NULL COMMENT 'Optional group label (e.g., "Front Wash")',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_group_channel (group_letter, dmx_channel),
    FOREIGN KEY (fixture_id) REFERENCES fixtures(id) ON DELETE SET NULL,
    INDEX idx_group_letter (group_letter),
    INDEX idx_channel (dmx_channel)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Example: Add channels to groups
INSERT INTO channel_groups (group_letter, dmx_channel, label) VALUES
('A', 1, 'Front Lights'),
('A', 2, 'Front Lights'),
('B', 8, 'Side Lights'),
('C', 1, 'All Pan Channels')
ON DUPLICATE KEY UPDATE label = VALUES(label);

-- Query: Get all channels in group A
-- SELECT dmx_channel FROM channel_groups WHERE group_letter = 'A';

-- Query: Get all groups for a specific channel
-- SELECT group_letter FROM channel_groups WHERE dmx_channel = 1;
