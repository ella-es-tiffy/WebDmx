/**
 * Cue Editor - DAW Style Timeline (v15)
 * Professional show control with drag & drop, playback, and timeline editing
 */

const API = `http://${window.location.hostname}:3000`;
const LEFT_MARGIN = 100; // Track Label Width + Padding

class CueEditor {
    constructor() {
        this.scenes = [];
        this.tracks = [];
        this.cues = [];
        this.isPlaying = false;
        this.isPaused = false;
        this.currentTime = 0;
        this.speed = 1.0;
        this.loop = false;
        this.pixelsPerSecond = 50; // Timeline zoom
        this.maxTime = 60; // 60 seconds default
        this.animationFrameId = null;
        this.lastFrameTime = 0;
        this.selectedCue = null;
        this.snapGrid = 0.1; // Snap to 0.1s

        this.cueElements = new Map();
        this.activeCues = new Set();
        this.runningChasers = [];

        this.init();
    }

    init() {
        console.log('🎬 Initializing Cue Editor...');
        this.dragState = {
            active: false,
            cue: null,
            startX: 0,
            originalTime: 0,
            trackId: null,
            element: null,
            group: [],
            lastSnapSource: null
        };
        this.initAsync();
    }

    async initAsync() {
        try {
            await this.loadScenes();
            await this.loadPatch(); // Load devices and assignments
            this.addTrack(false);
            this.addTrack(false);
            this.addTrack(false);

            this.renderTracks();
            this.renderTimeline();
            this.renderScenePool();
            this.renderOverlay();
            this.attachEvents();

            this.updatePlayhead();

            console.log('✅ Cue Editor initialized successfully');
        } catch (e) {
            console.error('❌ Critical Error initializing Cue Editor:', e);
            alert(`Error initializing editor: ${e.message}`);
        }
    }

    renderOverlay() {
        const overlay = document.createElement('div');
        overlay.className = 'keybind-overlay';
        overlay.innerHTML = `
            <div class="keybind-row">
                <span>Move Linked</span>
                <span class="keybind-key">Drag</span>
            </div>
             <div class="keybind-row">
                <span>Free / Detach</span>
                <span class="keybind-key">Ctrl</span>
            </div>
             <div class="keybind-row">
                <span>Change Track</span>
                <span class="keybind-key">Shift</span>
            </div>
             <div class="keybind-row">
                <span>Play / Pause</span>
                <span class="keybind-key">Space</span>
            </div>
             <div class="keybind-row">
                <span>Delete</span>
                <span class="keybind-key">⌫</span>
            </div>
             <div class="keybind-row">
                <span>Pan Timeline</span>
                <span class="keybind-key">M + Drag</span>
            </div>
             <div class="keybind-row">
                <span>Zoom</span>
                <span class="keybind-key">Z + Scroll</span>
            </div>
             <div class="keybind-row">
                <span>Clone (Chaser)</span>
                <span class="keybind-key">Right Handle</span>
            </div>
        `;
        document.querySelector('.cue-editor-container').appendChild(overlay);
    }

    attachEvents() {
        document.addEventListener('mousemove', (e) => this.handleGlobalMouseMove(e));
        document.addEventListener('mouseup', (e) => this.handleGlobalMouseUp(e));
        document.addEventListener('contextmenu', (e) => { if (e.ctrlKey || this.dragState.active) e.preventDefault(); });

        const bindBtn = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
        bindBtn('btn-play', () => this.play());
        // ... (existing binds) ...
        bindBtn('btn-pause', () => this.pause());
        bindBtn('btn-stop', () => this.stop());
        bindBtn('btn-prev', () => this.prevCue());
        bindBtn('btn-next', () => this.nextCue());
        bindBtn('btn-loop', () => this.toggleLoop());
        bindBtn('add-track-btn', () => this.addTrack());
        bindBtn('clear-timeline-btn', () => this.clearTimeline());
        bindBtn('save-show-btn', () => this.saveShow());
        bindBtn('close-btn', () => window.location.href = 'dashboard.php');
        bindBtn('cancel-cue-btn', () => this.hideCueModal());
        bindBtn('delete-cue-btn', () => this.deleteSelectedCue());

        const speedSlider = document.getElementById('speed-slider');
        if (speedSlider) {
            speedSlider.oninput = (e) => {
                this.speed = parseFloat(e.target.value);
                document.getElementById('speed-value').textContent = `${this.speed.toFixed(1)}x`;
            };
        }

        // Zoom Logic
        const zoomSlider = document.getElementById('zoom-slider');
        if (zoomSlider) {
            zoomSlider.value = this.pixelsPerSecond;
            zoomSlider.oninput = (e) => this.setZoom(parseFloat(e.target.value));
        }

        // Z+Scroll Zoom
        document.addEventListener('wheel', (e) => {
            if (e.key === 'z' || this.keysPressed['z']) { // Need to track keys or check KeyZ if available in event? 
                // Standard WheelEvent doesn't show key state directly for 'z'. Only ctrl/shift/alt.
                // We need to track 'z' state via keydown/keyup.
            }
        }, { passive: false });

        // Pan (Scroll) Logic
        const timelineArea = document.querySelector('.timeline-area');
        if (timelineArea) {
            timelineArea.addEventListener('mousedown', (e) => {
                if ((e.key === 'm' || this.keysPressed['m']) && !this.dragState.active) {
                    e.preventDefault();
                    this.dragState = {
                        active: true,
                        mode: 'pan',
                        startX: e.clientX,
                        scrollStart: timelineArea.scrollLeft
                    };
                    timelineArea.style.cursor = 'grabbing';
                }
            });
        }

        // Tracking keys specifically for modifiers like Z and M
        this.keysPressed = {};
        document.addEventListener('keydown', (e) => {
            const key = e.key.toLowerCase();
            this.keysPressed[key] = true;

            if (key === 'm' && !this.dragState.active) {
                const area = document.querySelector('.timeline-area');
                if (area) area.style.cursor = 'grab';
            }

            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            // ... existing keydown ...
            switch (e.code) {
                // ...
            }
        });
        document.addEventListener('keyup', (e) => {
            const key = e.key.toLowerCase();
            this.keysPressed[key] = false;

            if (key === 'm') {
                const area = document.querySelector('.timeline-area');
                if (area) {
                    area.style.cursor = 'default';
                    if (this.dragState.mode === 'pan') area.style.cursor = 'grabbing';
                }
            }
        });

        // The real wheel handler
        document.addEventListener('wheel', (e) => {
            if (this.keysPressed['z']) {
                e.preventDefault();
                const delta = Math.sign(e.deltaY) * -10; // Scroll UP = Zoom IN
                let newZoom = this.pixelsPerSecond + delta;
                newZoom = Math.max(20, Math.min(300, newZoom));
                this.setZoom(newZoom);
            }
        }, { passive: false });


        // Context Menu Global Click to Close
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.context-menu')) this.hideContextMenu();
        });

        // Bind Context Menu Actions
        const bindCtx = (id, fn) => {
            const el = document.getElementById(id);
            if (el) el.onclick = () => {
                const activeCue = this.contextCue; // Capture it!
                this.hideContextMenu();
                fn(activeCue);
            };
        };

        bindCtx('ctx-edit', (cue) => { if (cue) this.editCue(cue); });

        bindCtx('ctx-reverse', (cue) => {
            if (cue) {
                cue.reverse = !cue.reverse;
                this.renderCues();
            }
        });

        bindCtx('ctx-clone', (cue) => {
            if (cue) {
                const src = cue;
                const newStart = src.startTime + src.duration;
                this.createCue(src.trackId, src.sceneId, src.sceneName, newStart, src.duration, true);
            }
        });

        bindCtx('ctx-delete', (cue) => {
            if (cue) {
                this.selectedCue = cue;
                this.deleteSelectedCue();
            }
        });
    }

    setZoom(pps) {
        this.pixelsPerSecond = pps;
        const slider = document.getElementById('zoom-slider');
        if (slider) slider.value = pps;

        this.renderTimeline();
        this.renderCues();
        this.updatePlayhead();
    }

    showContextMenu(e, cue) {
        e.preventDefault();
        this.contextCue = cue;
        const menu = document.getElementById('context-menu');
        if (!menu) return;

        // Simple positioning
        menu.style.left = `${e.clientX}px`;
        menu.style.top = `${e.clientY}px`;
        menu.style.display = 'block';
    }

    hideContextMenu() {
        const menu = document.getElementById('context-menu');
        if (menu) menu.style.display = 'none';
        this.contextCue = null;
    }

    findConnectedGroup(startCue) {
        const group = new Set([startCue]);
        const trackCues = this.cues.filter(c => c.trackId === startCue.trackId);
        const queue = [startCue];
        while (queue.length > 0) {
            const current = queue.pop();
            const start = current.startTime;
            const end = current.startTime + current.duration;
            const neighbors = trackCues.filter(c => !group.has(c) && (Math.abs(c.startTime + c.duration - start) < 0.05 || Math.abs(c.startTime - end) < 0.05));
            neighbors.forEach(n => { group.add(n); queue.push(n); });
        }
        return Array.from(group).map(c => ({ cue: c, originalTime: c.startTime }));
    }

    handleResizeMouseDown(e, cue, element) {
        e.stopPropagation();
        e.preventDefault();

        // "Clone Drag" Mode
        this.dragState = {
            active: true,
            mode: 'clone-drag',
            sourceCue: cue,
            startX: e.clientX,
            ghosts: [], // Array of temporary ghost elements
            cloneCount: 0
        };

        console.log('👯 Clone Drag Started');
    }

    handleCueMouseDown(e, cue, element) {
        e.stopPropagation();
        if (e.target.classList.contains('cue-resize-handle')) return;

        const isCtrl = e.ctrlKey || e.metaKey;
        const group = isCtrl ? [{ cue, originalTime: cue.startTime }] : this.findConnectedGroup(cue);

        this.dragState = {
            active: true,
            mode: 'move',
            cue: cue,
            startX: e.clientX,
            originalTime: cue.startTime,
            trackId: cue.trackId,
            element: element,
            group: group
        };

        element.classList.add('dragging');
        group.forEach(g => {
            const el = this.cueElements.get(g.cue.id);
            if (el) el.classList.add('dragging');
        });

        this.selectedCue = cue;
        this.highlightSelectedCue();
    }

    handlePoolMouseDown(e, scene) {
        e.stopPropagation();
        e.preventDefault();
        const ghost = document.createElement('div');
        ghost.className = 'cue-block dragging-ghost';
        ghost.textContent = scene.name;

        // Calculate width for ghost based on duration
        let dur = 5;
        if (scene.duration !== undefined && scene.duration !== null) {
            dur = parseFloat(scene.duration) / 1000;
        }
        if (isNaN(dur) || dur <= 0) dur = 5;

        ghost.style.position = 'fixed';
        ghost.style.width = `${dur * this.pixelsPerSecond}px`;
        ghost.style.height = '40px';
        ghost.style.height = '40px';

        // Color based on type
        let isChaser = scene.type === 'chaser';
        if (!isChaser && scene.channel_data && !Array.isArray(scene.channel_data)) {
            if (scene.channel_data.start_color || scene.channel_data.fade_time) isChaser = true;
        }
        ghost.style.background = isChaser ? 'rgba(255, 153, 0, 0.8)' : '#4488ff';
        ghost.style.borderColor = isChaser ? '#ff9900' : '#4488ff';
        ghost.style.borderWidth = '2px';
        ghost.style.borderStyle = 'solid';

        ghost.style.opacity = '0.9';
        ghost.style.pointerEvents = 'none';
        ghost.style.zIndex = '9999';
        ghost.style.left = `${e.clientX}px`;
        ghost.style.top = `${e.clientY}px`;
        document.body.appendChild(ghost);

        this.dragState = {
            active: true,
            mode: 'create',
            scene: scene,
            ghostElement: ghost,
            startX: e.clientX,
            offsetY: 20
        };
    }

    handleGlobalMouseMove(e) {
        if (!this.dragState.active) return;
        if (e.ctrlKey) e.preventDefault();

        if (this.dragState.mode === 'move') {
            const deltaX = e.clientX - this.dragState.startX;
            const deltaSeconds = deltaX / this.pixelsPerSecond;
            let rawTargetTime = this.dragState.originalTime + deltaSeconds;

            const isCtrl = e.ctrlKey || e.metaKey;
            let finalTime = rawTargetTime;

            if (!isCtrl) {
                const selfDuration = this.dragState.cue.duration;
                const rawTargetEnd = rawTargetTime + selfDuration;
                const myCenterRaw = rawTargetTime + (selfDuration / 2);

                let candidates = [];

                // 1. Grid Snap
                const gridSnapStart = Math.round(rawTargetTime / this.snapGrid) * this.snapGrid;
                candidates.push({ time: gridSnapStart, dist: Math.abs(gridSnapStart - rawTargetTime), type: 'grid' });

                // 2. Object Snap
                const currentTrackId = this.dragState.cue.trackId;
                const ignoreIds = this.dragState.group.map(g => g.cue.id);
                const otherCues = this.cues.filter(c => c.trackId === currentTrackId && !ignoreIds.includes(c.id));
                const snapThreshold = 15 / this.pixelsPerSecond;

                otherCues.forEach(other => {
                    const oStart = other.startTime;
                    const oEnd = other.startTime + other.duration;
                    const oCenter = other.startTime + (other.duration / 2);

                    const isLeft = myCenterRaw < oCenter;

                    if (isLeft) {
                        if (Math.abs(oStart - rawTargetTime) < snapThreshold) candidates.push({ time: oStart, dist: Math.abs(oStart - rawTargetTime), type: 'obj-start-start' });
                        const snapPosForEndToStart = oStart - selfDuration;
                        if (Math.abs(rawTargetEnd - oStart) < snapThreshold) candidates.push({ time: snapPosForEndToStart, dist: Math.abs(rawTargetEnd - oStart), type: 'obj-end-start' });
                    } else {
                        if (Math.abs(oEnd - rawTargetTime) < snapThreshold) candidates.push({ time: oEnd, dist: Math.abs(oEnd - rawTargetTime), type: 'obj-start-end' });
                        const snapPosForEndToEnd = oEnd - selfDuration;
                        if (Math.abs(rawTargetEnd - oEnd) < snapThreshold) candidates.push({ time: snapPosForEndToEnd, dist: Math.abs(rawTargetEnd - oEnd), type: 'obj-end-end' });
                    }
                });

                candidates.sort((a, b) => a.dist - b.dist);
                if (candidates.length > 0 && candidates[0].dist < snapThreshold) {
                    finalTime = candidates[0].time;
                }
            }

            finalTime = Math.max(0, finalTime);
            const snapDelta = finalTime - this.dragState.originalTime;

            this.dragState.group.forEach(item => {
                const newTime = Math.max(0, item.originalTime + snapDelta);
                item.cue.startTime = newTime;
                const el = this.cueElements.get(item.cue.id);
                if (el) el.style.left = `${newTime * this.pixelsPerSecond}px`;
            });

            if (e.shiftKey) {
                const dropTarget = document.elementFromPoint(e.clientX, e.clientY);
                const trackEl = dropTarget ? dropTarget.closest('.track-content') : null;
                if (trackEl && trackEl.parentElement) {
                    const newTrackId = parseInt(trackEl.parentElement.dataset.trackId);
                    if (newTrackId !== this.dragState.trackId) {
                        this.dragState.trackId = newTrackId;
                        this.dragState.group.forEach(item => {
                            item.cue.trackId = newTrackId;
                            const el = this.cueElements.get(item.cue.id);
                            if (el && trackEl !== el.parentElement) trackEl.appendChild(el);
                        });
                    }
                }
            }

        } else if (this.dragState.mode === 'create') {
            const ghost = this.dragState.ghostElement;
            ghost.style.left = `${e.clientX}px`;
            ghost.style.top = `${e.clientY - this.dragState.offsetY}px`;
        } else if (this.dragState.mode === 'clone-drag') {
            const deltaX = Math.max(0, e.clientX - this.dragState.startX);
            const deltaSeconds = deltaX / this.pixelsPerSecond;
            const dur = this.dragState.sourceCue.duration;

            // Calculate how many clones fit - Increased Sensitivity
            // Trigger next clone at 20% of duration drag
            const triggerThreshold = 0.2;
            const newCloneCount = Math.floor((deltaSeconds + (dur * (1 - triggerThreshold))) / dur);

            if (newCloneCount !== this.dragState.cloneCount) {
                // Sync Ghosts
                // Add needed
                while (this.dragState.ghosts.length < newCloneCount) {
                    const i = this.dragState.ghosts.length;
                    const ghost = document.createElement('div');
                    ghost.className = 'cue-block ghost-clone';
                    ghost.style.position = 'absolute';
                    ghost.style.height = '50px'; // Match track heighish
                    ghost.style.top = '5px';
                    ghost.style.opacity = '0.5';
                    ghost.style.pointerEvents = 'none';
                    ghost.style.background = '#4CAF50'; // Green for 'Add'
                    ghost.style.border = '1px dashed #fff';

                    // Position: Start of source + Duration * (i+1)
                    const startT = this.dragState.sourceCue.startTime + (dur * (i + 1));
                    ghost.style.left = `${startT * this.pixelsPerSecond}px`;
                    ghost.style.width = `${dur * this.pixelsPerSecond}px`;

                    // Find track element to append to
                    const trackEl = this.cueElements.get(this.dragState.sourceCue.id).parentElement;
                    trackEl.appendChild(ghost);
                    this.dragState.ghosts.push(ghost);
                }

                // Remove excess
                while (this.dragState.ghosts.length > newCloneCount) {
                    const ghost = this.dragState.ghosts.pop();
                    ghost.remove();
                }

                this.dragState.cloneCount = newCloneCount;
            }

        } else if (this.dragState.mode === 'pan') {
            const area = document.querySelector('.timeline-area');
            if (area) {
                const deltaX = e.clientX - this.dragState.startX;
                area.scrollLeft = this.dragState.scrollStart - deltaX;
            }
        } else if (this.dragState.mode === 'scrub') {
            this.scrubTo(e.clientX);
        }
    }

    scrubTo(clientX) {
        const container = document.getElementById('lines-container') || document.getElementById('tracks-container');
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const relativeX = clientX - rect.left - LEFT_MARGIN;
        let time = relativeX / this.pixelsPerSecond;
        time = Math.max(0, Math.min(time, this.maxTime)); // Clamp

        this.currentTime = time;
        this.updatePlayhead();
        this.checkCues();
        this.updateChasers();
    }

    handleGlobalMouseUp(e) {
        if (!this.dragState.active) return;
        const isCtrl = e.ctrlKey || e.metaKey;

        if (this.dragState.mode === 'move') {
            this.dragState.group.forEach(item => {
                const el = this.cueElements.get(item.cue.id);
                if (el) el.classList.remove('dragging');
            });

            if (!isCtrl) {
                this.dragState.group.forEach(item => {
                    this.resolveCollisions(item.cue, this.dragState.group.map(g => g.cue.id));
                });
            }
            this.renderCues();
            if (e.shiftKey) this.renderTracks();

        } else if (this.dragState.mode === 'create') {
            // (Existing create logic...)
            const ghost = this.dragState.ghostElement;
            ghost.remove();

            const dropTarget = document.elementFromPoint(e.clientX, e.clientY);
            let trackEl = dropTarget ? dropTarget.closest('.track-content') : null;
            if (!trackEl && dropTarget) {
                const trackContainer = dropTarget.closest('.track');
                if (trackContainer) trackEl = trackContainer.querySelector('.track-content');
            }

            if (trackEl && trackEl.parentElement) {
                const trackId = parseInt(trackEl.parentElement.dataset.trackId);
                const rect = trackEl.getBoundingClientRect();
                const x = e.clientX - rect.left;
                let startTime = x / this.pixelsPerSecond;

                if (!e.shiftKey) startTime = Math.round(startTime / this.snapGrid) * this.snapGrid;
                startTime = Math.max(0, startTime);

                const scene = this.dragState.scene;
                let dur = 5;
                if (scene.duration !== undefined && scene.duration !== null) {
                    dur = parseFloat(scene.duration) / 1000;
                }
                if (isNaN(dur) || dur <= 0) dur = 5;

                this.createCue(trackId, scene.id, scene.name, startTime, dur, isCtrl);
            }
        } else if (this.dragState.mode === 'resize') {
            const cue = this.dragState.cue;
            // Resolve collisions if expanded into another cue?
            // For now, let's just render. Collisions might overlap, which is strictly allowed but maybe not desired.
            // A simple implementation:
            this.resolveCollisions(cue);
            this.renderCues();
        } else if (this.dragState.mode === 'clone-drag') {
            const count = this.dragState.cloneCount;
            const src = this.dragState.sourceCue;

            // Commit clones
            for (let i = 0; i < count; i++) {
                const newStart = src.startTime + (src.duration * (i + 1));
                this.createCue(src.trackId, src.sceneId, src.sceneName, newStart, src.duration, true); // ignoreCollisions=true initially
            }

            // Cleanup ghosts
            this.dragState.ghosts.forEach(g => g.remove());

            // Re-render to show real cues
            this.renderCues();
        }

        this.dragState = { active: false };
    }

    resolveCollisions(movedCue, ignoreIds = []) {
        let trackCues = this.cues.filter(c => c.trackId === movedCue.trackId && c.id !== movedCue.id && !ignoreIds.includes(c.id));
        trackCues.sort((a, b) => a.startTime - b.startTime);
        let cursor = movedCue.startTime + movedCue.duration;
        for (let cue of trackCues) {
            if (cue.startTime + cue.duration > movedCue.startTime) {
                if (cue.startTime < cursor + 0.001) {
                    cue.startTime = cursor;
                    cursor = cue.startTime + cue.duration;
                }
            }
        }
    }

    async loadScenes() {
        try {
            const res = await fetch(`${API}/api/scenes`);
            // Backend might return array directly or {success:true, scenes:[]}
            // Based on previous code snippet, it seemed to handle raw array? No, checking previous view... 
            // "res.json(rows)" in controller means it returns array directly.
            // But code I saw earlier had "if (data.success) this.scenes = data.scenes".
            // Let's support both to be safe.
            const data = await res.json();
            this.scenes = Array.isArray(data) ? data : (data.scenes || []);

            // Parse channel_data globally
            this.scenes.forEach(s => {
                if (typeof s.channel_data === 'string') {
                    try { s.channel_data = JSON.parse(s.channel_data); }
                    catch (e) { console.error('JSON Parse error for scene', s.name, e); }
                }
            });

            console.log(`🎬 Loaded ${this.scenes.length} scenes.`);
        } catch (e) {
            console.error('Failed to load scenes:', e);
        }
    }

    async loadPatch() {
        try {
            // Load Devices
            const devRes = await fetch(`${API}/api/devices`);
            this.devices = await devRes.json();

            // Load Assignments
            const assignRes = await fetch(`${API}/api/faders/all-assignments`);
            const assignData = await assignRes.json();
            // Backend returns 'mapping', not 'assignments'
            this.assignments = assignData.success ? (assignData.mapping || assignData.assignments || {}) : {};

            console.log('🔌 Patch Loaded:', { devices: this.devices.length, assignments: Object.keys(this.assignments).length });
        } catch (e) {
            console.error('Failed to load patch:', e);
        }
    }

    renderScenePool() {
        const container = document.getElementById('scene-pool');
        if (!container) return;
        container.innerHTML = '';
        this.scenes.forEach(scene => {
            const item = document.createElement('div');
            item.className = 'pool-scene';

            // Determine type for styling
            let isChaser = scene.type === 'chaser';
            if (!isChaser && scene.channel_data && !Array.isArray(scene.channel_data)) {
                if (scene.channel_data.start_color || scene.channel_data.fade_time) isChaser = true;
            }

            if (isChaser) item.classList.add('chaser');
            else item.classList.add('static');

            // content
            item.innerHTML = `
                <div class="pool-scene-name" title="${scene.name}">${scene.name}</div>
                <div class="pool-scene-type">${isChaser ? 'CHASER' : 'STATIC'}</div>
            `;

            item.draggable = false;
            item.addEventListener('mousedown', (e) => this.handlePoolMouseDown(e, scene));
            container.appendChild(item);
        });
    }

    renderTimeline() {
        const ruler = document.getElementById('time-ruler') || document.getElementById('timeline-ruler');
        const tracksContainer = document.getElementById('lines-container') || document.getElementById('tracks-container');
        if (!ruler) return;

        ruler.innerHTML = '';
        // Note: Ruler width might be handled by CSS or container.
        // ruler.style.width = ... 

        // Remove old grid lines if any
        if (tracksContainer) {
            const oldGrid = tracksContainer.querySelectorAll('.grid-line');
            oldGrid.forEach(el => el.remove());
        }

        for (let i = 0; i <= this.maxTime; i += 0.5) {
            const pos = (i * this.pixelsPerSecond) + LEFT_MARGIN;
            const isSecond = Math.abs(i % 1) < 0.001;

            const marker = document.createElement('div');
            marker.className = isSecond ? 'time-marker major' : 'time-marker minor';
            marker.style.left = `${pos}px`;
            if (isSecond) marker.dataset.label = `${Math.round(i)}s`;
            ruler.appendChild(marker);

            // Removed grid lines as requested
        }
    }

    addTrack(render = true) {
        const trackId = this.tracks.length + 1;
        this.tracks.push({ id: trackId, name: `Track ${trackId}`, cues: [], muted: false });
        if (render) this.renderTracks();
    }

    toggleMute(trackId) {
        const track = this.tracks.find(t => t.id === trackId);
        if (track) {
            track.muted = !track.muted;
            this.renderTracks();
        }
    }

    renderTracks() {
        const container = document.getElementById('tracks-container');
        if (!container) return;
        container.innerHTML = '';
        container.style.width = `${(this.maxTime * this.pixelsPerSecond) + LEFT_MARGIN}px`;

        this.tracks.forEach(track => {
            const trackEl = document.createElement('div');
            trackEl.className = 'track';
            trackEl.dataset.trackId = track.id;

            // Track Label with Mute Button
            const label = document.createElement('div');
            label.className = 'track-label';

            const nameSpan = document.createElement('span');
            nameSpan.textContent = track.name;

            const muteBtn = document.createElement('button');
            muteBtn.className = `mute-btn ${track.muted ? 'active' : ''}`;
            muteBtn.textContent = 'M';
            muteBtn.title = 'Mute/Unmute';
            muteBtn.onclick = (e) => {
                e.stopPropagation();
                this.toggleMute(track.id);
            };

            label.appendChild(nameSpan);
            label.appendChild(muteBtn);

            const content = document.createElement('div');
            content.className = 'track-content';
            content.ondragover = (e) => e.preventDefault();

            // Visual feedback for Mute
            if (track.muted) {
                content.style.opacity = '0.5';
                content.style.background = 'repeating-linear-gradient(45deg, rgba(0,0,0,0), rgba(0,0,0,0) 10px, rgba(255,0,0,0.05) 10px, rgba(255,0,0,0.05) 20px)';
            }

            trackEl.appendChild(label);
            trackEl.appendChild(content);
            container.appendChild(trackEl);
        });
        this.renderCues();
    }

    createCue(trackId, sceneId, sceneName, startTime, duration = 5, ignoreCollisions = false) {
        const cue = { id: Date.now(), trackId, sceneId, sceneName, startTime, duration, fadeIn: 0, fadeOut: 0, reverse: false };
        this.cues.push(cue);
        if (!ignoreCollisions) this.resolveCollisions(cue);
        this.renderCues();
    }

    renderCues() {
        const existingCueIds = new Set(this.cueElements.keys());
        const currentCueIds = new Set(this.cues.map(c => c.id));
        for (const cueId of existingCueIds) {
            if (!currentCueIds.has(cueId)) {
                const element = this.cueElements.get(cueId);
                if (element && element.parentNode) element.remove();
                this.cueElements.delete(cueId);
            }
        }
        this.cues.forEach(cue => {
            let block = this.cueElements.get(cue.id);
            const track = document.querySelector(`[data-track-id="${cue.trackId}"] .track-content`);
            if (!track) return;
            if (!block) {
                block = document.createElement('div');
                block.className = 'cue-block';
                block.dataset.cueId = cue.id;
                block.innerHTML = `<div class="cue-block-name"></div><div class="cue-block-time"></div><div class="cue-resize-handle"></div>`;
                block.setAttribute('draggable', 'false');
                block.ondragstart = (e) => { e.preventDefault(); return false; };

                // Mouse Events
                block.addEventListener('mousedown', (e) => this.handleCueMouseDown(e, cue, block));
                block.addEventListener('dblclick', () => this.editCue(cue));
                // Context Menu
                block.addEventListener('contextmenu', (e) => this.showContextMenu(e, cue));

                // Specific Resize Handler
                const handle = block.querySelector('.cue-resize-handle');
                handle.addEventListener('mousedown', (e) => this.handleResizeMouseDown(e, cue, block));

                track.appendChild(block);
                this.cueElements.set(cue.id, block);
            } else {
                if (block.parentElement !== track) track.appendChild(block);
            }

            const newLeft = `${cue.startTime * this.pixelsPerSecond}px`;
            const newWidth = `${cue.duration * this.pixelsPerSecond}px`;
            // Only update DOM if changed
            if (block.style.left !== newLeft) block.style.left = newLeft;
            if (block.style.width !== newWidth) block.style.width = newWidth;

            // Text Content (could optimize to check before write, but cheap enough)
            let displayName = cue.sceneName;
            if (cue.reverse) displayName += ' ⏪';

            block.querySelector('.cue-block-name').textContent = displayName;
            block.querySelector('.cue-block-time').textContent = `${cue.startTime.toFixed(2)}s`;

            if (this.selectedCue && this.selectedCue.id === cue.id) block.classList.add('selected');
            else block.classList.remove('selected');

            // --- Chaser Styling Update (Always Run) ---
            const scene = this.scenes.find(s => s.id === cue.sceneId);
            let isChaser = false;
            if (scene) {
                isChaser = scene.type === 'chaser';
                // Robust Check (data is already parsed in loadScenes)
                if (!isChaser && scene.channel_data && !Array.isArray(scene.channel_data)) {
                    if (scene.channel_data.start_color || scene.channel_data.fade_time) isChaser = true;
                }
            }
            if (isChaser) block.classList.add('chaser');
            else block.classList.remove('chaser');
        });
    }

    // ... Standard methods ...
    editCue(cue) {
        try {
            console.log('✏️ Edit Cue:', cue);
            this.selectedCue = cue;
            this.highlightSelectedCue();

            const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
            setVal('cue-name', cue.sceneName);
            setVal('cue-start', cue.startTime);
            setVal('cue-duration', cue.duration);
            setVal('cue-fade-in', cue.fadeIn);
            setVal('cue-fade-out', cue.fadeOut);

            const revEl = document.getElementById('cue-reverse');
            if (revEl) revEl.checked = cue.reverse || false;

            const modal = document.getElementById('cue-modal');
            if (modal) modal.classList.add('active');
            else console.error('Modal element not found!');
        } catch (e) {
            console.error('Error opening cue editor:', e);
        }
    }
    highlightSelectedCue() { this.renderCues(); }
    hideCueModal() { document.getElementById('cue-modal').classList.remove('active'); this.selectedCue = null; }
    saveCueProperties() {
        if (!this.selectedCue) return;
        this.selectedCue.startTime = parseFloat(document.getElementById('cue-start').value);
        this.selectedCue.duration = parseFloat(document.getElementById('cue-duration').value);
        this.selectedCue.fadeIn = parseFloat(document.getElementById('cue-fade-in').value);
        this.selectedCue.fadeOut = parseFloat(document.getElementById('cue-fade-out').value);
        this.selectedCue.reverse = document.getElementById('cue-reverse').checked; // NEW
        this.resolveCollisions(this.selectedCue);
        this.renderCues();
        this.hideCueModal();
    }
    deleteSelectedCue() {
        if (!this.selectedCue) return;
        this.cues = this.cues.filter(c => c.id !== this.selectedCue.id);
        this.renderCues();
        this.hideCueModal();
    }
    clearTimeline() { if (!confirm('Clear entire timeline?')) return; this.cues = []; this.renderCues(); }
    play() { if (this.isPlaying && !this.isPaused) return; this.isPlaying = true; this.isPaused = false; this.lastFrameTime = performance.now(); this.gameLoop(); }
    gameLoop() {
        if (!this.isPlaying) return;
        const now = performance.now();
        const deltaTime = (now - this.lastFrameTime) / 1000;
        this.lastFrameTime = now;
        this.currentTime += (deltaTime * this.speed);
        this.updatePlayhead();
        this.checkCues();
        this.updateChasers();

        // Calculate dynamic end of track
        let lastCueEnd = 0;
        if (this.cues.length > 0) {
            lastCueEnd = Math.max(...this.cues.map(c => c.startTime + c.duration));
        }

        // Stop or Loop at actual content end (plus small buffer)
        const stopPoint = Math.max(lastCueEnd + 0.5, this.maxTime); // Fallback to maxTime if timeline shorter
        // actually user wants to stop at LAST ELEMENT, not maxTime ruler.
        // "wenn der rote curser das ende also das letzt element erreicht hat"
        const exactStopPoint = lastCueEnd > 0 ? lastCueEnd : this.maxTime;

        if (this.currentTime >= exactStopPoint) {
            if (this.loop) {
                this.currentTime = 0;
            } else {
                this.stop();
                return;
            }
        }

        this.animationFrameId = requestAnimationFrame(() => this.gameLoop());
    }
    pause() { this.isPlaying = false; this.isPaused = true; if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId); }
    stop() {
        this.isPlaying = false;
        this.isPaused = false;
        this.currentTime = 0;
        if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
        this.cues.forEach(c => c.triggered = false);
        this.activeCues.clear();
        document.querySelectorAll('.cue-block.active').forEach(el => el.classList.remove('active'));
        this.runningChasers = []; // Stop all chasers
        this.updatePlayhead();
    }
    toggleLoop() { this.loop = !this.loop; document.getElementById('btn-loop').classList.toggle('active', this.loop); }

    updatePlayhead() {
        const playhead = document.getElementById('playhead');
        if (playhead) playhead.style.left = `${(this.currentTime * this.pixelsPerSecond) + LEFT_MARGIN}px`;
        const minutes = Math.floor(this.currentTime / 60);
        const seconds = (this.currentTime % 60).toFixed(1);
        const timeDisplay = document.getElementById('time-display');
        if (timeDisplay) timeDisplay.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(4, '0')}`;
    }

    async checkCues() {
        const newActiveCues = new Set();
        for (const cue of this.cues) {
            const track = this.tracks.find(t => t.id === cue.trackId);
            const isMuted = track ? track.muted : false;

            const cueStart = cue.startTime;
            const cueEnd = cue.startTime + cue.duration;

            // Check Mute before Active
            if (!isMuted && this.currentTime >= cueStart && this.currentTime < cueEnd) {
                newActiveCues.add(cue.id);
                if (!this.activeCues.has(cue.id)) { const block = this.cueElements.get(cue.id); if (block) block.classList.add('active'); }
                if (!cue.triggered) {
                    cue.triggered = true;
                    await this.recallScene(cue.sceneId, cue, cue.startTime); // Pass startTime
                }
            } else {
                if (this.activeCues.has(cue.id)) {
                    const block = this.cueElements.get(cue.id);
                    if (block) block.classList.remove('active');

                    // Stop Chaser if it was running
                    if (cue.activeChaserId) {
                        this.stopChaser(cue.activeChaserId);
                        cue.activeChaserId = null;
                    }
                }
                cue.triggered = false;
            }
        }
        this.activeCues = newActiveCues;
    }

    async recallScene(sceneId, cueRef, cueStartTime = 0) { // Accept startTime
        const scene = this.scenes.find(s => s.id === sceneId);
        if (!scene) return;

        try {
            let channelData = scene.channel_data;
            if (typeof channelData === 'string') channelData = JSON.parse(channelData);

            let isChaser = scene.type === 'chaser';

            // STRICT Fallback: Check for Chaser Object format
            if (!isChaser && !Array.isArray(channelData)) {
                // If it's an object, it MIGHT be sparse channel data OR a chaser config.
                // Chaser config usually has 'start_color', 'fade_time' etc.
                if (channelData.start_color || channelData.fade_time || channelData.mode) {
                    console.log(`⚠️ Scene ${scene.name} looks like a Chaser. Treating as Chaser.`);
                    isChaser = true;
                }
            }

            if (isChaser) {
                // --- CHASER PLAYBACK ---
                if (!this.runningChasers.find(c => c.id.startsWith(sceneId + '_'))) { // avoid dupes if triggered multiple times
                    console.log(`🏃‍♂️ Playing Chaser Cue: ${scene.name} @ ${cueStartTime}s`);
                    this.startChaser(sceneId, channelData, cueRef, cueStartTime);
                }
            } else {
                // --- STATIC SCENE PLAYBACK ---
                // Normalize data to a 512-integer array for the batch endpoint
                let finalChannels = new Array(512).fill(0);
                let hasData = false;

                if (Array.isArray(channelData)) {
                    // Case 1: Array of Numbers (Dense)
                    if (typeof channelData[0] === 'number') {
                        finalChannels = channelData.slice(0, 512); // Truncate if too long
                        // Pad if too short? Usually batch replaces 1..N.
                        // Ideally we send exactly what we have? 
                        // DmxController.setChannels(1, val) replaces starting at 1.
                        // If we want a full scene recall (overwrite), we should probably send 512.
                        // If the saved array is short (e.g. 10 channels), sending just 10 is fine too.
                        finalChannels = channelData;
                        hasData = true;
                    }
                    // Case 2: Array of Objects [{channel: 1, value: 255}]
                    else if (typeof channelData[0] === 'object') {
                        channelData.forEach(item => {
                            if (item.channel && item.value !== undefined) {
                                if (item.channel >= 1 && item.channel <= 512) {
                                    finalChannels[item.channel - 1] = item.value;
                                    hasData = true;
                                }
                            }
                        });
                    }
                } else if (typeof channelData === 'object') {
                    // Case 3: Sparse Object { "1": 255, "5": 128 }
                    Object.entries(channelData).forEach(([ch, val]) => {
                        const chNum = parseInt(ch);
                        if (chNum >= 1 && chNum <= 512) {
                            finalChannels[chNum - 1] = parseInt(val);
                            hasData = true;
                        }
                    });
                }

                if (hasData) {
                    await fetch(`${API}/api/dmx/batch`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ channels: finalChannels })
                    });
                } else {
                    console.warn(`⚠️ Scene ${scene.name} has no valid DMX data.`);
                }
            }
        } catch (e) { console.error('Failed to recall scene:', e); }
    }

    // --- CHASER ENGINE ---
    startChaser(id, config, cueRef, cueStartTime) {
        if (!this.runningChasers) this.runningChasers = [];

        // Merge Cue properties into config
        const activeConfig = { ...config, reverse: cueRef.reverse || false };

        const chaserState = {
            id: id + '_' + Date.now(),
            config: activeConfig,
            cueStartTime: cueStartTime, // Store timeline start
            // lastTime: performance.now(), // No longer needed
            // phase: 0 // Calculated on fly
        };

        this.runningChasers.push(chaserState);
        cueRef.activeChaserId = chaserState.id;
    }

    stopChaser(runId) {
        if (!this.runningChasers) return;
        this.runningChasers = this.runningChasers.filter(c => c.id !== runId);
    }

    updateChasers() {
        if (!this.runningChasers || this.runningChasers.length === 0) return;

        // Use Timeline Time instead of System Time
        const currentMs = this.currentTime * 1000;

        this.runningChasers.forEach(chaser => {
            const state = chaser.config;
            const elapsed = Math.max(0, currentMs - (chaser.cueStartTime * 1000));

            // Fade Logic
            const currentFadeTime = parseInt(state.fade_time) || 1000;
            const cycleDuration = currentFadeTime * 2;

            // Deterministic Phase Calculation
            // Full cycle 0->1->2 (where 2 wraps to 0)
            const rawPhase = (elapsed / (currentFadeTime)) % 2;

            // rawPhase goes 0 -> 2. 
            // 0 -> 1 is Fade In (or A->B)
            // 1 -> 2 is Fade Out (or B->A)

            let progress;
            if (state.mode === 'pulse') {
                progress = (rawPhase < 1) ? rawPhase : 0;
            } else if (state.mode === 'strobe') {
                progress = (rawPhase < 1) ? 1 : 0;
            } else { // Linear / Default
                progress = (rawPhase < 1) ? rawPhase : (2 - rawPhase);
            }

            // --- Reverse Logic ---
            if (state.reverse) {
                progress = 1.0 - progress;
            }
            // ---------------------

            // Colors
            // console.log('Chaser State:', state);
            const startRGB = this.hexToRgb(state.start_color || '#000000');
            const endRGB = this.hexToRgb(state.end_color || '#000000');

            let r, g, b;
            if (state.color_fade_enabled) {
                r = Math.round(startRGB.r + (endRGB.r - startRGB.r) * progress);
                g = Math.round(startRGB.g + (endRGB.g - startRGB.g) * progress);
                b = Math.round(startRGB.b + (endRGB.b - startRGB.b) * progress);
            } else {
                r = startRGB.r;
                g = startRGB.g;
                b = startRGB.b;
            }

            // console.log(`RGB: ${r}, ${g}, ${b} | Progress: ${progress.toFixed(2)}`);

            // Apply to specific target fixtures
            const targetIds = state.targetFixtureIds || [];
            if (targetIds.length === 0) {
                // console.warn('No target fixtures for chaser!');
                return;
            }

            const batch = [];

            targetIds.forEach(fid => {
                const device = this.devices.find(d => d.id === fid);
                const devAssignments = this.assignments[fid];

                if (device && devAssignments) {
                    const startAddr = device.dmx_address;

                    Object.entries(devAssignments).forEach(([relCh, funcs]) => {
                        const relChNum = parseInt(relCh);
                        const absCh = startAddr + relChNum - 1;
                        if (absCh < 1 || absCh > 512) return;

                        const funcList = Array.isArray(funcs) ? funcs.map(f => f.toLowerCase()) : [];
                        // console.log(`Fixture ${fid} Ch ${relCh}:`, funcList);

                        // Color Logic
                        let val = -1;

                        // RGB
                        if (funcList.includes('r')) val = r;
                        else if (funcList.includes('g')) val = g;
                        else if (funcList.includes('b')) val = b;

                        // Dimmer
                        if (funcList.includes('dim')) {
                            if (state.dimmer_enabled) val = state.dimmer_value !== undefined ? state.dimmer_value : 255;
                        }

                        // Strobe
                        if (funcList.includes('strobe')) {
                            if (state.strobe_enabled) val = state.strobe_value !== undefined ? state.strobe_value : 0;
                        }

                        // W
                        if (funcList.includes('w')) {
                            if (state.w_enabled) val = state.dimmer_value !== undefined ? state.dimmer_value : 255;
                        }

                        // If value was set, add to batch
                        if (val !== -1) {
                            batch.push({ channel: absCh, value: val });
                        }
                    });
                } else {
                    // console.warn(`⚠️ device or assignments missing for ID ${fid}`, { device, devAssignments });
                }
            });

            // Send Batch
            if (batch.length > 0) {
                // console.log('Batch:', JSON.stringify(batch));
                this.sendBatchDMX(batch);
            } else {
                // console.warn('⚠️ Chaser running but batch is empty');
            }
        });
    }

    sendBatchDMX(channels) {
        // Simple throttle could be added here
        fetch(`${API}/api/dmx/batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channels: channels })
        }).catch(() => { });
    }

    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : { r: 0, g: 0, b: 0 };
    }
    prevCue() {
        const prevCues = this.cues.filter(c => c.startTime < this.currentTime).sort((a, b) => b.startTime - a.startTime);
        if (prevCues.length > 0) { this.currentTime = prevCues[0].startTime; this.updatePlayhead(); }
    }
    nextCue() {
        const nextCues = this.cues.filter(c => c.startTime > this.currentTime).sort((a, b) => a.startTime - b.startTime);
        if (nextCues.length > 0) { this.currentTime = nextCues[0].startTime; this.updatePlayhead(); }
    }
    async saveShow() {
        const showData = { tracks: this.tracks, cues: this.cues, maxTime: this.maxTime };
        console.log('Saving show:', showData);
        alert('Show saved! (TODO: Implement backend)');
    }
}

function startCueEditor() {
    console.log("DOM loaded, starting editor...");
    window.cueEditor = new CueEditor();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startCueEditor);
} else {
    startCueEditor();
}
