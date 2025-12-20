/**
 * DMX Controller Interface
 * Defines contract for DMX communication
 */
export interface IDmxController {
    /**
     * Initialize the DMX interface
     */
    initialize(): Promise<void>;

    /**
     * Set a single DMX channel value
     * @param channel Channel number (1-512)
     * @param value DMX value (0-255)
     */
    setChannel(channel: number, value: number): void;

    /**
     * Set multiple DMX channels at once
     * @param startChannel Starting channel number
     * @param values Array of DMX values
     */
    setChannels(startChannel: number, values: number[]): void;

    /**
     * Get current value of a channel
     * @param channel Channel number (1-512)
     * @returns Current DMX value
     */
    getChannel(channel: number): number;

    /**
     * Get all channel values
     * @returns Array of all 512 DMX values
     */
    getAllChannels(): number[];

    /**
     * Send DMX data to interface
     */
    update(): Promise<void>;

    /**
     * Blackout - set all channels to 0
     */
    blackout(): void;

    /**
     * Close the DMX interface
     */
    close(): Promise<void>;

    /**
     * Check if DMX interface is connected
     */
    isConnected(): boolean;
}
