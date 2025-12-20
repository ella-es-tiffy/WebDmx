/**
 * Fader/Channel Controller
 * Manages names, assignments (R,G,B,W,P,T), and groups (A,B,C) for DMX channels
 */
import { Request, Response } from 'express';
import { Database } from '../config/database';
import { IDmxController } from '../interfaces/IDmxController';

export class FaderController {
    private dmxController?: IDmxController;

    constructor(dmxController?: IDmxController) {
        this.dmxController = dmxController;
        this.getAllFaders = this.getAllFaders.bind(this);
        this.updateFaderName = this.updateFaderName.bind(this);
        this.getChannelAssignments = this.getChannelAssignments.bind(this);
        this.saveChannelAssignment = this.saveChannelAssignment.bind(this);
        this.deleteChannelAssignment = this.deleteChannelAssignment.bind(this);
        this.getChannelGroups = this.getChannelGroups.bind(this);
        this.saveChannelGroup = this.saveChannelGroup.bind(this);
        this.saveChannelState = this.saveChannelState.bind(this);
        this.saveFaderValue = this.saveFaderValue.bind(this);
        this.saveChannelColor = this.saveChannelColor.bind(this);
        this.getMacros = this.getMacros.bind(this);
        this.updateMacro = this.updateMacro.bind(this);
        this.getPresets = this.getPresets.bind(this);
        this.savePreset = this.savePreset.bind(this);
        this.updatePresetName = this.updatePresetName.bind(this);
        this.createPreset = this.createPreset.bind(this);
        this.deletePreset = this.deletePreset.bind(this);
        this.getDmxOutput = this.getDmxOutput.bind(this);
        this.getGlobalPalettes = this.getGlobalPalettes.bind(this);
        this.saveGlobalPalette = this.saveGlobalPalette.bind(this);
        this.createGlobalPalette = this.createGlobalPalette.bind(this);
        this.deleteGlobalPalette = this.deleteGlobalPalette.bind(this);
        this.getAllAssignments = this.getAllAssignments.bind(this);
    }

    async getAllFaders(req: Request, res: Response): Promise<void> {
        try {
            const fixtureId = parseInt(req.query.fixtureId as string) || 1;
            const pool = Database.getPool();

            // Ensure table exists
            await pool.execute(`
                CREATE TABLE IF NOT EXISTS fixture_channel_names (
                    fixture_id INT,
                    dmx_channel INT,
                    name VARCHAR(255),
                    PRIMARY KEY (fixture_id, dmx_channel)
                )
            `);

            const [rows] = await pool.execute(`
                SELECT dmx_channel as channel, name
                FROM fixture_channel_names
                WHERE fixture_id = ?
            `, [fixtureId]);

            const faderMap: { [key: number]: string } = {};
            (rows as any[]).forEach(row => {
                faderMap[row.channel] = row.name;
            });

            res.json({ success: true, faders: faderMap });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async updateFaderName(req: Request, res: Response): Promise<void> {
        try {
            const { fixtureId = 1, channel, name } = req.body;

            if (!channel || channel < 1 || channel > 512) {
                res.status(400).json({ success: false, error: 'Invalid channel' });
                return;
            }

            if (!name || name.trim().length === 0) {
                res.status(400).json({ success: false, error: 'Name cannot be empty' });
                return;
            }

            const pool = Database.getPool();
            await pool.execute(`
                INSERT INTO fixture_channel_names (fixture_id, dmx_channel, name)
                VALUES (?, ?, ?)
                ON DUPLICATE KEY UPDATE name = VALUES(name)
            `, [fixtureId, channel, name.trim()]);

            res.json({ success: true, fixtureId, channel, name: name.trim() });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async getChannelAssignments(req: Request, res: Response): Promise<void> {
        try {
            const fixtureId = parseInt(req.params.fixtureId) || 1;
            const pool = Database.getPool();

            // 1. Get functional assignments
            let assignmentRows: any = await pool.execute(`
                SELECT dmx_channel, function_type
                FROM fixture_channel_assignments
                WHERE fixture_id = ?
            `, [fixtureId]);
            assignmentRows = assignmentRows[0];

            // If no assignments, check if fixture has a template
            if (assignmentRows.length === 0) {
                const [fixtureRows]: any = await pool.execute('SELECT template_id FROM devices WHERE id = ?', [fixtureId]);
                if (fixtureRows.length > 0 && fixtureRows[0].template_id) {
                    const templateId = fixtureRows[0].template_id;
                    const [templateChannels]: any = await pool.execute(
                        'SELECT channel_num, function_type FROM fixture_template_channels WHERE template_id = ?',
                        [templateId]
                    );
                    assignmentRows = templateChannels.map((tc: any) => ({
                        dmx_channel: tc.channel_num,
                        function_type: tc.function_type
                    }));
                }
            }

            // 2. Get channel states from new table
            const [stateRows] = await pool.execute(`
                SELECT dmx_channel, is_on, is_selected, fader_value, color
                FROM channel_states
                WHERE fixture_id = ?
            `, [fixtureId]);

            const assignments: { [key: number]: string[] } = {};
            (assignmentRows as any[]).forEach(row => {
                if (!assignments[row.dmx_channel]) {
                    assignments[row.dmx_channel] = [];
                }
                assignments[row.dmx_channel].push(row.function_type.toLowerCase());
            });

            const states: { [key: number]: any } = {};
            (stateRows as any[]).forEach(row => {
                states[row.dmx_channel] = {
                    is_on: row.is_on === 1 || row.is_on === true,
                    is_selected: row.is_selected === 1 || row.is_selected === true,
                    fader_value: row.fader_value,
                    color: row.color
                };
            });

            res.json({ success: true, fixtureId, assignments, states });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async saveChannelAssignment(req: Request, res: Response): Promise<void> {
        try {
            const { fixtureId = 1, channel, functionType, enabled } = req.body;

            if (!channel || !functionType) {
                res.status(400).json({ success: false, error: 'Missing required fields' });
                return;
            }

            const validTypes = ['R', 'G', 'B', 'W', 'P', 'T'];
            if (!validTypes.includes(functionType.toUpperCase())) {
                res.status(400).json({ success: false, error: 'Invalid function type' });
                return;
            }

            const pool = Database.getPool();

            if (enabled) {
                await pool.execute(`
                    INSERT INTO fixture_channel_assignments (fixture_id, dmx_channel, function_type)
                    VALUES (?, ?, ?)
                    ON DUPLICATE KEY UPDATE function_type = VALUES(function_type)
                `, [fixtureId, channel, functionType.toUpperCase()]);
            } else {
                await pool.execute(`
                    DELETE FROM fixture_channel_assignments
                    WHERE fixture_id = ? AND dmx_channel = ? AND function_type = ?
                `, [fixtureId, channel, functionType.toUpperCase()]);
            }

            res.json({ success: true, fixtureId, channel, functionType, enabled });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async deleteChannelAssignment(req: Request, res: Response): Promise<void> {
        try {
            const fixtureId = parseInt(req.params.fixtureId) || 1;
            const channel = parseInt(req.params.channel);

            const pool = Database.getPool();
            await pool.execute(`
                DELETE FROM fixture_channel_assignments
                WHERE fixture_id = ? AND dmx_channel = ?
            `, [fixtureId, channel]);

            res.json({ success: true, fixtureId, channel });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * Get all channel groups (A, B, C)
     * Returns { groups: { 1: ['a', 'c'], 5: ['b'], ... } }
     */
    async getChannelGroups(_req: Request, res: Response): Promise<void> {
        try {
            const pool = Database.getPool();
            const [rows] = await pool.execute(`
                SELECT dmx_channel, group_letter, fixture_id
                FROM channel_groups
                ORDER BY dmx_channel, group_letter
            `);

            const groups: { [key: number]: string[] } = {};
            (rows as any[]).forEach(row => {
                if (!groups[row.dmx_channel]) {
                    groups[row.dmx_channel] = [];
                }
                groups[row.dmx_channel].push(row.group_letter.toLowerCase());
            });

            res.json({ success: true, groups });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * Save channel group membership
     * Body: { channel, groupLetter, enabled, fixtureId? }
     */
    async saveChannelGroup(req: Request, res: Response): Promise<void> {
        try {
            const { channel, groupLetter, enabled, fixtureId = null } = req.body;

            if (!channel || !groupLetter) {
                res.status(400).json({ success: false, error: 'Missing required fields' });
                return;
            }

            const validGroups = ['A', 'B', 'C'];
            if (!validGroups.includes(groupLetter.toUpperCase())) {
                res.status(400).json({ success: false, error: 'Invalid group letter' });
                return;
            }

            const pool = Database.getPool();

            if (enabled) {
                await pool.execute(`
                    INSERT INTO channel_groups (group_letter, dmx_channel, fixture_id)
                    VALUES (?, ?, ?)
                    ON DUPLICATE KEY UPDATE group_letter = VALUES(group_letter)
                `, [groupLetter.toUpperCase(), channel, fixtureId]);
            } else {
                await pool.execute(`
                    DELETE FROM channel_groups
                    WHERE dmx_channel = ? AND group_letter = ?
                `, [channel, groupLetter.toUpperCase()]);
            }

            res.json({ success: true, channel, groupLetter, enabled });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * Save channel state (ON/OFF or SELECT)
     */
    async saveChannelState(req: Request, res: Response): Promise<void> {
        try {
            const { fixtureId = 1, channel, type, enabled } = req.body;

            if (!channel || !type) {
                res.status(400).json({ success: false, error: 'Missing required fields' });
                return;
            }

            const pool = Database.getPool();
            const column = type.toLowerCase() === 'on' ? 'is_on' : 'is_selected';

            await pool.execute(`
                INSERT INTO channel_states (fixture_id, dmx_channel, ${column})
                VALUES (?, ?, ?)
                ON DUPLICATE KEY UPDATE ${column} = VALUES(${column})
            `, [fixtureId, channel, enabled]);

            res.json({ success: true, fixtureId, channel, type, enabled });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * Save fader value to database
     */
    async saveFaderValue(req: Request, res: Response): Promise<void> {
        try {
            const { fixtureId = 1, channel, value } = req.body;

            if (channel === undefined || value === undefined) {
                res.status(400).json({ success: false, error: 'Missing required fields' });
                return;
            }

            const pool = Database.getPool();
            await pool.execute(`
                INSERT INTO channel_states (fixture_id, dmx_channel, fader_value)
                VALUES (?, ?, ?)
                ON DUPLICATE KEY UPDATE fader_value = VALUES(fader_value)
            `, [fixtureId, channel, value]);

            res.json({ success: true, fixtureId, channel, value });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * Save channel color to database
     */
    async saveChannelColor(req: Request, res: Response): Promise<void> {
        try {
            const { fixtureId = 1, channel, color } = req.body;

            if (channel === undefined) {
                res.status(400).json({ success: false, error: 'Missing required fields' });
                return;
            }

            const pool = Database.getPool();
            await pool.execute(`
                INSERT INTO channel_states (fixture_id, dmx_channel, color)
                VALUES (?, ?, ?)
                ON DUPLICATE KEY UPDATE color = VALUES(color)
            `, [fixtureId, channel, color]);

            res.json({ success: true, fixtureId, channel, color });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * Get all macros
     */
    async getMacros(req: Request, res: Response): Promise<void> {
        try {
            const { fixtureId = 1 } = req.query;
            const pool = Database.getPool();
            const [rows] = await pool.execute(
                'SELECT id, color FROM fader_macros WHERE fixture_id = ? ORDER BY id',
                [fixtureId]
            );
            res.json({ success: true, macros: rows });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async updateMacro(req: Request, res: Response): Promise<void> {
        try {
            const { id, color, fixtureId = 1 } = req.body;
            if (id === undefined || !color) {
                res.status(400).json({ success: false, error: 'Missing required fields' });
                return;
            }

            const pool = Database.getPool();
            await pool.execute(
                'INSERT INTO fader_macros (id, color, fixture_id) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE color = VALUES(color)',
                [id, color, fixtureId]
            );

            res.json({ success: true, id, color, fixtureId });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * Get all presets and their values
     */
    async getPresets(req: Request, res: Response): Promise<void> {
        try {
            const { fixtureId = 1 } = req.query;
            const pool = Database.getPool();

            // Migration: Add manufacturer and model to preset_macros for instancing
            try { await pool.execute('ALTER TABLE preset_macros ADD COLUMN manufacturer VARCHAR(100)'); } catch (e) { }
            try { await pool.execute('ALTER TABLE preset_macros ADD COLUMN model VARCHAR(100)'); } catch (e) { }

            // Get current fixture details
            const [fixtures]: any = await pool.execute(
                'SELECT manufacturer, model FROM devices WHERE id = ?',
                [fixtureId]
            );

            const currentMf = fixtures[0]?.manufacturer;
            const currentMd = fixtures[0]?.model;

            // Fetch presets for this specific fixture OR same manufacturer and model (instanced)
            let query = 'SELECT * FROM preset_macros WHERE fixture_id = ?';
            const params: any[] = [fixtureId];

            if (currentMf && currentMd) {
                query += ' OR (manufacturer = ? AND model = ?)';
                params.push(currentMf, currentMd);
            }

            query += ' ORDER BY id';

            const [presets]: any = await pool.execute(query, params);

            for (const preset of presets) {
                const [values] = await pool.execute(
                    'SELECT channel, value, is_on FROM preset_macro_values WHERE macro_id = ?',
                    [preset.id]
                );
                preset.values = values;
            }

            res.json({ success: true, presets });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * Create a new empty preset for a fixture
     */
    async createPreset(req: Request, res: Response): Promise<void> {
        try {
            const { fixtureId = 1, name = 'New Preset' } = req.body;
            const pool = Database.getPool();

            const [result]: any = await pool.execute(
                'INSERT INTO preset_macros (fixture_id, name) VALUES (?, ?)',
                [fixtureId, name]
            );

            res.json({ success: true, id: result.insertId, name });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * Save current fader values into a preset
     */
    async savePreset(req: Request, res: Response): Promise<void> {
        try {
            const { id, values, fixtureId } = req.body;
            if (id === undefined || !values) {
                res.status(400).json({ success: false, error: 'Missing required fields' });
                return;
            }

            const pool = Database.getPool();

            // If we have a fixtureId, update the preset's manufacturer/model for instancing
            if (fixtureId) {
                const [fixtures]: any = await pool.execute(
                    'SELECT manufacturer, model FROM devices WHERE id = ?',
                    [fixtureId]
                );
                if (fixtures[0]) {
                    await pool.execute(
                        'UPDATE preset_macros SET manufacturer = ?, model = ? WHERE id = ?',
                        [fixtures[0].manufacturer, fixtures[0].model, id]
                    );
                }
            }

            // Delete old values
            await pool.execute('DELETE FROM preset_macro_values WHERE macro_id = ?', [id]);

            // Insert new values
            for (const item of values) {
                await pool.execute(
                    'INSERT INTO preset_macro_values (macro_id, channel, value, is_on) VALUES (?, ?, ?, ?)',
                    [id, item.channel, item.value, item.isOn ? 1 : 0]
                );
            }

            res.json({ success: true, id });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * Rename a preset
     */
    async updatePresetName(req: Request, res: Response): Promise<void> {
        try {
            const { id, name } = req.body;
            if (id === undefined || !name) {
                res.status(400).json({ success: false, error: 'Missing required fields' });
                return;
            }

            const pool = Database.getPool();
            await pool.execute(
                'UPDATE preset_macros SET name = ? WHERE id = ?',
                [name, id]
            );

            res.json({ success: true, id, name });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * Delete a preset
     */
    async deletePreset(req: Request, res: Response): Promise<void> {
        try {
            const { id } = req.body;
            if (id === undefined) {
                res.status(400).json({ success: false, error: 'Missing required fields' });
                return;
            }

            const pool = Database.getPool();
            // Delete values first (optional if cascade is on, but safer)
            await pool.execute('DELETE FROM preset_macro_values WHERE macro_id = ?', [id]);
            await pool.execute('DELETE FROM preset_macros WHERE id = ?', [id]);

            res.json({ success: true, id });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * Get real-time DMX output state for the entire universe
     */
    async getDmxOutput(_req: Request, res: Response): Promise<void> {
        try {
            if (!this.dmxController) {
                res.status(503).json({ success: false, error: 'DMX Controller not ready' });
                return;
            }

            const universe = this.dmxController.getAllChannels();
            res.json({ success: true, universe });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * Get all global palettes
     */
    async getGlobalPalettes(_req: Request, res: Response): Promise<void> {
        try {
            const pool = Database.getPool();

            // Ensure tables exist
            await pool.execute(`
                CREATE TABLE IF NOT EXISTS global_palettes (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    color VARCHAR(50) DEFAULT '#ffffff'
                )
            `);
            await pool.execute(`
                CREATE TABLE IF NOT EXISTS global_palette_values (
                    palette_id INT,
                    function_type VARCHAR(10),
                    value INT,
                    PRIMARY KEY (palette_id, function_type)
                )
            `);

            const [palettes]: any = await pool.execute('SELECT * FROM global_palettes ORDER BY id');

            for (const p of palettes) {
                const [values] = await pool.execute(
                    'SELECT function_type as type, value FROM global_palette_values WHERE palette_id = ?',
                    [p.id]
                );
                p.values = values;

                // Parse fixture_ids from JSON
                if (p.fixture_ids) {
                    try {
                        p.fixture_ids = JSON.parse(p.fixture_ids);
                    } catch (e) {
                        p.fixture_ids = [];
                    }
                } else {
                    p.fixture_ids = [];
                }
            }

            res.json({ success: true, palettes });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * Create a new global palette
     */
    async createGlobalPalette(req: Request, res: Response): Promise<void> {
        try {
            const { name = 'New Palette', color = '#ffffff' } = req.body;
            const pool = Database.getPool();
            const [result]: any = await pool.execute(
                'INSERT INTO global_palettes (name, color) VALUES (?, ?)',
                [name, color]
            );
            res.json({ success: true, id: result.insertId, name, color });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * Save values to a global palette
     */
    async saveGlobalPalette(req: Request, res: Response): Promise<void> {
        try {
            const { id, values, fixtureIds } = req.body; // values = [ { type: 'R', value: 255 }, ... ], fixtureIds = [5, 7, 9]
            const pool = Database.getPool();

            // Save which fixtures this palette applies to
            if (fixtureIds && fixtureIds.length > 0) {
                await pool.execute(
                    'UPDATE global_palettes SET fixture_ids = ? WHERE id = ?',
                    [JSON.stringify(fixtureIds), id]
                );
            }

            await pool.execute('DELETE FROM global_palette_values WHERE palette_id = ?', [id]);
            for (const v of values) {
                await pool.execute(
                    'INSERT INTO global_palette_values (palette_id, function_type, value) VALUES (?, ?, ?)',
                    [id, v.type.toUpperCase(), v.value]
                );
            }
            res.json({ success: true, id });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * Delete a global palette
     */
    async deleteGlobalPalette(req: Request, res: Response): Promise<void> {
        try {
            const { id } = req.params;
            const pool = Database.getPool();
            await pool.execute('DELETE FROM global_palettes WHERE id = ?', [id]);
            await pool.execute('DELETE FROM global_palette_values WHERE palette_id = ?', [id]);
            res.json({ success: true });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * Fetch all assignments for all fixtures (for global apply)
     */
    async getAllAssignments(_req: Request, res: Response): Promise<void> {
        try {
            const pool = Database.getPool();
            const [rows]: any = await pool.execute(`
                SELECT fixture_id, dmx_channel, function_type 
                FROM fixture_channel_assignments
            `);

            const mapping: any = {};
            rows.forEach((r: any) => {
                const fId = r.fixture_id;
                if (!mapping[fId]) mapping[fId] = {};
                if (!mapping[fId][r.dmx_channel]) mapping[fId][r.dmx_channel] = [];
                mapping[fId][r.dmx_channel].push(r.function_type);
            });

            res.json({ success: true, mapping });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }
}
