/**
 * Cue API Controller
 * Handles HTTP requests for cue and playback operations
 */
import { Request, Response } from 'express';
import { CueService } from '../services/CueService';
import { PlaybackEngine, PlaybackState } from '../services/PlaybackEngine';
import { DmxController } from '../dmx/DmxController';

export class CueController {
    private cueService: CueService;
    private playbackEngine: PlaybackEngine;
    private dmxController: DmxController;

    constructor(cueService: CueService, playbackEngine: PlaybackEngine, dmxController: DmxController) {
        this.cueService = cueService;
        this.playbackEngine = playbackEngine;
        this.dmxController = dmxController;

        // Bind methods to preserve 'this' context
        this.getAllCues = this.getAllCues.bind(this);
        this.getCue = this.getCue.bind(this);
        this.createCue = this.createCue.bind(this);
        this.updateCue = this.updateCue.bind(this);
        this.deleteCue = this.deleteCue.bind(this);
        this.recordCue = this.recordCue.bind(this);

        this.getAllCueLists = this.getAllCueLists.bind(this);
        this.getCueList = this.getCueList.bind(this);
        this.createCueList = this.createCueList.bind(this);
        this.updateCueList = this.updateCueList.bind(this);
        this.deleteCueList = this.deleteCueList.bind(this);

        this.loadCueList = this.loadCueList.bind(this);
        this.playbackStart = this.playbackStart.bind(this);
        this.playbackStop = this.playbackStop.bind(this);
        this.playbackPause = this.playbackPause.bind(this);
        this.playbackResume = this.playbackResume.bind(this);
        this.playbackNext = this.playbackNext.bind(this);
        this.playbackPrevious = this.playbackPrevious.bind(this);
        this.playbackGoTo = this.playbackGoTo.bind(this);
        this.playbackStatus = this.playbackStatus.bind(this);
        this.playbackSetSpeed = this.playbackSetSpeed.bind(this);
        this.playbackToggleLoop = this.playbackToggleLoop.bind(this);
    }

    // ========== CUE CRUD ==========

    async getAllCues(req: Request, res: Response): Promise<void> {
        try {
            const cues = this.cueService.getAllCues();
            res.json({ success: true, cues: cues.map(c => c.toJSON()) });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async getCue(req: Request, res: Response): Promise<void> {
        try {
            const id = parseInt(req.params.id);
            const cue = this.cueService.getCueById(id);

            if (!cue) {
                res.status(404).json({ success: false, error: 'Cue not found' });
                return;
            }

            res.json({ success: true, cue: cue.toJSON() });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async createCue(req: Request, res: Response): Promise<void> {
        try {
            const cue = this.cueService.createCue(req.body);
            res.json({ success: true, cue: cue.toJSON() });
        } catch (error: any) {
            res.status(400).json({ success: false, error: error.message });
        }
    }

    async updateCue(req: Request, res: Response): Promise<void> {
        try {
            const id = parseInt(req.params.id);
            const cue = this.cueService.updateCue(id, req.body);
            res.json({ success: true, cue: cue.toJSON() });
        } catch (error: any) {
            res.status(400).json({ success: false, error: error.message });
        }
    }

    async deleteCue(req: Request, res: Response): Promise<void> {
        try {
            const id = parseInt(req.params.id);
            const deleted = this.cueService.deleteCue(id);

            if (!deleted) {
                res.status(404).json({ success: false, error: 'Cue not found' });
                return;
            }

            res.json({ success: true });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async recordCue(req: Request, res: Response): Promise<void> {
        try {
            const { number, name, fadeIn } = req.body;

            if (!number || !name) {
                res.status(400).json({ success: false, error: 'number and name are required' });
                return;
            }

            const cue = this.cueService.recordCue(this.dmxController, number, name, fadeIn);
            res.json({ success: true, cue: cue.toJSON() });
        } catch (error: any) {
            res.status(400).json({ success: false, error: error.message });
        }
    }

    // ========== CUE LIST CRUD ==========

    async getAllCueLists(req: Request, res: Response): Promise<void> {
        try {
            const lists = this.cueService.getAllCueLists();
            res.json({ success: true, cueLists: lists.map(l => l.toJSON()) });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async getCueList(req: Request, res: Response): Promise<void> {
        try {
            const id = parseInt(req.params.id);
            const list = this.cueService.getCueListById(id);

            if (!list) {
                res.status(404).json({ success: false, error: 'CueList not found' });
                return;
            }

            res.json({ success: true, cueList: list.toJSON() });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async createCueList(req: Request, res: Response): Promise<void> {
        try {
            const list = this.cueService.createCueList(req.body);
            res.json({ success: true, cueList: list.toJSON() });
        } catch (error: any) {
            res.status(400).json({ success: false, error: error.message });
        }
    }

    async updateCueList(req: Request, res: Response): Promise<void> {
        try {
            const id = parseInt(req.params.id);
            const list = this.cueService.updateCueList(id, req.body);
            res.json({ success: true, cueList: list.toJSON() });
        } catch (error: any) {
            res.status(400).json({ success: false, error: error.message });
        }
    }

    async deleteCueList(req: Request, res: Response): Promise<void> {
        try {
            const id = parseInt(req.params.id);
            const deleted = this.cueService.deleteCueList(id);

            if (!deleted) {
                res.status(404).json({ success: false, error: 'CueList not found' });
                return;
            }

            res.json({ success: true });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    // ========== PLAYBACK CONTROL ==========

    async loadCueList(req: Request, res: Response): Promise<void> {
        try {
            const id = parseInt(req.params.id);
            const cueList = this.cueService.getCueListById(id);

            if (!cueList) {
                res.status(404).json({ success: false, error: 'CueList not found' });
                return;
            }

            this.playbackEngine.loadCueList(cueList);
            res.json({ success: true, message: 'CueList loaded' });
        } catch (error: any) {
            res.status(400).json({ success: false, error: error.message });
        }
    }

    async playbackStart(req: Request, res: Response): Promise<void> {
        try {
            this.playbackEngine.start();
            res.json({ success: true, state: this.playbackEngine.getState() });
        } catch (error: any) {
            res.status(400).json({ success: false, error: error.message });
        }
    }

    async playbackStop(req: Request, res: Response): Promise<void> {
        try {
            this.playbackEngine.stop();
            res.json({ success: true, state: this.playbackEngine.getState() });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async playbackPause(req: Request, res: Response): Promise<void> {
        try {
            this.playbackEngine.pause();
            res.json({ success: true, state: this.playbackEngine.getState() });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async playbackResume(req: Request, res: Response): Promise<void> {
        try {
            this.playbackEngine.resume();
            res.json({ success: true, state: this.playbackEngine.getState() });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async playbackNext(req: Request, res: Response): Promise<void> {
        try {
            this.playbackEngine.next();
            res.json({ success: true, state: this.playbackEngine.getState() });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async playbackPrevious(req: Request, res: Response): Promise<void> {
        try {
            this.playbackEngine.previous();
            res.json({ success: true, state: this.playbackEngine.getState() });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async playbackGoTo(req: Request, res: Response): Promise<void> {
        try {
            const cueNumber = parseFloat(req.params.cueNumber);
            this.playbackEngine.goToCue(cueNumber);
            res.json({ success: true, state: this.playbackEngine.getState() });
        } catch (error: any) {
            res.status(400).json({ success: false, error: error.message });
        }
    }

    async playbackStatus(req: Request, res: Response): Promise<void> {
        try {
            const state = this.playbackEngine.getState();
            res.json({ success: true, state });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async playbackSetSpeed(req: Request, res: Response): Promise<void> {
        try {
            const { speed } = req.body;

            if (!speed || isNaN(speed)) {
                res.status(400).json({ success: false, error: 'Valid speed value required' });
                return;
            }

            this.playbackEngine.setSpeed(parseFloat(speed));
            res.json({ success: true, state: this.playbackEngine.getState() });
        } catch (error: any) {
            res.status(400).json({ success: false, error: error.message });
        }
    }

    async playbackToggleLoop(req: Request, res: Response): Promise<void> {
        try {
            const loopEnabled = this.playbackEngine.toggleLoop();
            res.json({ success: true, loopEnabled, state: this.playbackEngine.getState() });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }
}
