import { Router } from 'express';
import { TimelineController } from '../controllers/TimelineController';

export function createTimelineRoutes(): Router {
    const router = Router();
    const controller = new TimelineController();

    router.post('/timeline', controller.saveTimeline);
    router.get('/timeline', controller.loadTimeline);

    return router;
}
