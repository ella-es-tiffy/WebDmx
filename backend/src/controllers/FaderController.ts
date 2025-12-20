/**
 * Fader/Channel Controller
 * Manages custom names and channel assignments (R,G,B,W,P,T) for DMX channels/faders
 */
import { Request, Response } from 'express';
import { Database } from '../config/database';

export class FaderController {
    constructor() {
        // Bind methods
        this.getAllFaders = this.getAllFaders.bind(this);
        this.updateFaderName = this.updateFaderName.bind(this);
        this.getChannelAssignments = this.getChannelAssignments.bind(this);
        this.saveChannelAssignment = this.saveChannelAssignment.bind(this);
        this.deleteChannelAssignment = this.deleteChannelAssignment.bind(this);
    }

    /**
     * Get all fader names (from fixtures table)
     * Returns channel -> name mapping
     */
    async getAllFaders(req: Request, res: Response): Promise<void> {
        try {
            const pool = Database.getPool();
            const [rows] = await pool.execute(`
                SELECT 
                    start_address as channel,
                    name
                FROM fixtures
                WHERE active = TRUE
                ORDER BY start_address
            `);

            // Create channel -> name map
            const faderMap: { [key: number]: string } = {};
            (rows as any[]).forEach(row => {
                faderMap[row.channel] = row.name;
            });

            res.json({ success: true, faders: faderMap });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * Update fader name for a specific channel
     */
    async updateFaderName(req: Request, res: Response): Promise<void> {
        try {
            const { channel, name } = req.body;

            if (!channel || channel < 1 || channel > 512) {
                res.status(400).json({ success: false, error: 'Invalid channel' });
                return;
            }

            if (!name || name.trim().length === 0) {
                res.status(400).json({ success: false, error: 'Name cannot be empty' });
                return;
            }

            const pool = Database.getPool();

            // Check if fixture exists at this channel
            const [existing] = await pool.execute(
                'SELECT id FROM fixtures WHERE start_address = ?',
                [channel]
            );

            if ((existing as any[]).length > 0) {
                // Update existing fixture
                await pool.execute(
                    'UPDATE fixtures SET name = ? WHERE start_address = ?',
                    [name.trim(), channel]
                );
            } else {
                // Create new fixture entry (generic single channel)
                await pool.execute(`
                    INSERT INTO fixtures (name, fixture_type_id, start_address, universe, active)
                    VALUES (?, NULL, ?, 1, TRUE)
                `, [name.trim(), channel]);
            }

            res.json({ success: true, channel, name: name.trim() });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * Get channel assignments for all channels of a fixture
     * GET /api/faders/assignments/:fixtureId
     */
    async getChannelAssignments(req: Request, res: Response): Promise<void> {
        try {
            const fixtureId = parseInt(req.params.fixtureId) || 1; // Default to fixture 1

            const pool = Database.getPool();
            const [rows] = await pool.execute(`
                SELECT dmx_channel, function_type
                FROM fixture_channel_assignments
                WHERE fixture_id = ?
                ORDER BY dmx_channel
            `, [fixtureId]);

            // Group by channel: { 1: ['p'], 8: ['r'], 9: ['g'], ... }
            const assignments: { [key: number]: string[] } = {};
            (rows as any[]).forEach(row => {
                if (!assignments[row.dmx_channel]) {
                    assignments[row.dmx_channel] = [];
                }
                assignments[row.dmx_channel].push(row.function_type.toLowerCase());
            });

            res.json({ success: true, fixtureId, assignments });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * Save channel assignment 
     * POST /api/faders/assignments
     * Body: { fixtureId: number, channel: number, functionType: 'R'|'G'|'B'|'W'|'P'|'T', enabled: boolean }
     */
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
                // Add assignment
                await pool.execute(`
                    INSERT INTO fixture_channel_assignments (fixture_id, dmx_channel, function_type)
                    VALUES (?, ?, ?)
                    ON DUPLICATE KEY UPDATE function_type = VALUES(function_type)
                `, [fixtureId, channel, functionType.toUpperCase()]);
            } else {
                // Remove assignment
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

    /**
     * Delete all assignments for a channel
     * DELETE /api/faders/assignments/:fixtureId/:channel
     */
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
}
