/**
 * Fader Routes
 */
import { Router } from 'express';
import { FaderController } from '../controllers/FaderController';

export function createFaderRoutes(): Router {
    const router = Router();
    const controller = new FaderController();

    // Fader names
    router.get('/faders', controller.getAllFaders);
    router.post('/faders/name', controller.updateFaderName);

    // Channel assignments (R,G,B,W,P,T)
    router.get('/faders/assignments/:fixtureId', controller.getChannelAssignments);
    router.post('/faders/assignments', controller.saveChannelAssignment);
    router.delete('/faders/assignments/:fixtureId/:channel', controller.deleteChannelAssignment);

    return router;
}
