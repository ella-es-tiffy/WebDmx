import { Database } from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

/**
 * Device Type Enum
 */
export enum DeviceType {
    DIMMER = 'dimmer',
    RGB = 'rgb',
    RGBA = 'rgba',
    RGBW = 'rgbw',
    CMY = 'cmy',
    MOVING_HEAD = 'moving_head',
    SCANNER = 'scanner',
    STROBE = 'strobe',
    GENERIC = 'generic'
}

/**
 * Device Interface
 */
export interface IDevice {
    id?: number;
    name: string;
    manufacturer?: string;
    model?: string;
    dmx_address: number;
    universe?: number;
    channel_count: number;
    device_type?: DeviceType;
    category: 'spot' | 'wash' | 'par' | 'dimmer' | 'strobe' | 'sonstiges';
    position: 'front' | 'mid' | 'back' | 'left' | 'right';
    template_id?: number;
    created_at?: Date;
    updated_at?: Date;
}

/**
 * Device Model
 * Handles database operations for devices/fixtures
 */
export class Device {
    /**
     * Get all devices
     */
    public static async getAll(): Promise<IDevice[]> {
        const pool = Database.getPool();

        // Ensure table exists
        await pool.query(`
            CREATE TABLE IF NOT EXISTS devices (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                manufacturer VARCHAR(100),
                model VARCHAR(100),
                dmx_address INT NOT NULL,
                universe INT DEFAULT 1,
                channel_count INT NOT NULL,
                device_type VARCHAR(50),
                category VARCHAR(50) DEFAULT 'sonstiges',
                position VARCHAR(50) DEFAULT 'front',
                template_id INT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        // Migration: Ensure new columns exist (safely)
        try { await pool.query("ALTER TABLE devices ADD COLUMN category VARCHAR(50) DEFAULT 'sonstiges'"); } catch (e) { }
        try { await pool.query("ALTER TABLE devices ADD COLUMN position VARCHAR(50) DEFAULT 'front'"); } catch (e) { }
        try { await pool.query("ALTER TABLE devices ADD COLUMN universe INT DEFAULT 1"); } catch (e) { }
        try { await pool.query("ALTER TABLE devices ADD COLUMN manufacturer VARCHAR(100)"); } catch (e) { }
        try { await pool.query("ALTER TABLE devices ADD COLUMN model VARCHAR(100)"); } catch (e) { }
        try { await pool.query("ALTER TABLE devices ADD COLUMN template_id INT NULL"); } catch (e) { }

        const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM devices ORDER BY dmx_address');
        return rows as IDevice[];
    }

    /**
     * Get device by ID
     */
    public static async getById(id: number): Promise<IDevice | null> {
        const pool = Database.getPool();
        const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM devices WHERE id = ?', [id]);
        return rows.length > 0 ? rows[0] as IDevice : null;
    }

    /**
     * Create new device
     */
    public static async create(device: IDevice): Promise<number> {
        const pool = Database.getPool();
        const [result] = await pool.query<ResultSetHeader>(
            `INSERT INTO devices (name, manufacturer, model, dmx_address, universe, channel_count, device_type, category, position, template_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                device.name,
                device.manufacturer,
                device.model,
                device.dmx_address,
                device.universe || 1,
                device.channel_count,
                device.device_type || DeviceType.GENERIC,
                device.category || 'sonstiges',
                device.position || 'front',
                device.template_id || null
            ]
        );
        return result.insertId;
    }

    /**
     * Update device
     */
    public static async update(id: number, device: Partial<IDevice>): Promise<boolean> {
        const pool = Database.getPool();
        const [result] = await pool.query<ResultSetHeader>(
            `UPDATE devices SET
                name = COALESCE(?, name),
                manufacturer = COALESCE(?, manufacturer),
                model = COALESCE(?, model),
                dmx_address = COALESCE(?, dmx_address),
                universe = COALESCE(?, universe),
                channel_count = COALESCE(?, channel_count),
                device_type = COALESCE(?, device_type),
                category = COALESCE(?, category),
                position = COALESCE(?, position),
                template_id = COALESCE(?, template_id)
             WHERE id = ?`,
            [
                device.name,
                device.manufacturer,
                device.model,
                device.dmx_address,
                device.universe,
                device.channel_count,
                device.device_type,
                device.category,
                device.position,
                device.template_id,
                id
            ]
        );
        return result.affectedRows > 0;
    }

    /**
     * Delete device
     */
    public static async delete(id: number): Promise<boolean> {
        const pool = Database.getPool();
        const [result] = await pool.query<ResultSetHeader>('DELETE FROM devices WHERE id = ?', [id]);
        return result.affectedRows > 0;
    }
}
