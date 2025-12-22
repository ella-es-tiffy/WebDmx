import { Request, Response } from 'express';
import { Database } from '../config/database';

export class GroupController {
    public async getAll(_req: Request, res: Response): Promise<void> {
        try {
            const pool = Database.getPool();
            const [rows]: any = await pool.execute('SELECT * FROM fixture_groups ORDER BY sort_order');

            for (const group of rows) {
                const [members]: any = await pool.execute('SELECT fixture_id FROM fixture_group_members WHERE group_id = ?', [group.id]);
                group.members = members.map((m: any) => m.fixture_id);
            }

            console.log(`[Groups] Loaded ${rows.length} groups`);
            res.json({ success: true, groups: rows });
        } catch (error: any) {
            console.error('[Groups] Error in getAll:', error.message);
            res.status(500).json({ success: false, error: error.message });
        }
    }

    public async create(req: Request, res: Response): Promise<void> {
        try {
            const { name, color_code, members } = req.body;
            console.log(`[Groups] Creating group: ${name} with ${members?.length || 0} members`);
            const pool = Database.getPool();

            const [result]: any = await pool.execute(
                'INSERT INTO fixture_groups (name, color_code) VALUES (?, ?)',
                [name || 'New Group', color_code || '#4488ff']
            );
            const groupId = result.insertId;

            if (members && Array.isArray(members)) {
                for (const fixtureId of members) {
                    await pool.execute('INSERT INTO fixture_group_members (group_id, fixture_id) VALUES (?, ?)', [groupId, fixtureId]);
                }
            }

            res.json({ success: true, id: groupId });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    public async update(req: Request, res: Response): Promise<void> {
        try {
            const { id } = req.params;
            const { name, color_code, members } = req.body;
            console.log(`[Groups] Updating group ${id}: ${name}`);
            const pool = Database.getPool();

            await pool.execute(
                'UPDATE fixture_groups SET name = ?, color_code = ? WHERE id = ?',
                [name, color_code, id]
            );

            if (members !== undefined && Array.isArray(members)) {
                await pool.execute('DELETE FROM fixture_group_members WHERE group_id = ?', [id]);
                for (const fixtureId of members) {
                    await pool.execute('INSERT INTO fixture_group_members (group_id, fixture_id) VALUES (?, ?)', [id, fixtureId]);
                }
            }

            res.json({ success: true });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    public async delete(req: Request, res: Response): Promise<void> {
        try {
            const { id } = req.params;
            console.log(`[Groups] Deleting group ${id}`);
            const pool = Database.getPool();
            await pool.execute('DELETE FROM fixture_group_members WHERE group_id = ?', [id]);
            await pool.execute('DELETE FROM fixture_groups WHERE id = ?', [id]);
            res.json({ success: true });
        } catch (error: any) {
            console.error('[Groups] Error in delete:', error.message);
            res.status(500).json({ success: false, error: error.message });
        }
    }
}
