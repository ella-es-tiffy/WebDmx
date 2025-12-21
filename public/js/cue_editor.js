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
        `;
        document.querySelector('.cue-editor-container').appendChild(overlay);
    }

    attachEvents() {
        document.addEventListener('mousemove', (e) => this.handleGlobalMouseMove(e));
        document.addEventListener('mouseup', (e) => this.handleGlobalMouseUp(e));
        document.addEventListener('contextmenu', (e) => { if (e.ctrlKey || this.dragState.active) e.preventDefault(); });

        const bindBtn = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
        bindBtn('btn-play', () => this.play());
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

        const formCue = document.getElementById('cue-form');
        if (formCue) formCue.onsubmit = (e) => { e.preventDefault(); this.saveCueProperties(); };

        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            switch (e.code) {
                case 'Space': e.preventDefault(); this.togglePlay(); break;
                case 'Delete':
                case 'Backspace': if (this.selectedCue) { e.preventDefault(); this.deleteSelectedCue(); } break;
                case 'Escape': this.selectedCue = null; this.hideCueModal(); this.highlightSelectedCue(); break;
            }
        });
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
        ghost.style.background = '#4488ff';
        ghost.style.opacity = '0.8';
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
        }
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
            const ghost = this.dragState.ghostElement;
            ghost.remove();

            // Adjusted logic to find track element better
            const dropTarget = document.elementFromPoint(e.clientX, e.clientY);
            let trackEl = dropTarget ? dropTarget.closest('.track-content') : null;
            if (!trackEl && dropTarget) {
                // Maybe we hit the track-label? Or the track div itself?
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
                console.log('📦 Dropped Scene Data:', scene);

                // Robust duration calculation
                let dur = 5;
                if (scene.duration !== undefined && scene.duration !== null) {
                    dur = parseFloat(scene.duration) / 1000;
                }
                if (isNaN(dur) || dur <= 0) dur = 5;

                console.log(`⏱ calculated duration: ${dur}s (from ${scene.duration}ms)`);
                this.createCue(trackId, scene.id, scene.name, startTime, dur, isCtrl);
            }
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
            const data = await res.json();
            if (data.success) this.scenes = data.scenes || [];
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
            item.textContent = scene.name;
            item.draggable = false;
            item.addEventListener('mousedown', (e) => this.handlePoolMouseDown(e, scene));
            container.appendChild(item);
        });
    }

    renderTimeline() {
        const ruler = document.getElementById('timeline-ruler');
        const tracksContainer = document.getElementById('tracks-container');
        if (!ruler || !tracksContainer) return;

        ruler.innerHTML = '';
        ruler.style.width = `${(this.maxTime * this.pixelsPerSecond) + LEFT_MARGIN}px`;
        const oldGrid = tracksContainer.querySelectorAll('.grid-line');
        oldGrid.forEach(el => el.remove());

        for (let i = 0; i <= this.maxTime; i += 0.1) {
            const pos = (i * this.pixelsPerSecond) + LEFT_MARGIN;
            if (Math.abs(i % 1) < 0.001 || Math.abs(i % 1 - 1) < 0.001) {
                const marker = document.createElement('div');
                marker.className = 'time-marker major';
                marker.style.left = `${pos}px`;
                marker.textContent = `${Math.round(i)}s`;
                ruler.appendChild(marker);
                const gridLine = document.createElement('div');
                gridLine.className = 'grid-line major';
                gridLine.style.left = `${pos}px`;
                tracksContainer.appendChild(gridLine);
            } else if (Math.abs(i % 0.5) < 0.001) {
                const marker = document.createElement('div');
                marker.className = 'time-marker minor';
                marker.style.left = `${pos}px`;
                ruler.appendChild(marker);
                const gridLine = document.createElement('div');
                gridLine.className = 'grid-line minor';
                gridLine.style.left = `${pos}px`;
                tracksContainer.appendChild(gridLine);
            }
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
        const cue = { id: Date.now(), trackId, sceneId, sceneName, startTime, duration, fadeIn: 0, fadeOut: 0 };
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
                block.addEventListener('mousedown', (e) => this.handleCueMouseDown(e, cue, block));
                block.addEventListener('dblclick', () => this.editCue(cue));
                track.appendChild(block);
                this.cueElements.set(cue.id, block);
            } else {
                if (block.parentElement !== track) track.appendChild(block);
            }

            const newLeft = `${cue.startTime * this.pixelsPerSecond}px`;
            const newWidth = `${cue.duration * this.pixelsPerSecond}px`;
            if (block.style.left !== newLeft) block.style.left = newLeft;
            if (block.style.width !== newWidth) block.style.width = newWidth;
            block.querySelector('.cue-block-name').textContent = cue.sceneName;
            block.querySelector('.cue-block-time').textContent = `${cue.startTime.toFixed(2)}s`;
            if (this.selectedCue && this.selectedCue.id === cue.id) block.classList.add('selected');
            else block.classList.remove('selected');
        });
    }

    // ... Standard methods ...
    editCue(cue) {
        this.selectedCue = cue;
        this.highlightSelectedCue();
        document.getElementById('cue-name').value = cue.sceneName;
        document.getElementById('cue-start').value = cue.startTime;
        document.getElementById('cue-duration').value = cue.duration;
        document.getElementById('cue-fade-in').value = cue.fadeIn;
        document.getElementById('cue-fade-out').value = cue.fadeOut;
        document.getElementById('cue-modal').classList.add('active');
    }
    highlightSelectedCue() { this.renderCues(); }
    hideCueModal() { document.getElementById('cue-modal').classList.remove('active'); this.selectedCue = null; }
    saveCueProperties() {
        if (!this.selectedCue) return;
        this.selectedCue.startTime = parseFloat(document.getElementById('cue-start').value);
        this.selectedCue.duration = parseFloat(document.getElementById('cue-duration').value);
        this.selectedCue.fadeIn = parseFloat(document.getElementById('cue-fade-in').value);
        this.selectedCue.fadeOut = parseFloat(document.getElementById('cue-fade-out').value);
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
        if (this.currentTime >= this.maxTime) { if (this.loop) this.currentTime = 0; else { this.stop(); return; } }
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
                    await this.recallScene(cue.sceneId, cue);
                    cue.triggered = true;
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
    async recallScene(sceneId, cueRef) {
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
                    console.log(`🏃‍♂️ Playing Chaser Cue: ${scene.name}`);
                    this.startChaser(sceneId, channelData, cueRef);
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
    startChaser(id, config, cueRef) {
        if (!this.runningChasers) this.runningChasers = [];

        const chaserState = {
            id: id + '_' + Date.now(),
            config: config,
            startTime: performance.now(),
            lastTime: performance.now(),
            phase: 0
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

        const now = performance.now();

        this.runningChasers.forEach(chaser => {
            const state = chaser.config;
            const dt = now - chaser.lastTime;
            chaser.lastTime = now;

            // Fade Logic
            const currentFadeTime = parseInt(state.fade_time) || 1000;
            const cycleDuration = currentFadeTime * 2;
            const phaseStep = (dt / cycleDuration) * 2;
            chaser.phase = (chaser.phase + phaseStep) % 2;

            let progress;
            if (state.mode === 'pulse') {
                progress = (chaser.phase < 1) ? chaser.phase : 0;
            } else {
                if (chaser.phase < 1) {
                    progress = chaser.phase;
                } else {
                    progress = 1 - (chaser.phase - 1);
                }
            }

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
