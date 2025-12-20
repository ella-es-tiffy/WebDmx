import { Router } from 'express';
import { DeviceController } from '../controllers/DeviceController';

/**
 * Create device routes
 */
export function createDeviceRoutes(): Router {
    const router = Router();
    const controller = new DeviceController();

    router.get('/', controller.getAll);
    router.get('/:id', controller.getById);
    router.post('/', controller.create);
    router.put('/:id', controller.update);
    router.delete('/:id', controller.delete);

    return router;
}
