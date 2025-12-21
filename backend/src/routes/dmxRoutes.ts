import { Router } from 'express';
import { DmxApiController } from '../controllers/DmxApiController';
import { DmxController } from '../dmx/DmxController';

/**
 * Create DMX routes
 */
export function createDmxRoutes(dmxController: DmxController): Router {
    const router = Router();
    const controller = new DmxApiController(dmxController);

    router.get('/status', controller.getStatus);
    router.get('/channels', controller.getAllChannels);
    router.get('/channel/:channel', controller.getChannel);
    router.post('/channel', controller.setChannel);
    router.post('/channels', controller.setChannels);
    router.post('/batch', controller.setBatch);
    router.post('/blackout', controller.blackout);

    return router;
}
