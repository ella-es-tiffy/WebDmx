/**
 * Cue Model
 * Represents a single lighting state/look
 */
export interface ICue {
    id?: number;
    number: number;        // Cue number (1.0, 1.5, 2.0, etc.)
    name: string;
    fadeIn: number;        // Fade in time (milliseconds)
    fadeOut: number;       // Fade out time (milliseconds)
    delay: number;         // Delay before execution (milliseconds)
    channelData: number[]; // DMX values (512 channels)
    createdAt?: Date;
    updatedAt?: Date;
}

export class Cue implements ICue {
    id?: number;
    number: number;
    name: string;
    fadeIn: number;
    fadeOut: number;
    delay: number;
    channelData: number[];
    createdAt?: Date;
    updatedAt?: Date;

    constructor(data: ICue) {
        this.id = data.id;
        this.number = data.number;
        this.name = data.name;
        this.fadeIn = data.fadeIn || 0;
        this.fadeOut = data.fadeOut || 0;
        this.delay = data.delay || 0;
        this.channelData = data.channelData || new Array(512).fill(0);
        this.createdAt = data.createdAt;
        this.updatedAt = data.updatedAt;
    }

    /**
     * Get DMX value for specific channel
     */
    getChannel(channel: number): number {
        if (channel < 1 || channel > 512) {
            throw new Error(`Channel ${channel} out of range (1-512)`);
        }
        return this.channelData[channel - 1] || 0;
    }

    /**
     * Set DMX value for specific channel
     */
    setChannel(channel: number, value: number): void {
        if (channel < 1 || channel > 512) {
            throw new Error(`Channel ${channel} out of range (1-512)`);
        }
        if (value < 0 || value > 255) {
            throw new Error(`Value ${value} out of range (0-255)`);
        }
        this.channelData[channel - 1] = Math.floor(value);
    }

    /**
     * Convert to JSON for API responses
     */
    toJSON(): ICue {
        return {
            id: this.id,
            number: this.number,
            name: this.name,
            fadeIn: this.fadeIn,
            fadeOut: this.fadeOut,
            delay: this.delay,
            channelData: this.channelData,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt
        };
    }
}
