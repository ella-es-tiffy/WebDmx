import { Request, Response } from 'express';
import { TimelineService } from '../services/TimelineService';

export class TimelineController {
    private timelineService: TimelineService;

    constructor() {
        this.timelineService = new TimelineService();

        // Bind methods
        this.saveTimeline = this.saveTimeline.bind(this);
        this.loadTimeline = this.loadTimeline.bind(this);
    }

    async saveTimeline(req: Request, res: Response): Promise<void> {
        try {
            const data = req.body;
            // Basic Validation
            if (!data || typeof data !== 'object') {
                res.status(400).json({ success: false, error: 'Invalid data format' });
                return;
            }

            const success = this.timelineService.saveTimeline(data);
            if (success) {
                res.json({ success: true, message: 'Timeline saved successfully' });
            } else {
                res.status(500).json({ success: false, error: 'Failed to write file' });
            }
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async loadTimeline(req: Request, res: Response): Promise<void> {
        try {
            const data = this.timelineService.loadTimeline();
            if (data) {
                res.json({ success: true, timeline: data });
            } else {
                // Return empty default if no file exists yet
                res.json({ success: true, timeline: null, message: 'No saved timeline found' });
            }
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }
}
