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
    device_type: DeviceType;
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
            `INSERT INTO devices (name, manufacturer, model, dmx_address, universe, channel_count, device_type)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                device.name,
                device.manufacturer,
                device.model,
                device.dmx_address,
                device.universe || 1,
                device.channel_count,
                device.device_type
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
                device_type = COALESCE(?, device_type)
             WHERE id = ?`,
            [
                device.name,
                device.manufacturer,
                device.model,
                device.dmx_address,
                device.universe,
                device.channel_count,
                device.device_type,
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
