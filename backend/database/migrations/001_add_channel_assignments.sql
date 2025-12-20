-- Add channel assignment fields to fixtures table for fader console
ALTER TABLE fixtures 
ADD COLUMN pan_channel INT DEFAULT NULL COMMENT 'DMX channel offset for Pan (relative to start_address)',
ADD COLUMN tilt_channel INT DEFAULT NULL COMMENT 'DMX channel offset for Tilt (relative to start_address)',
ADD COLUMN red_channel INT DEFAULT NULL COMMENT 'DMX channel offset for Red',
ADD COLUMN green_channel INT DEFAULT NULL COMMENT 'DMX channel offset for Green',
ADD COLUMN blue_channel INT DEFAULT NULL COMMENT 'DMX channel offset for Blue',
ADD COLUMN white_channel INT DEFAULT NULL COMMENT 'DMX channel offset for White';

-- Example: Update fixtures with channel assignments based on fixture_type
-- For 16ch Zoom Washer: Pan=1, Tilt=3, Red=8, Green=9, Blue=10, White=11
UPDATE fixtures f
JOIN fixture_types ft ON f.fixture_type_id = ft.id
SET 
    f.pan_channel = 1,
    f.tilt_channel = 3,
    f.red_channel = 8,
    f.green_channel = 9,
    f.blue_channel = 10,
    f.white_channel = 11
WHERE ft.model = 'Zoom Wash 16ch';
