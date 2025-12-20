/**
 * Cue Service
 * Business logic for cue management (CRUD operations)
 */
import { Cue, ICue } from '../models/Cue';
import { CueList, ICueList } from '../models/CueList';

export class CueService {
    // In-memory storage for now (TODO: Replace with database)
    private cues: Map<number, Cue> = new Map();
    private cueLists: Map<number, CueList> = new Map();
    private nextCueId: number = 1;
    private nextCueListId: number = 1;

    constructor() {
        // Initialize with demo data
        this.createDemoData();
    }

    /**
     * Create demo cues for testing
     */
    private createDemoData(): void {
        // Demo Cue 1: Red
        const cue1Data: ICue = {
            number: 1.0,
            name: 'Red Wash',
            fadeIn: 2000,
            fadeOut: 1000,
            delay: 0,
            channelData: new Array(512).fill(0)
        };
        cue1Data.channelData[5] = 255; // CH6: Dimmer
        cue1Data.channelData[7] = 255; // CH8: Red
        const cue1 = new Cue({ ...cue1Data, id: this.nextCueId++ });
        this.cues.set(cue1.id!, cue1);

        // Demo Cue 2: Blue
        const cue2Data: ICue = {
            number: 2.0,
            name: 'Blue Wash',
            fadeIn: 2000,
            fadeOut: 1000,
            delay: 0,
            channelData: new Array(512).fill(0)
        };
        cue2Data.channelData[5] = 255; // CH6: Dimmer
        cue2Data.channelData[9] = 255; // CH10: Blue
        const cue2 = new Cue({ ...cue2Data, id: this.nextCueId++ });
        this.cues.set(cue2.id!, cue2);

        // Demo Cue 3: White
        const cue3Data: ICue = {
            number: 3.0,
            name: 'White Full',
            fadeIn: 1500,
            fadeOut: 1000,
            delay: 0,
            channelData: new Array(512).fill(0)
        };
        cue3Data.channelData[5] = 255; // CH6: Dimmer
        cue3Data.channelData[10] = 255; // CH11: White
        const cue3 = new Cue({ ...cue3Data, id: this.nextCueId++ });
        this.cues.set(cue3.id!, cue3);

        // Demo CueList
        const cueListData: ICueList = {
            name: 'Demo Show',
            cues: [cue1.toJSON(), cue2.toJSON(), cue3.toJSON()],
            loopEnabled: true,
            speed: 1.0
        };
        const cueList = new CueList({ ...cueListData, id: this.nextCueListId++ });
        this.cueLists.set(cueList.id!, cueList);

        console.log('✅ Demo cues and cue list created');
    }

    /**
     * Get all cues
     */
    getAllCues(): Cue[] {
        return Array.from(this.cues.values());
    }

    /**
     * Get cue by ID
     */
    getCueById(id: number): Cue | undefined {
        return this.cues.get(id);
    }

    /**
     * Create new cue
     */
    createCue(cueData: ICue): Cue {
        const cue = new Cue({ ...cueData, id: this.nextCueId++ });
        this.cues.set(cue.id!, cue);
        console.log(`✅ Created Cue ${cue.number}: ${cue.name}`);
        return cue;
    }

    /**
     * Update cue
     */
    updateCue(id: number, cueData: Partial<ICue>): Cue {
        const existingCue = this.cues.get(id);
        if (!existingCue) {
            throw new Error(`Cue ${id} not found`);
        }

        const updated = new Cue({
            ...existingCue.toJSON(),
            ...cueData,
            id
        });

        this.cues.set(id, updated);
        console.log(`✅ Updated Cue ${id}`);
        return updated;
    }

    /**
     * Delete cue
     */
    deleteCue(id: number): boolean {
        const deleted = this.cues.delete(id);
        if (deleted) {
            console.log(`🗑️ Deleted Cue ${id}`);
        }
        return deleted;
    }

    /**
     * Get all cue lists
     */
    getAllCueLists(): CueList[] {
        return Array.from(this.cueLists.values());
    }

    /**
     * Get cue list by ID
     */
    getCueListById(id: number): CueList | undefined {
        return this.cueLists.get(id);
    }

    /**
     * Create new cue list
     */
    createCueList(data: ICueList): CueList {
        const cueList = new CueList({ ...data, id: this.nextCueListId++ });
        this.cueLists.set(cueList.id!, cueList);
        console.log(`✅ Created CueList ${cueList.id}: ${cueList.name}`);
        return cueList;
    }

    /**
     * Update cue list
     */
    updateCueList(id: number, data: Partial<ICueList>): CueList {
        const existing = this.cueLists.get(id);
        if (!existing) {
            throw new Error(`CueList ${id} not found`);
        }

        const updated = new CueList({
            ...existing.toJSON(),
            ...data,
            id
        });

        this.cueLists.set(id, updated);
        console.log(`✅ Updated CueList ${id}`);
        return updated;
    }

    /**
     * Delete cue list
     */
    deleteCueList(id: number): boolean {
        const deleted = this.cueLists.delete(id);
        if (deleted) {
            console.log(`🗑️ Deleted CueList ${id}`);
        }
        return deleted;
    }

    /**
     * Record current DMX state as new cue
     */
    recordCue(dmxController: any, cueNumber: number, name: string, fadeIn: number = 2000): Cue {
        const channels = dmxController.getAllChannels();

        const cueData: ICue = {
            number: cueNumber,
            name,
            fadeIn,
            fadeOut: fadeIn,
            delay: 0,
            channelData: channels
        };

        return this.createCue(cueData);
    }
}
