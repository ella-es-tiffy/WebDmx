/**
 * Fader Routes - Names, Assignments, Groups
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

    // Channel groups (A,B,C)
    router.get('/faders/groups', controller.getChannelGroups);
    router.post('/faders/groups', controller.saveChannelGroup);

    // Channel states (ON, SELECT, Value)
    router.post('/faders/state', controller.saveChannelState);
    router.post('/faders/value', controller.saveFaderValue);
    router.post('/faders/color', controller.saveChannelColor);

    // Macros
    router.get('/faders/macros', controller.getMacros);
    router.post('/faders/macros', controller.updateMacro);

    // Presets
    router.get('/faders/presets', controller.getPresets);
    router.post('/faders/presets', controller.savePreset);
    router.post('/faders/presets/create', controller.createPreset);
    router.post('/faders/presets/rename', controller.updatePresetName);
    router.post('/faders/presets/delete', controller.deletePreset);

    return router;
}
