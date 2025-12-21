import { Request, Response } from 'express';
import { Database } from '../config/database';

/**
 * Scene Controller
 * Manages DMX scenes and scene folders
 */
export class SceneController {
    constructor() {
        this.getAllScenes = this.getAllScenes.bind(this);
        this.createScene = this.createScene.bind(this);
        this.updateScene = this.updateScene.bind(this);
        this.deleteScene = this.deleteScene.bind(this);
        this.getAllFolders = this.getAllFolders.bind(this);
        this.createFolder = this.createFolder.bind(this);
    }

    /**
     * Get all scenes
     */
    async getAllScenes(_req: Request, res: Response): Promise<void> {
        try {
            const pool = Database.getPool();

            // Ensure table exists
            await pool.execute(`
                CREATE TABLE IF NOT EXISTS scenes (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    folder_id INT DEFAULT NULL,
                    color VARCHAR(50) DEFAULT '#667eea',
                    channel_data JSON NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                )
            `);

            const [scenes]: any = await pool.execute('SELECT * FROM scenes ORDER BY created_at DESC');
            res.json({ success: true, scenes });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * Create a new scene
     */
    async createScene(req: Request, res: Response): Promise<void> {
        try {
            const { name, folder_id, color, channel_data } = req.body;
            const pool = Database.getPool();

            const [result]: any = await pool.execute(
                'INSERT INTO scenes (name, folder_id, color, channel_data) VALUES (?, ?, ?, ?)',
                [name, folder_id || null, color || '#667eea', JSON.stringify(channel_data)]
            );

            res.json({ success: true, id: result.insertId });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * Update a scene
     */
    async updateScene(req: Request, res: Response): Promise<void> {
        try {
            const { id } = req.params;
            const { name, folder_id, color, channel_data } = req.body;
            const pool = Database.getPool();

            const updates: string[] = [];
            const values: any[] = [];

            if (name !== undefined) {
                updates.push('name = ?');
                values.push(name);
            }
            if (folder_id !== undefined) {
                updates.push('folder_id = ?');
                values.push(folder_id);
            }
            if (color !== undefined) {
                updates.push('color = ?');
                values.push(color);
            }
            if (channel_data !== undefined) {
                updates.push('channel_data = ?');
                values.push(JSON.stringify(channel_data));
            }

            if (updates.length === 0) {
                res.status(400).json({ success: false, error: 'No fields to update' });
                return;
            }

            values.push(id);
            await pool.execute(
                `UPDATE scenes SET ${updates.join(', ')} WHERE id = ?`,
                values
            );

            res.json({ success: true });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * Delete a scene
     */
    async deleteScene(req: Request, res: Response): Promise<void> {
        try {
            const { id } = req.params;
            const pool = Database.getPool();

            await pool.execute('DELETE FROM scenes WHERE id = ?', [id]);
            res.json({ success: true });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * Get all scene folders
     */
    async getAllFolders(_req: Request, res: Response): Promise<void> {
        try {
            const pool = Database.getPool();

            // Ensure table exists
            await pool.execute(`
                CREATE TABLE IF NOT EXISTS scene_folders (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    icon VARCHAR(10) DEFAULT '📁',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            const [folders]: any = await pool.execute('SELECT * FROM scene_folders ORDER BY name');
            res.json({ success: true, folders });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * Create a new folder
     */
    async createFolder(req: Request, res: Response): Promise<void> {
        try {
            const { name, icon } = req.body;
            const pool = Database.getPool();

            const [result]: any = await pool.execute(
                'INSERT INTO scene_folders (name, icon) VALUES (?, ?)',
                [name, icon || '📁']
            );

            res.json({ success: true, id: result.insertId });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }
}
