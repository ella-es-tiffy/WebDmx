import { Router } from 'express';
import { TemplateController } from '../controllers/TemplateController';

export function createTemplateRoutes(): Router {
    const router = Router();
    const controller = new TemplateController();

    router.get('/', controller.getAll);
    router.get('/:id', controller.getById);
    router.post('/', controller.create);
    router.put('/:id', controller.update);
    router.delete('/:id', controller.delete);

    return router;
}
