/**
 * Cue and Playback Routes
 */
import { Router } from 'express';
import { CueController } from '../controllers/CueController';
import { CueService } from '../services/CueService';
import { PlaybackEngine } from '../services/PlaybackEngine';
import { DmxController } from '../dmx/DmxController';

export function createCueRoutes(dmxController: DmxController): Router {
    const router = Router();

    // Initialize services
    const cueService = new CueService();
    const playbackEngine = new PlaybackEngine(dmxController);
    const controller = new CueController(cueService, playbackEngine, dmxController);

    // Cue CRUD
    router.get('/cues', controller.getAllCues);
    router.get('/cues/:id', controller.getCue);
    router.post('/cues', controller.createCue);
    router.put('/cues/:id', controller.updateCue);
    router.delete('/cues/:id', controller.deleteCue);
    router.post('/cues/record', controller.recordCue);

    // CueList CRUD
    router.get('/cuelists', controller.getAllCueLists);
    router.get('/cuelists/:id', controller.getCueList);
    router.post('/cuelists', controller.createCueList);
    router.put('/cuelists/:id', controller.updateCueList);
    router.delete('/cuelists/:id', controller.deleteCueList);

    // Playback Control
    router.post('/playback/load/:id', controller.loadCueList);
    router.post('/playback/start', controller.playbackStart);
    router.post('/playback/stop', controller.playbackStop);
    router.post('/playback/pause', controller.playbackPause);
    router.post('/playback/resume', controller.playbackResume);
    router.post('/playback/next', controller.playbackNext);
    router.post('/playback/previous', controller.playbackPrevious);
    router.post('/playback/goto/:cueNumber', controller.playbackGoTo);
    router.get('/playback/status', controller.playbackStatus);
    router.post('/playback/speed', controller.playbackSetSpeed);
    router.post('/playback/toggleloop', controller.playbackToggleLoop);

    return router;
}
