import { Request, Response } from 'express';
import { Database } from '../config/database';

export class TemplateController {
    constructor() {
        this.getAll = this.getAll.bind(this);
        this.getById = this.getById.bind(this);
        this.create = this.create.bind(this);
        this.update = this.update.bind(this);
        this.delete = this.delete.bind(this);
    }

    private async ensureTables() {
        const pool = Database.getPool();
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS fixture_templates (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                manufacturer VARCHAR(100),
                model VARCHAR(100),
                channel_count INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS fixture_template_channels (
                template_id INT,
                channel_num INT,
                function_type VARCHAR(20),
                label VARCHAR(50),
                \`group\` VARCHAR(20),
                PRIMARY KEY (template_id, channel_num)
            )
        `);
        // Add group column if it doesn't exist (migration)
        try {
            await pool.execute('ALTER TABLE fixture_template_channels ADD COLUMN `group` VARCHAR(20)');
        } catch (e) { /* Column already exists */ }

        // Add template_id to devices if not exists
        try {
            await pool.execute('ALTER TABLE devices ADD COLUMN template_id INT');
        } catch (e) { }
    }

    async getAll(_req: Request, res: Response): Promise<void> {
        try {
            await this.ensureTables();
            const pool = Database.getPool();
            const [rows]: any = await pool.execute('SELECT * FROM fixture_templates ORDER BY name');

            for (const row of rows) {
                const [channels]: any = await pool.execute(
                    'SELECT channel_num, function_type, label, `group` FROM fixture_template_channels WHERE template_id = ? ORDER BY channel_num',
                    [row.id]
                );
                row.channels = channels;
            }

            res.json({ success: true, templates: rows });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async getById(req: Request, res: Response): Promise<void> {
        try {
            const { id } = req.params;
            const pool = Database.getPool();
            const [rows]: any = await pool.execute('SELECT * FROM fixture_templates WHERE id = ?', [id]);
            if (rows.length === 0) {
                res.status(404).json({ success: false, error: 'Template not found' });
                return;
            }
            const template = rows[0];
            const [channels]: any = await pool.execute(
                'SELECT channel_num, function_type, label, `group` FROM fixture_template_channels WHERE template_id = ? ORDER BY channel_num',
                [id]
            );
            template.channels = channels;
            res.json({ success: true, template });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async create(req: Request, res: Response): Promise<void> {
        try {
            const { name, manufacturer, model, channel_count, channels } = req.body;
            const pool = Database.getPool();

            const [result]: any = await pool.execute(
                'INSERT INTO fixture_templates (name, manufacturer, model, channel_count) VALUES (?, ?, ?, ?)',
                [name, manufacturer, model, channel_count]
            );
            const templateId = result.insertId;

            if (channels && Array.isArray(channels)) {
                for (const ch of channels) {
                    await pool.execute(
                        'INSERT INTO fixture_template_channels (template_id, channel_num, function_type, label, `group`) VALUES (?, ?, ?, ?, ?)',
                        [templateId, ch.channel_num, ch.function_type, ch.label, ch.group || null]
                    );
                }
            }

            res.json({ success: true, id: templateId });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async update(req: Request, res: Response): Promise<void> {
        try {
            const { id } = req.params;
            const { name, manufacturer, model, channel_count, channels } = req.body;
            const pool = Database.getPool();

            await pool.execute(
                'UPDATE fixture_templates SET name = ?, manufacturer = ?, model = ?, channel_count = ? WHERE id = ?',
                [name, manufacturer, model, channel_count, id]
            );

            await pool.execute('DELETE FROM fixture_template_channels WHERE template_id = ?', [id]);
            if (channels && Array.isArray(channels)) {
                for (const ch of channels) {
                    await pool.execute(
                        'INSERT INTO fixture_template_channels (template_id, channel_num, function_type, label, `group`) VALUES (?, ?, ?, ?, ?)',
                        [id, ch.channel_num, ch.function_type, ch.label, ch.group || null]
                    );
                }
            }

            res.json({ success: true });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async delete(req: Request, res: Response): Promise<void> {
        try {
            const { id } = req.params;
            const pool = Database.getPool();
            await pool.execute('DELETE FROM fixture_templates WHERE id = ?', [id]);
            await pool.execute('DELETE FROM fixture_template_channels WHERE template_id = ?', [id]);
            res.json({ success: true });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }
}
