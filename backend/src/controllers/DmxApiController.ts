import { Request, Response } from 'express';
import { DmxController } from '../dmx/DmxController';

/**
 * DMX API Controller
 * Handles HTTP requests for DMX operations
 */
export class DmxApiController {
    private dmxController: DmxController;

    constructor(dmxController: DmxController) {
        this.dmxController = dmxController;
    }

    /**
     * GET /api/dmx/status
     * Get DMX interface status
     */
    public getStatus = async (_req: Request, res: Response): Promise<void> => {
        try {
            res.json({
                connected: this.dmxController.isConnected(),
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            res.status(500).json({ error: 'Failed to get status' });
        }
    };

    /**
     * GET /api/dmx/channels
     * Get all channel values
     */
    public getAllChannels = async (_req: Request, res: Response): Promise<void> => {
        try {
            const channels = this.dmxController.getAllChannels();
            res.json({ channels });
        } catch (error) {
            res.status(500).json({ error: 'Failed to get channels' });
        }
    };

    /**
     * GET /api/dmx/channel/:channel
     * Get single channel value
     */
    public getChannel = async (req: Request, res: Response): Promise<void> => {
        try {
            const channel = parseInt(req.params.channel);
            if (isNaN(channel) || channel < 1 || channel > 512) {
                res.status(400).json({ error: 'Invalid channel number' });
                return;
            }

            const value = this.dmxController.getChannel(channel);
            res.json({ channel, value });
        } catch (error) {
            res.status(500).json({ error: 'Failed to get channel' });
        }
    };

    /**
     * POST /api/dmx/channel
     * Set single channel value
     * Body: { channel: number, value: number }
     */
    public setChannel = async (req: Request, res: Response): Promise<void> => {
        try {
            const { channel, value } = req.body;

            if (channel === undefined || value === undefined) {
                res.status(400).json({ error: 'Both channel and value are required in request body' });
                return;
            }

            const ch = parseInt(channel);
            const val = parseInt(value);

            if (isNaN(ch) || ch < 1 || ch > 512) {
                res.status(400).json({ error: `Invalid channel: ${channel}. Must be 1-512.` });
                return;
            }

            if (isNaN(val) || val < 0 || val > 255) {
                res.status(400).json({ error: `Invalid value: ${value}. Must be 0-255.` });
                return;
            }

            this.dmxController.setChannel(ch, val);
            res.json({ success: true, channel: ch, value: val });
        } catch (error: any) {
            console.error('setChannel error:', error.message);
            res.status(400).json({ error: error.message });
        }
    };

    /**
     * POST /api/dmx/channels
     * Set multiple channels
     * Body: { startChannel: number, values: number[] }
     */
    public setChannels = async (req: Request, res: Response): Promise<void> => {
        try {
            const { startChannel, values } = req.body;

            if (!startChannel || !Array.isArray(values)) {
                res.status(400).json({ error: 'startChannel and values array required' });
                return;
            }

            this.dmxController.setChannels(startChannel, values);
            res.json({ success: true, startChannel, count: values.length });
        } catch (error: any) {
            res.status(400).json({ error: error.message });
        }
    };

    /**
     * POST /api/dmx/sparse
     * Set specific channels without affecting others
     * Body: { channels: { "1": 255, "5": 0 } }
     */
    public setSparse = async (req: Request, res: Response): Promise<void> => {
        try {
            const { channels } = req.body;

            if (!channels || typeof channels !== 'object') {
                res.status(400).json({ error: 'channels object required' });
                return;
            }

            // Iterate manually to support non-contiguous updates
            Object.keys(channels).forEach(key => {
                const channel = parseInt(key);
                const value = channels[key];
                if (!isNaN(channel) && typeof value === 'number') {
                    this.dmxController.setChannel(channel, value);
                }
            });

            res.json({ success: true, count: Object.keys(channels).length });
        } catch (error: any) {
            res.status(400).json({ error: error.message });
        }
    };

    /**
     * POST /api/dmx/batch
     * Set all 512 channels at once (optimized for scene recall)
     * Body: { channels: number[] } - Array of 512 values (0-255)
     */
    public setBatch = async (req: Request, res: Response): Promise<void> => {
        try {
            const { channels } = req.body;

            if (!Array.isArray(channels)) {
                res.status(400).json({ error: 'channels array required' });
                return;
            }

            // Handle sparse updates (array of {channel, value})
            if (channels.length > 0 && typeof channels[0] === 'object') {
                channels.forEach((item: any) => {
                    if (item.channel && item.value !== undefined) {
                        this.dmxController.setChannel(item.channel, item.value);
                    }
                });
            } else {
                // Dense update (array of 0-255 numbers, starting at Ch 1)
                this.dmxController.setChannels(1, channels);
            }
            res.json({ success: true, count: channels.length });
        } catch (error: any) {
            res.status(400).json({ error: error.message });
        }
    };

    /**
     * POST /api/dmx/blackout
     * Set all channels to 0
     */
    public blackout = async (_req: Request, res: Response): Promise<void> => {
        try {
            this.dmxController.blackout();
            res.json({ success: true, message: 'Blackout activated' });
        } catch (error) {
            res.status(500).json({ error: 'Failed to activate blackout' });
        }
    };
}
