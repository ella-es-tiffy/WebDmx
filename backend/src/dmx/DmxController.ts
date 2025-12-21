import { SerialPort } from 'serialport';
import { IDmxController } from '../interfaces/IDmxController';

/**
 * DMX512 Protocol Constants
 */
const DMX_UNIVERSE_SIZE = 512;
const DMX_START_CODE = 0x00;

/**
 * DmxController Class
 * Handles DMX512 communication via FTDI serial interface
 */
export class DmxController implements IDmxController {
    private port: SerialPort | null = null;
    private writeBuffer: Buffer; // Updated by API calls
    private readBuffer: Buffer;  // Read by DMX transmission (double-buffering)
    private portPath: string;
    private baudRate: number;
    private connected: boolean = false;
    private updateInterval: NodeJS.Timeout | null = null;

    constructor(portPath: string, baudRate: number = 250000) {
        this.portPath = portPath;
        this.baudRate = baudRate;

        // Double buffering to prevent race conditions
        this.writeBuffer = Buffer.alloc(DMX_UNIVERSE_SIZE + 1);
        this.readBuffer = Buffer.alloc(DMX_UNIVERSE_SIZE + 1);
        this.writeBuffer[0] = DMX_START_CODE;
        this.readBuffer[0] = DMX_START_CODE;
    }

    /**
     * Initialize serial port connection
     */
    public async initialize(): Promise<void> {
        return new Promise((resolve) => {
            this.port = new SerialPort({
                path: this.portPath,
                baudRate: this.baudRate,
                dataBits: 8,
                stopBits: 2,
                parity: 'none'
            }, (err) => {
                if (err) {
                    console.error('Failed to open DMX port:', err.message);
                    console.warn(`⚠️  SWITCHING TO SIMULATION MODE`);
                    console.warn(`   (Hardware will not receive signals, but UI will work)`);
                    this.connected = true; // Pretend we are connected

                    // Simple simulation loop that just logs periodically to prove it's alive
                    this.updateInterval = setInterval(() => {
                        // In simulation, we do nothing but keep the loop alive
                    }, 5000);

                    resolve();
                    return;
                }

                this.connected = true;
                console.log(`DMX Controller initialized on ${this.portPath}`);

                // Send initial blackout to valid signal
                this.blackout();

                // Start optimized DMX transmission loop
                this.startTransmissionLoop();

                resolve();
            });

            this.port?.on('error', (err) => {
                // if (err.message && err.message.includes('IOSSIOSPEED')) return; // Don't ignore anymore, we want to know!
                console.error('⚠️ DMX Serial Port Error:', err.message);
                this.connected = false;
                this.reconnect();
            });

            this.port?.on('close', () => {
                console.warn('⚠️ DMX Port Closed. Attempting reconnect...');
                this.connected = false;
                this.reconnect();
            });
        });
    }

    private reconnectTimeout: NodeJS.Timeout | null = null;

    private reconnect() {
        if (this.reconnectTimeout) return; // Already trying

        // Stop Loop
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }

        console.log('🔄 Reconnecting in 1s...');
        this.reconnectTimeout = setTimeout(async () => {
            this.reconnectTimeout = null;
            try {
                // Try to close first just in case
                if (this.port && this.port.isOpen) {
                    await new Promise<void>(r => this.port!.close(() => r()));
                }

                // Re-Initialize
                await this.initialize();
            } catch (e) {
                console.error('Reconnect failed, retrying...', e);
                this.reconnect(); // Infinite retry
            }
        }, 1000);
    }

    private isUpdating: boolean = false;

    private startTransmissionLoop() {
        if (this.updateInterval) clearTimeout(this.updateInterval as any);

        const loop = async () => {
            if (!this.connected) return;

            try {
                await this.update();
            } catch (err: any) {
                const msg = err.message || '';
                if (!msg.includes('Interrupted') && !msg.includes('temporarily unavailable')) {
                    // console.error('TX Error:', msg);
                }
            }

            // Original logic: Fixed 25ms delay AFTER update finishes
            // This results in slightly lower but rock-stable FPS (approx 20-30Hz)
            this.updateInterval = setTimeout(loop, 25) as any;
        };

        console.log('🚀 Starting Standard DMX Loop (25ms delay)...');
        loop();
    }

    /**
     * Send DMX data to serial port
     * Reverting to original "Working" implementation
     */
    public async update(): Promise<void> {
        if (!this.port || !this.port.isOpen || this.isUpdating) return;
        this.isUpdating = true;

        this.writeBuffer.copy(this.readBuffer);

        return new Promise((resolve) => {
            // STEP 1: Assert BREAK
            // NOTE: We explicitly set rts: false as it was in the original code
            this.port!.set({ brk: true, rts: false }, (err) => {
                if (err) { this.isUpdating = false; return resolve(); }

                this.port!.set({ brk: false, rts: false }, (err) => {
                    if (err) { this.isUpdating = false; return resolve(); }

                    setImmediate(() => {
                        this.port!.write(this.readBuffer, (err) => {
                            if (err) { /* ignore */ }
                            this.isUpdating = false;
                            resolve();
                        });
                    });
                });
            });
        });
    }

    /**
     * Set a single DMX channel value
     */
    public setChannel(channel: number, value: number): void {
        if (channel < 1 || channel > DMX_UNIVERSE_SIZE) {
            throw new Error(`Channel ${channel} out of range (1-512)`);
        }
        if (value < 0 || value > 255) {
            throw new Error(`Value ${value} out of range (0-255)`);
        }

        this.writeBuffer[channel] = Math.floor(value);
    }

    /**
     * Set multiple channels at once
     */
    public setChannels(startChannel: number, values: number[]): void {
        if (startChannel < 1 || startChannel > DMX_UNIVERSE_SIZE) {
            throw new Error(`Start channel ${startChannel} out of range (1-512)`);
        }
        if (startChannel + values.length - 1 > DMX_UNIVERSE_SIZE) {
            throw new Error(`Channel range exceeds universe size`);
        }

        for (let i = 0; i < values.length; i++) {
            const value = Math.max(0, Math.min(255, Math.floor(values[i])));
            this.writeBuffer[startChannel + i] = value;
        }
    }

    /**
     * Direct Buffer Update (High Performance)
     * Used by WebSocket for realtime control
     * copies data directly into writeBuffer starting at channel 1
     */
    public updateBuffer(data: Buffer): void {
        const length = Math.min(data.length, DMX_UNIVERSE_SIZE);
        // Copy directly to writeBuffer+1 (skipping Start Code)
        data.copy(this.writeBuffer, 1, 0, length);
    }

    /**
     * Get current value of a channel
     */
    public getChannel(channel: number): number {
        if (channel < 1 || channel > DMX_UNIVERSE_SIZE) {
            throw new Error(`Channel ${channel} out of range (1-512)`);
        }
        return this.writeBuffer[channel];
    }

    /**
     * Get all channel values
     */
    public getAllChannels(): number[] {
        return Array.from(this.writeBuffer.slice(1));
    }

    /**
     * Blackout - set all channels to 0
     */
    public blackout(): void {
        for (let i = 1; i <= DMX_UNIVERSE_SIZE; i++) {
            this.writeBuffer[i] = 0;
        }
    }

    /**
     * Close serial port connection
     */
    public async close(): Promise<void> {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }

        if (this.port && this.port.isOpen) {
            return new Promise((resolve, reject) => {
                this.port!.close((err) => {
                    if (err) {
                        reject(err);
                    } else {
                        this.connected = false;
                        console.log('DMX Controller closed');
                        resolve();
                    }
                });
            });
        }
    }

    /**
     * Check connection status
     */
    public isConnected(): boolean {
        return this.connected && this.port !== null && this.port.isOpen;
    }
}
