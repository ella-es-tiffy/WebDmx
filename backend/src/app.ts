import express, { Application } from 'express';
import { createServer, Server } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import dotenv from 'dotenv';
import compression from 'compression';
import { DmxController } from './dmx/DmxController';
import { Database } from './config/database';
import { createDmxRoutes } from './routes/dmxRoutes';
import { createDeviceRoutes } from './routes/deviceRoutes';
import { createSystemRoutes } from './routes/systemRoutes';
import { createCueRoutes } from './routes/cueRoutes';
import { createFaderRoutes } from './routes/faderRoutes';
import { createTemplateRoutes } from './routes/templateRoutes';
import sceneRoutes from './routes/sceneRoutes';

dotenv.config();

/**
 * Main Application Class
 */
class App {
    private app: Application;
    private server: Server;
    private wss: WebSocketServer;
    private dmxController: DmxController;
    private port: number;

    constructor() {
        this.app = express();
        this.server = createServer(this.app);
        this.port = parseInt(process.env.PORT || '3000');

        // Initialize DMX Controller
        const dmxPort = process.env.DMX_PORT || '/dev/cu.usbserial-132120';
        const dmxBaudRate = parseInt(process.env.DMX_BAUDRATE || '250000');
        this.dmxController = new DmxController(dmxPort, dmxBaudRate);

        // Initialize WebSocket Server
        this.wss = new WebSocketServer({ server: this.server });
        this.setupWebSocket(); // Helper method

        this.setupMiddleware();
        this.setupRoutes();
    }

    /**
     * Setup WebSocket Logic for Realtime DMX
     */
    private setupWebSocket(): void {
        this.wss.on('connection', (ws) => {
            // console.log('Client connected for Realtime DMX');

            ws.on('message', (data: Buffer, isBinary: boolean) => {
                // High-Speed Binary Path
                if (isBinary) {
                    try {
                        this.dmxController.updateBuffer(data);
                    } catch (e) {
                        // Ignore errors in hot path
                    }
                } else {
                    // Text Path (Latency Check)
                    const msg = data.toString();
                    if (msg === 'ping') ws.send('pong');
                }
            });
        });
    }

    /**
     * Setup Express middleware
     */
    private setupMiddleware(): void {
        this.app.use(compression()); // Gzip compression
        this.app.use(cors());
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));
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
                dmx: this.dmxController.isConnected(),
                wsClients: this.wss.clients.size
            });
        });

        // API routes
        this.app.use('/api/dmx', createDmxRoutes(this.dmxController));
        this.app.use('/api/devices', createDeviceRoutes());
        this.app.use('/api/system', createSystemRoutes());
        this.app.use('/api', createCueRoutes(this.dmxController)); // Cue & Playback routes
        this.app.use('/api', createFaderRoutes(this.dmxController)); // Fader names
        this.app.use('/api/templates', createTemplateRoutes());
        this.app.use('/api', sceneRoutes); // Scene management

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

        this.server.listen(this.port, () => {
            console.log(`\n========================================`);
            console.log(`WebDMX Backend Server + Realtime WS`);
            console.log(`========================================`);
            console.log(`Server running on: http://localhost:${this.port}`);
            console.log(`Health check: http://localhost:${this.port}/health`);
            console.log(`WS Endpoint: ws://localhost:${this.port}`);
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
