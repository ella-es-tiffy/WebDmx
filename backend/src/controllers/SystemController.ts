import { Request, Response } from 'express';
import { exec } from 'child_process';

/**
 * System Controller
 * Handles system-level operations (restart, status, etc.)
 */
export class SystemController {
    /**
     * GET /api/system/status
     * Get complete system status
     */
    public async getStatus(req: Request, res: Response): Promise<void> {
        try {
            const status = {
                server: {
                    uptime: process.uptime(),
                    memory: process.memoryUsage(),
                    version: process.version,
                    platform: process.platform
                },
                timestamp: new Date().toISOString()
            };

            res.json(status);
        } catch (error) {
            console.error('Error getting system status:', error);
            res.status(500).json({ error: 'Failed to get system status' });
        }
    }

    /**
     * POST /api/system/restart
     * Restart the API server (development only)
     */
    public async restart(req: Request, res: Response): Promise<void> {
        try {
            // Only allow in development
            if (process.env.NODE_ENV === 'production') {
                res.status(403).json({
                    error: 'Restart not allowed in production',
                    message: 'Use process manager (pm2, systemd) instead'
                });
                return;
            }

            res.json({
                success: true,
                message: 'Server restart initiated...',
                note: 'Server will restart in 2 seconds'
            });

            // Give response time to send, then restart
            setTimeout(() => {
                console.log('\n🔄 API Restart requested via /api/system/restart');
                console.log('Restarting server via ts-node-dev...\n');

                // Exit with code 0 - ts-node-dev will automatically restart
                process.exit(0);
            }, 1000);

        } catch (error) {
            console.error('Error restarting server:', error);
            res.status(500).json({ error: 'Failed to restart server' });
        }
    }

    /**
     * POST /api/system/logs/clear
     * Clear console logs (simulation - actual implementation would need log management)
     */
    public async clearLogs(req: Request, res: Response): Promise<void> {
        try {
            console.clear();
            console.log('📋 Console logs cleared via API');

            res.json({
                success: true,
                message: 'Console logs cleared'
            });
        } catch (error) {
            res.status(500).json({ error: 'Failed to clear logs' });
        }
    }

    /**
     * GET /api/system/process-info
     * Get detailed process information
     */
    public async getProcessInfo(req: Request, res: Response): Promise<void> {
        try {
            const info = {
                pid: process.pid,
                title: process.title,
                argv: process.argv,
                execPath: process.execPath,
                cwd: process.cwd(),
                uptime: process.uptime(),
                versions: process.versions,
                env: {
                    NODE_ENV: process.env.NODE_ENV,
                    PORT: process.env.PORT,
                    DMX_PORT: process.env.DMX_PORT
                }
            };

            res.json(info);
        } catch (error) {
            res.status(500).json({ error: 'Failed to get process info' });
        }
    }
}
