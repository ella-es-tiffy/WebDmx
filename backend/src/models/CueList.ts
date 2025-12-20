/**
 * CueList Model
 * Represents a list of cues for sequential playback
 */
import { Cue, ICue } from './Cue';

export interface ICueList {
    id?: number;
    name: string;
    cues: ICue[];
    loopEnabled: boolean;
    speed: number;         // Playback speed multiplier (0.1 - 2.0)
    createdAt?: Date;
    updatedAt?: Date;
}

export class CueList implements ICueList {
    id?: number;
    name: string;
    cues: Cue[];
    loopEnabled: boolean;
    speed: number;
    createdAt?: Date;
    updatedAt?: Date;

    constructor(data: ICueList) {
        this.id = data.id;
        this.name = data.name;
        this.cues = data.cues.map(c => new Cue(c));
        this.loopEnabled = data.loopEnabled || false;
        this.speed = data.speed || 1.0;
        this.createdAt = data.createdAt;
        this.updatedAt = data.updatedAt;
    }

    /**
     * Add cue to list
     */
    addCue(cue: Cue): void {
        this.cues.push(cue);
        this.sortCues();
    }

    /**
     * Remove cue by ID
     */
    removeCue(cueId: number): boolean {
        const index = this.cues.findIndex(c => c.id === cueId);
        if (index >= 0) {
            this.cues.splice(index, 1);
            return true;
        }
        return false;
    }

    /**
     * Get cue by number
     */
    getCueByNumber(number: number): Cue | undefined {
        return this.cues.find(c => c.number === number);
    }

    /**
     * Sort cues by number
     */
    private sortCues(): void {
        this.cues.sort((a, b) => a.number - b.number);
    }

    /**
     * Convert to JSON
     */
    toJSON(): ICueList {
        return {
            id: this.id,
            name: this.name,
            cues: this.cues.map(c => c.toJSON()),
            loopEnabled: this.loopEnabled,
            speed: this.speed,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt
        };
    }
}
