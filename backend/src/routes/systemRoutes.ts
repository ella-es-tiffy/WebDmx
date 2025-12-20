import { Router } from 'express';
import { SystemController } from '../controllers/SystemController';

/**
 * Create system routes
 */
export function createSystemRoutes(): Router {
    const router = Router();
    const controller = new SystemController();

    router.get('/status', controller.getStatus);
    router.post('/restart', controller.restart);
    router.post('/logs/clear', controller.clearLogs);
    router.get('/process-info', controller.getProcessInfo);

    return router;
}
