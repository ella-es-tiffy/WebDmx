/**
 * Fader/Channel Controller
 * Manages custom names for DMX channels/faders
 */
import { Request, Response } from 'express';
import { Database } from '../config/database';

export class FaderController {
    constructor() {
        // Bind methods
        this.getAllFaders = this.getAllFaders.bind(this);
        this.updateFaderName = this.updateFaderName.bind(this);
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
}
