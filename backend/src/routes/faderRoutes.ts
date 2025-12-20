/**
 * Fader Routes
 */
import { Router } from 'express';
import { FaderController } from '../controllers/FaderController';

export function createFaderRoutes(): Router {
    const router = Router();
    const controller = new FaderController();

    router.get('/faders', controller.getAllFaders);
    router.post('/faders/name', controller.updateFaderName);

    return router;
}
