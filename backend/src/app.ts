import express, { Application } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { DmxController } from './dmx/DmxController';
import { Database } from './config/database';
import { createDmxRoutes } from './routes/dmxRoutes';
import { createDeviceRoutes } from './routes/deviceRoutes';
import { createSystemRoutes } from './routes/systemRoutes';
import { createCueRoutes } from './routes/cueRoutes';
import { createFaderRoutes } from './routes/faderRoutes';
import { createTemplateRoutes } from './routes/templateRoutes';

dotenv.config();

/**
 * Main Application Class
 */
class App {
    private app: Application;
    private dmxController: DmxController;
    private port: number;

    constructor() {
        this.app = express();
        this.port = parseInt(process.env.PORT || '3000');

        // Initialize DMX Controller
        const dmxPort = process.env.DMX_PORT || '/dev/cu.usbserial-132120';
        const dmxBaudRate = parseInt(process.env.DMX_BAUDRATE || '250000');
        this.dmxController = new DmxController(dmxPort, dmxBaudRate);

        this.setupMiddleware();
        this.setupRoutes();
    }

    /**
     * Setup Express middleware
     */
    private setupMiddleware(): void {
        this.app.use(cors());
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));

        // Request logging
        this.app.use((req, _res, next) => {
            console.log(`${req.method} ${req.path}`);
            next();
        });
    }

    /**
     * Setup API routes
     */
    private setupRoutes(): void {
        // Health check
        this.app.get('/health', (_req, res) => {
            res.json({
                status: 'ok',
                timestamp: new Date().toISOString(),
                dmx: this.dmxController.isConnected()
            });
        });

        // API routes
        this.app.use('/api/dmx', createDmxRoutes(this.dmxController));
        this.app.use('/api/devices', createDeviceRoutes());
        this.app.use('/api/system', createSystemRoutes());
        this.app.use('/api', createCueRoutes(this.dmxController)); // Cue & Playback routes
        this.app.use('/api', createFaderRoutes(this.dmxController)); // Fader names
        this.app.use('/api/templates', createTemplateRoutes());

        // 404 handler
        this.app.get('/', (_req, res) => {
            res.send('WebDMX API Server is running');
        });
        this.app.use((_req, res) => {
            res.status(404).json({ error: 'Not Found' });
        });
    }

    /**
     * Initialize database and DMX controller
     */
    private async initialize(): Promise<void> {
        console.log('Initializing WebDMX Backend...');

        // Test database connection
        const dbConnected = await Database.testConnection();
        if (!dbConnected) {
            console.error('Database connection failed - continuing without DB');
        }

        // Initialize DMX controller
        try {
            await this.dmxController.initialize();
            console.log('DMX Controller initialized successfully');
        } catch (error) {
            console.error('Failed to initialize DMX Controller:', error);
            console.log('Continuing without DMX interface...');
        }
    }

    /**
     * Start the server
     */
    public async start(): Promise<void> {
        await this.initialize();

        this.app.listen(this.port, () => {
            console.log(`\n========================================`);
            console.log(`WebDMX Backend Server`);
            console.log(`========================================`);
            console.log(`Server running on: http://localhost:${this.port}`);
            console.log(`Health check: http://localhost:${this.port}/health`);
            console.log(`DMX Status: http://localhost:${this.port}/api/dmx/status`);
            console.log(`========================================\n`);
        });
    }

    /**
     * Graceful shutdown
     */
    public async shutdown(): Promise<void> {
        console.log('\nShutting down gracefully...');
        await this.dmxController.close();
        await Database.close();
        process.exit(0);
    }
}

// Create and start application
const app = new App();

// Handle shutdown signals
process.on('SIGINT', () => app.shutdown());
process.on('SIGTERM', () => app.shutdown());

// Start server
app.start().catch(console.error);
