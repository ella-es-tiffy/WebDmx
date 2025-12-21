/**
 * Fader Routes - Names, Assignments, Groups
 */
import { Router } from 'express';
import { FaderController } from '../controllers/FaderController';
import { IDmxController } from '../interfaces/IDmxController';

export function createFaderRoutes(dmxController?: IDmxController): Router {
    const router = Router();
    const controller = new FaderController(dmxController);

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
    // DMX Monitor
    router.get('/dmx-output', controller.getDmxOutput);

    // Global Palettes
    router.get('/faders/palettes', controller.getGlobalPalettes);
    router.post('/faders/palettes', controller.saveGlobalPalette);
    router.post('/faders/palettes/create', controller.createGlobalPalette);
    router.delete('/faders/palettes/:id', controller.deleteGlobalPalette);
    router.get('/faders/all-assignments', controller.getAllAssignments);

    // Chasers (Gradients)
    router.get('/faders/chasers', controller.getChasers.bind(controller));
    router.post('/faders/chasers', controller.updateChaser.bind(controller));

    return router;
}
