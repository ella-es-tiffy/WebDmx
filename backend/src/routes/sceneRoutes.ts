import { Router } from 'express';
import { SceneController } from '../controllers/SceneController';

const router = Router();
const sceneController = new SceneController();

// Scenes
router.get('/scenes', sceneController.getAllScenes);
router.post('/scenes', sceneController.createScene);
router.put('/scenes/:id', sceneController.updateScene);
router.delete('/scenes/:id', sceneController.deleteScene);

// Scene Folders
router.get('/scene-folders', sceneController.getAllFolders);
router.post('/scene-folders', sceneController.createFolder);

export default router;
