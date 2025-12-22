import { Router } from 'express';
import { GroupController } from '../controllers/GroupController';

export function createGroupRoutes(): Router {
    const router = Router();
    const controller = new GroupController();

    router.get('/', controller.getAll);
    router.post('/', controller.create);
    router.put('/:id', controller.update);
    router.delete('/:id', controller.delete);

    return router;
}
