import { Request, Response } from 'express';
import { Device, IDevice } from '../models/Device';

/**
 * Device Controller
 * Handles HTTP requests for device management
 */
export class DeviceController {
    /**
     * GET /api/devices
     * Get all devices
     */
    public async getAll(req: Request, res: Response): Promise<void> {
        try {
            const devices = await Device.getAll();
            res.json(devices);
        } catch (error) {
            console.error('Error fetching devices:', error);
            res.status(500).json({ error: 'Failed to fetch devices' });
        }
    }

    /**
     * GET /api/devices/:id
     * Get device by ID
     */
    public async getById(req: Request, res: Response): Promise<void> {
        try {
            const id = parseInt(req.params.id);
            const device = await Device.getById(id);

            if (!device) {
                res.status(404).json({ error: 'Device not found' });
                return;
            }

            res.json(device);
        } catch (error) {
            console.error('Error fetching device:', error);
            res.status(500).json({ error: 'Failed to fetch device' });
        }
    }

    /**
     * POST /api/devices
     * Create new device
     */
    public async create(req: Request, res: Response): Promise<void> {
        try {
            const device: IDevice = req.body;

            if (!device.name || !device.dmx_address || !device.channel_count) {
                res.status(400).json({ error: 'Missing required fields' });
                return;
            }

            const id = await Device.create(device);
            res.status(201).json({ id, message: 'Device created successfully' });
        } catch (error) {
            console.error('Error creating device:', error);
            res.status(500).json({ error: 'Failed to create device' });
        }
    }

    /**
     * PUT /api/devices/:id
     * Update device
     */
    public async update(req: Request, res: Response): Promise<void> {
        try {
            const id = parseInt(req.params.id);
            const device: Partial<IDevice> = req.body;

            const success = await Device.update(id, device);

            if (!success) {
                res.status(404).json({ error: 'Device not found' });
                return;
            }

            res.json({ message: 'Device updated successfully' });
        } catch (error) {
            console.error('Error updating device:', error);
            res.status(500).json({ error: 'Failed to update device' });
        }
    }

    /**
     * DELETE /api/devices/:id
     * Delete device
     */
    public async delete(req: Request, res: Response): Promise<void> {
        try {
            const id = parseInt(req.params.id);
            const success = await Device.delete(id);

            if (!success) {
                res.status(404).json({ error: 'Device not found' });
                return;
            }

            res.json({ message: 'Device deleted successfully' });
        } catch (error) {
            console.error('Error deleting device:', error);
            res.status(500).json({ error: 'Failed to delete device' });
        }
    }
}
