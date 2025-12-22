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
        this.runningFX = []; // NEW: FX Engine
        this.dmxBuffer = new Uint8ClampedArray(512);
        this.lastSentBuffer = new Uint8ClampedArray(512);
        this.lastDmxSendTime = 0;
        this.isSendingDmx = false; // LOCK for network stability
        this.trackingMode = true; // DEFAULT: Lights stay on
        this.channelMap = new Array(512).fill(null).map(() => ({ isIntensity: false }));

        this.init();
    }

    init() {
        // Read Debug Flag from LocalStorage (set by Dashboard)
        this.debugMode = localStorage.getItem('webdmx_debug_mode') === 'true';
        if (this.debugMode) console.log('🐞 Debug Mode ENABLED');

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
            if (this.keysPressed['z']) {
                e.preventDefault();
                const delta = Math.sign(e.deltaY) * -10;
                let newZoom = this.pixelsPerSecond + delta;
                newZoom = Math.max(20, Math.min(300, newZoom));
                this.setZoom(newZoom);
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

        // Time Ruler Scrubbing
        const ruler = document.getElementById('timeline-ruler');
        if (ruler) {
            ruler.addEventListener('mousedown', (e) => {
                e.preventDefault();
                this.pause();
                this.dragState = { active: true, mode: 'scrub' };
                this.scrubTo(e.clientX);
            });
        }

        // Tracking keys
        this.keysPressed = {};
        const panicBtn = document.getElementById('panic-btn');
        if (panicBtn) panicBtn.onclick = () => this.panic();

        const trackToggle = document.getElementById('tracking-toggle');
        if (trackToggle) {
            trackToggle.checked = this.trackingMode;
            trackToggle.onchange = (e) => {
                this.trackingMode = e.target.checked;
                console.log('🔄 Tracking Mode:', this.trackingMode);
            };
        }

        document.addEventListener('keydown', (e) => {
            const key = e.key.toLowerCase();
            this.keysPressed[key] = true;

            if (key === 'm' && !this.dragState.active) {
                const area = document.querySelector('.timeline-area');
                if (area) area.style.cursor = 'grab';
            }

            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            if (e.code === 'Space') {
                e.preventDefault();
                if (this.isPlaying) this.pause();
                else this.play();
            }
            if (e.code === 'Delete' || e.code === 'Backspace') {
                if (this.selectedCue) this.deleteSelectedCue();
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

        // Context Menu Global Click to Close
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.context-menu')) this.hideContextMenu();
        });

        // Bind Context Menu Actions
        const bindCtx = (id, fn) => {
            const el = document.getElementById(id);
            if (el) el.onclick = () => {
                const activeCue = this.contextCue;
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

        // Timeline Context Menu Actions
        const bindTimeCtx = (id, fn) => {
            const el = document.getElementById(id);
            if (el) el.onclick = () => {
                const event = this.contextEvent;
                this.hideContextMenu();
                fn(event);
            };
        };
        bindTimeCtx('ctx-add-fx', (e) => this.showFXBuilder(e));
    }

    setZoom(pps) {
        this.pixelsPerSecond = pps;
        const slider = document.getElementById('zoom-slider');
        if (slider) slider.value = pps;

        this.renderTimeline();
        this.renderCues();
        this.updatePlayhead();
    }

    showTimelineContextMenu(e) {
        e.preventDefault();
        this.contextEvent = e;
        const menu = document.getElementById('context-menu');
        if (!menu) return;

        // Hide Cue-specific items, show Timeline items
        menu.querySelectorAll('li').forEach(li => li.style.display = 'none');

        let addItem = document.getElementById('ctx-add-fx');
        if (!addItem) {
            addItem = document.createElement('li');
            addItem.id = 'ctx-add-fx';
            addItem.innerHTML = '🪄 Create FX...';
            menu.querySelector('ul').appendChild(addItem);
            addItem.onclick = () => {
                this.hideContextMenu();
                this.showFXBuilder(this.contextEvent);
            };
        }
        addItem.style.display = 'block';

        menu.style.left = `${e.clientX}px`;
        menu.style.top = `${e.clientY}px`;
        menu.style.display = 'block';
    }

    showContextMenu(e, cue) {
        e.preventDefault();
        this.contextCue = cue;
        const menu = document.getElementById('context-menu');
        if (!menu) return;

        // Show Cue-specific items, hide Timeline items
        menu.querySelectorAll('li').forEach(li => li.style.display = 'block');
        const addItem = document.getElementById('ctx-add-fx');
        if (addItem) addItem.style.display = 'none';

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
            // Store element reference for simpler parent lookup
            sourceElement: element,
            startX: e.clientX,
            ghosts: [], // Array of temporary ghost elements
            cloneCount: 0
        };

        if (this.debugMode) console.log('👯 Clone Drag Started');
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
                // BRUTE FORCE REBUILD -> No Gaps Possible

                // 1. CLEAR ALL PREVIOUS GHOSTS
                if (this.dragState.ghosts) {
                    this.dragState.ghosts.forEach(g => { if (g && g.parentNode) g.remove(); });
                }
                this.dragState.ghosts = [];

                // 2. CREATE NEW BATCH
                const isChaser = this.dragState.sourceElement.classList.contains('chaser');

                for (let i = 0; i < newCloneCount; i++) {
                    const ghost = document.createElement('div');
                    ghost.className = 'cue-block ghost-clone'; // Reset classes, manual style

                    ghost.style.position = 'absolute';
                    ghost.style.height = '50px';
                    ghost.style.top = '5px';
                    ghost.style.opacity = '0.9'; // High visibility
                    ghost.style.pointerEvents = 'none';
                    // Manual Color Fallback
                    ghost.style.background = isChaser ? 'rgba(255, 153, 0, 0.8)' : 'rgba(102, 126, 234, 0.8)';
                    ghost.style.border = '2px dashed #fff';
                    ghost.style.borderRadius = '4px';
                    ghost.style.zIndex = '100';
                    ghost.style.boxSizing = 'border-box'; // Ensure border doesn't expand width

                    ghost.textContent = `+${i + 1}`;
                    ghost.style.display = 'flex';
                    ghost.style.alignItems = 'center';
                    ghost.style.justifyContent = 'center';
                    ghost.style.color = '#fff';
                    ghost.style.fontWeight = 'bold';
                    ghost.style.fontSize = '14px';

                    const startT = this.dragState.sourceCue.startTime + (dur * (i + 1));
                    ghost.style.left = `${startT * this.pixelsPerSecond}px`;
                    ghost.style.width = `${dur * this.pixelsPerSecond}px`;

                    const trackEl = this.dragState.sourceElement.parentElement;
                    if (trackEl) {
                        trackEl.appendChild(ghost);
                        this.dragState.ghosts.push(ghost);
                    }
                }

                this.dragState.cloneCount = newCloneCount;
            }

        } else if (this.dragState.mode === 'automation') {
            const cue = this.dragState.cue;
            const pt = this.dragState.point;
            const block = this.cueElements.get(cue.id);
            if (block) {
                const rect = block.querySelector('.automation-layer svg').getBoundingClientRect();
                let x = (e.clientX - rect.left) / rect.width;
                let y = 1.0 - ((e.clientY - rect.top) / rect.height);

                pt.x = Math.max(0, Math.min(1, x));
                pt.y = Math.max(0, Math.min(0.5, y)); // WALL: 0.5 is 255 DMX

                this.renderAutomation(cue, block);
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
        this.processDmxFrame();
        this.updateChasers();
        this.updateFX(); // FIX: FX must also update during scrubbing!
        this.sendDmxFrame();
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
                // Gapless sequential cloning
                const newStart = src.startTime + (src.duration * (i + 1));
                // ignoreCollisions=true to allow tightly packed cues initially
                this.createCue(src.trackId, src.sceneId, src.sceneName, newStart, src.duration, true);
            }

            // Cleanup ghosts
            this.dragState.ghosts.forEach(g => g.remove());

            // Re-render to show real cues
            this.renderCues();
        } else if (this.dragState.mode === 'automation') {
            this.renderCues();
        }

        const area = document.querySelector('.timeline-area');
        if (area) area.style.cursor = 'default';
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
            this.buildChannelMap();
        } catch (e) {
            console.error('Failed to load patch:', e);
        }
    }

    buildChannelMap() {
        this.channelMap = new Array(512).fill(null).map(() => ({ isIntensity: false }));

        this.devices.forEach(dev => {
            const start = dev.dmx_address;
            const assign = this.assignments[dev.id];
            if (!start || !assign) return;

            Object.entries(assign).forEach(([rel, funcs]) => {
                const relNum = parseInt(rel);
                const absIdx = start + relNum - 2; // 0-indexed
                if (absIdx < 0 || absIdx >= 512) return;

                const funcList = Array.isArray(funcs) ? funcs.map(f => f.toLowerCase()) : [];

                // Determine channel type:
                // Dimmer/Intensity -> HTP (Must go to 0 when inactive)
                // Color, Pan, Tilt, etc -> LTP (Should HOLD last value)
                const isDimmer = funcList.some(f => f === 'dim' || f === 'dimmer' || f === 'intensity' || f === 'brightness');
                const isColor = funcList.some(f => f === 'red' || f === 'r' || f === 'green' || f === 'g' || f === 'blue' || f === 'b' || f === 'white' || f === 'w' || f === 'color');

                this.channelMap[absIdx].isDimmer = isDimmer;
                this.channelMap[absIdx].isColor = isColor;
                this.channelMap[absIdx].isIntensity = isDimmer || (isColor && !this.hasSeparateDimmer(assign));
            });
        });
        console.log('🛰️ Channel Efficiency Map built.');
    }

    hasSeparateDimmer(assignments) {
        return Object.values(assignments).some(funcs => {
            const list = Array.isArray(funcs) ? funcs.map(f => f.toLowerCase()) : [];
            return list.some(f => f === 'dim' || f === 'dimmer' || f === 'intensity');
        });
    }

    isAttributeMatch(func, target) {
        if (!func || !target) return false;
        const f = func.toLowerCase();
        const t = target.toLowerCase();
        if (f === t) return true;

        // Dimmer group
        const dimAliases = ['dim', 'dimmer', 'intensity', 'brightness', 'master'];
        if (dimAliases.includes(t)) return dimAliases.includes(f);

        // Color groups
        if (t === 'r' || t === 'red') return f === 'r' || f === 'red';
        if (t === 'g' || t === 'green') return f === 'g' || f === 'green';
        if (t === 'b' || t === 'blue') return f === 'b' || f === 'blue';
        if (t === 'w' || t === 'white') return f === 'w' || f === 'white';

        return false;
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

            // Timeline Context Menu (Right Click on empty space)
            trackEl.addEventListener('contextmenu', (e) => {
                if (e.target.closest('.cue-block')) return; // Let cue handle it
                this.showTimelineContextMenu(e);
            });

            container.appendChild(trackEl);
        });
        this.renderCues();
    }

    createCue(trackId, sceneId, sceneName, startTime, duration = 5, ignoreCollisions = false) {
        // Fix for Loop-Creation: Date.now() is not unique enough for sync loops
        const cue = {
            id: Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            trackId,
            sceneId,
            sceneName,
            startTime,
            duration,
            fadeIn: 0,
            fadeOut: 0,
            reverse: false,
            // Default: Middle = 255 DMX
            automationPoints: [{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }]
        };
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
                block.innerHTML = `
                    <div class="cue-block-name"></div>
                    <div class="cue-block-time"></div>
                    <div class="cue-resize-handle"></div>
                    <div class="automation-layer">
                        <svg preserveAspectRatio="none" viewBox="0 0 100 100">
                            <path class="automation-line"></path>
                        </svg>
                    </div>
                `;
                block.setAttribute('draggable', 'false');
                block.ondragstart = (e) => { e.preventDefault(); return false; };

                // Mouse Events
                block.addEventListener('mousedown', (e) => this.handleCueMouseDown(e, cue, block));
                block.addEventListener('dblclick', () => this.editCue(cue));
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
            if (block.style.left !== newLeft) block.style.left = newLeft;
            if (block.style.width !== newWidth) block.style.width = newWidth;

            let displayName = cue.sceneName;
            if (cue.reverse) displayName += ' ⏪';

            block.querySelector('.cue-block-name').textContent = displayName;
            block.querySelector('.cue-block-time').textContent = `${cue.startTime.toFixed(2)}s`;

            // --- RENDER AUTOMATION ---
            this.renderAutomation(cue, block);

            if (this.selectedCue && this.selectedCue.id === cue.id) block.classList.add('selected');
            else block.classList.remove('selected');

            // --- Chaser Styling ---
            const scene = this.scenes.find(s => s.id === cue.sceneId);
            let isChaser = false;
            if (scene) {
                isChaser = scene.type === 'chaser';
                if (!isChaser && scene.channel_data && !Array.isArray(scene.channel_data)) {
                    if (scene.channel_data.start_color || scene.channel_data.fade_time) isChaser = true;
                }
            }
            if (isChaser) block.classList.add('chaser');
            else block.classList.remove('chaser');
        });
    }

    renderAutomation(cue, block) {
        const layer = block.querySelector('.automation-layer');
        const svg = layer.querySelector('svg');
        const path = svg.querySelector('.automation-line');
        if (!cue.automationPoints) cue.automationPoints = [{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }];

        const pts = [...cue.automationPoints].sort((a, b) => a.x - b.x);

        // y is normalized such that 0.5 = 100% (Top of Path visually). 
        // We Use the SVG viewBox 0-100 logic.
        // SVG y=100 is bottom, y=0 is top.
        // We want y_norm=0 (bottom) to be SVG y=100.
        // We want y_norm=0.5 (middle) to be SVG y=50.
        const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x * 100} ${100 - (p.y * 100)}`).join(' ');
        path.setAttribute('d', d);

        // Sync Node DIVs (to avoid SVG stretching/ellipses)
        let nodesContainer = layer.querySelector('.automation-nodes');
        if (!nodesContainer) {
            nodesContainer = document.createElement('div');
            nodesContainer.className = 'automation-nodes';
            layer.appendChild(nodesContainer);
        }

        const existingNodes = nodesContainer.querySelectorAll('.automation-node-div');
        if (existingNodes.length !== pts.length) {
            nodesContainer.innerHTML = '';
            pts.forEach((p, idx) => {
                const node = document.createElement('div');
                node.className = 'automation-node-div';
                node.addEventListener('mousedown', (e) => this.handleAutomationNodeMouseDown(e, cue, p));
                nodesContainer.appendChild(node);
            });
        }

        nodesContainer.querySelectorAll('.automation-node-div').forEach((node, idx) => {
            const p = pts[idx];
            node.style.left = `${p.x * 100}%`;
            node.style.top = `${(1.0 - p.y) * 100}%`;
        });

        path.onmousedown = (e) => {
            e.stopPropagation();
            const rect = svg.getBoundingClientRect();
            const x = (e.clientX - rect.left) / rect.width;
            const y = 1.0 - ((e.clientY - rect.top) / rect.height);
            cue.automationPoints.push({
                x: Math.max(0, Math.min(1, x)),
                y: Math.max(0, Math.min(0.5, y)) // WALL at 0.5
            });
            this.renderCues();
        };
    }

    handleAutomationNodeMouseDown(e, cue, point) {
        e.stopPropagation();
        e.preventDefault();
        this.dragState = {
            active: true,
            mode: 'automation',
            cue: cue,
            point: point,
            startX: e.clientX,
            startY: e.clientY
        };
    }

    getAutomationValue(cue, relativeTime) {
        if (!cue.automationPoints || cue.automationPoints.length < 2) return 1.0;
        const pts = [...cue.automationPoints].sort((a, b) => a.x - b.x);
        const t = Math.max(0, Math.min(1, relativeTime / cue.duration));

        let yNorm = 0.5;
        if (t <= pts[0].x) {
            yNorm = pts[0].y;
        } else if (t >= pts[pts.length - 1].x) {
            yNorm = pts[pts.length - 1].y;
        } else {
            for (let i = 0; i < pts.length - 1; i++) {
                const p1 = pts[i];
                const p2 = pts[i + 1];
                if (t >= p1.x && t <= p2.x) {
                    const range = p2.x - p1.x;
                    const factor = (t - p1.x) / (range || 0.001);
                    yNorm = p1.y + factor * (p2.y - p1.y);
                    break;
                }
            }
        }

        // Mapping: yNorm=0.5 -> Intensity=1.0. yNorm=0 -> Intensity=0.0.
        // We divide by 0.5 to make middle the peak.
        return Math.min(1.0, yNorm / 0.5);
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
    clearTimeline() {
        if (!confirm('Clear entire timeline?')) return;
        this.cues = [];
        this.activeCues.clear();
        this.runningChasers = [];
        this.panic(); // Clear output too
        this.renderCues();
    }

    panic() {
        console.log('🚨 PANIC: Resetting DMX Output');
        this.dmxBuffer.fill(0);
        this.lastSentBuffer.fill(1); // Force change
        this.runningChasers = [];
        this.runningFX = [];
        this.sendDmxFrame();
    }
    play() { if (this.isPlaying && !this.isPaused) return; this.isPlaying = true; this.isPaused = false; this.lastFrameTime = performance.now(); this.gameLoop(); }
    gameLoop() {
        if (!this.isPlaying) return;
        const now = performance.now();
        const deltaTime = (now - this.lastFrameTime) / 1000;
        this.lastFrameTime = now;
        this.currentTime += (deltaTime * this.speed);
        this.updatePlayhead();
        this.checkCues();
        this.processDmxFrame();
        this.updateChasers();
        this.updateFX(); // ACTIVATE FX ENGINE
        this.sendDmxFrame();

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

    processDmxFrame() {
        if (this.tracks.length === 0) return;

        // 1. Intended values for THIS specific frame
        const frameBuffer = new Uint16Array(512).fill(0); // Use 16-bit to avoid overflow before Math.min
        const addressedThisFrame = new Set();

        // --- ADDED: Mark channels addressed by FX ---
        if (this.runningFX) {
            this.runningFX.forEach(fx => {
                const targetIds = fx.config.targetFixtureIds || [];
                const targetAttr = (fx.config.attribute || 'dimmer').toLowerCase();

                targetIds.forEach(fId => {
                    const idNum = Number(fId);
                    const dev = this.devices.find(d => d.id === idNum);
                    const assign = this.assignments[idNum] || this.assignments[String(idNum)];
                    if (!dev || !assign) return;

                    const start = dev.dmx_address;
                    Object.entries(assign).forEach(([rel, funcs]) => {
                        const relNum = parseInt(rel);
                        const absIdx = start + relNum - 2;
                        if (absIdx < 0 || absIdx >= 512) return;

                        const funcList = Array.isArray(funcs) ? funcs : [funcs];
                        const isMatch = funcList.some(f => this.isAttributeMatch(f, targetAttr));
                        if (isMatch) {
                            addressedThisFrame.add(absIdx);
                            if (window.debugFX) console.log(`[FX SYNC] Channel ${absIdx + 1} reserved for FX (${targetAttr})`);
                        }
                    });
                });
            });
        }

        // --- ADDED: Mark channels addressed by CHASERS ---
        // This prevents Tracking logic from releasing them to 0 before updateChasers() runs
        if (this.runningChasers && this.runningChasers.length > 0) {
            this.runningChasers.forEach(ch => {
                const targetIds = ch.config.targetFixtureIds || [];
                // Chasers control Color (RGB), Zoom, Strobe, and Dimmer
                // We must mark ALL these as addressed.

                targetIds.forEach(fId => {
                    const idNum = Number(fId);
                    const dev = this.devices.find(d => d.id === idNum);
                    const assign = this.assignments[idNum] || this.assignments[String(idNum)];
                    if (!dev || !assign) return;

                    const start = dev.dmx_address;
                    Object.entries(assign).forEach(([rel, funcs]) => {
                        const relNum = parseInt(rel);
                        const absIdx = start + relNum - 2;
                        if (absIdx < 0 || absIdx >= 512) return;

                        // Optimization: We could check if function matches chaser capability, but marking all is safer for now
                        // to ensure full control retention. Or filtering for R,G,B,Dim,Zoom,Strobe.
                        const list = Array.isArray(funcs) ? funcs.map(f => f.toLowerCase()) : [funcs.toLowerCase()];

                        const isControlled = list.some(f =>
                            ['red', 'r', 'green', 'g', 'blue', 'b', 'white', 'w', 'color',
                                'zoom', 'strobe', 'shutter', 'dimmer', 'dim', 'intensity'].includes(f)
                        );

                        if (isControlled) {
                            addressedThisFrame.add(absIdx);
                            if (window.debugChaser) console.log(`[CHASER LOCK] Channel ${absIdx + 1} locked by Chaser ${ch.id}`);
                        }
                    });
                });
            });
        }

        for (const cueId of this.activeCues) {
            const cue = this.cues.find(c => c.id === cueId);
            if (!cue) continue;

            const scene = this.scenes.find(s => s.id === cue.sceneId);
            if (!scene || scene.type === 'chaser') continue;

            const factor = this.getAutomationValue(cue, this.currentTime - cue.startTime);
            let data = scene.channel_data;
            if (typeof data === 'string') {
                try { data = JSON.parse(data); } catch (e) { data = []; }
            }

            if (Array.isArray(data)) {
                data.forEach((val, idx) => {
                    if (idx >= 512) return;
                    addressedThisFrame.add(idx);
                    const isInt = this.channelMap[idx].isIntensity;
                    const v = (typeof val === 'number') ? val : (val.value || 0);
                    const finalVal = isInt ? (v * factor) : v;
                    frameBuffer[idx] = Math.max(frameBuffer[idx], Math.round(finalVal));
                });
            } else if (typeof data === 'object' && data !== null) {
                Object.entries(data).forEach(([ch, val]) => {
                    const idx = parseInt(ch) - 1;
                    if (idx < 0 || idx >= 512) return;
                    addressedThisFrame.add(idx);
                    const isInt = this.channelMap[idx].isIntensity;
                    const finalVal = isInt ? (parseInt(val) * factor) : parseInt(val);
                    frameBuffer[idx] = Math.max(frameBuffer[idx], Math.round(finalVal));
                });
            }
        }

        // 2. Final Output Resolution (Applying Tracking/Release)
        for (let i = 0; i < 512; i++) {
            if (addressedThisFrame.has(i)) {
                // Active cue is driving this channel -> Update buffer
                this.dmxBuffer[i] = Math.min(255, frameBuffer[i]);
            } else {
                // No active cue for this channel
                const isInt = this.channelMap[i].isIntensity;
                // If intensity and tracking is OFF -> Auto-release to 0
                if (isInt && !this.trackingMode) {
                    this.dmxBuffer[i] = 0;
                }
                // Else: HOLD (LTP Tracking) - keep previous dmxBuffer[i]
            }
        }
    }

    async sendDmxFrame() {
        if (this.isSendingDmx) return; // Wait for previous frame to finish

        const hasContent = this.activeCues.size > 0 || this.runningChasers.length > 0 || (this.runningFX && this.runningFX.length > 0);

        let changed = false;
        for (let i = 0; i < 512; i++) {
            if (this.dmxBuffer[i] !== this.lastSentBuffer[i]) {
                changed = true;
                break;
            }
        }

        const now = performance.now();
        // Stability: Allow max ~40 FPS for HTTP DMX
        const minInterval = 25;

        const shouldSend = (changed && (now - this.lastDmxSendTime > minInterval)) ||
            (hasContent && (now - this.lastDmxSendTime > 100));

        if (shouldSend) {
            this.isSendingDmx = true;
            this.lastSentBuffer.set(this.dmxBuffer);
            this.lastDmxSendTime = now;

            try {
                await fetch(`${API}/api/dmx/batch`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ channels: Array.from(this.dmxBuffer) })
                });
            } catch (e) {
                console.error('DMX Frame Send Error:', e);
            } finally {
                this.isSendingDmx = false;
            }
        }
    }

    async checkCues() {
        const newActiveCues = new Set();

        // Debug: Log active status periodically
        if (this.isPlaying && Math.floor(this.currentTime * 10) % 50 === 0 && !this._lastLogged) {
            const cueStates = this.cues.map(c => ({ id: c.id, start: c.startTime, end: c.startTime + c.duration, trig: c.triggered, mute: this.tracks.find(t => t.id === c.trackId)?.muted }));
            console.log(`⏱ [CheckCues] Time: ${this.currentTime.toFixed(2)}s | Cues:`, cueStates);
            this._lastLogged = true;
        }
        if (this.isPlaying && Math.floor(this.currentTime * 10) % 50 !== 0) this._lastLogged = false;

        for (const cue of this.cues) {
            const track = this.tracks.find(t => t.id === cue.trackId);
            const isMuted = track ? track.muted : false;

            const cueStart = cue.startTime;
            const cueEnd = cue.startTime + cue.duration;

            if (!isMuted && this.currentTime >= cueStart && this.currentTime < cueEnd) {
                newActiveCues.add(cue.id);
                if (!this.activeCues.has(cue.id)) {
                    const block = this.cueElements.get(cue.id);
                    if (block) block.classList.add('active');
                }

                // For Chasers and FX, we still need to 'trigger' them once to start the engine entry
                if (!cue.triggered) {
                    cue.triggered = true;

                    // Priority 1: Data directly on the cue (for generated FX - future)
                    if (cue.type === 'fx') {
                        this.startFX(cue.id, cue.channel_data, cue, cue.startTime);
                    }
                    // Priority 2: Standard Scene/Chaser via recallScene (central logic)
                    else {
                        // Use recallScene to handle type detection (Chaser vs Scene vs Legacy)
                        this.recallScene(cue.sceneId, cue, cue.startTime);
                    }
                }
            } else {
                if (this.activeCues.has(cue.id)) {
                    const block = this.cueElements.get(cue.id);
                    if (block) block.classList.remove('active');
                    if (cue.activeChaserId) {
                        this.stopChaser(cue.activeChaserId);
                        cue.activeChaserId = null;
                    }
                    if (cue.activeFXId) {
                        this.stopFX(cue.activeFXId);
                        cue.activeFXId = null;
                    }
                }
                cue.triggered = false;
            }
        }
        this.activeCues = newActiveCues;
    }

    async recallScene(sceneId, cueRef, cueStartTime = 0) { // Accept startTime
        const scene = this.scenes.find(s => s.id === sceneId);
        if (!scene) {
            console.warn(`❌ Scenes not found for ID: ${sceneId}`);
            return;
        }

        if (this.debugMode) console.log(`🎬 [TRACE] recallScene ENTER: ${scene.name} (Type: ${scene.type})`);

        try {
            let channelData = scene.channel_data;
            if (typeof channelData === 'string') channelData = JSON.parse(channelData);

            let isChaser = scene.type === 'chaser';

            // STRICT Fallback: Check for Chaser Object format
            if (!isChaser && !Array.isArray(channelData)) {
                console.log('🔍 [TRACE] Inspection for Scene:', scene.name, channelData);
                // If it's an object, it MIGHT be sparse channel data OR a chaser config.
                // Chaser config usually has 'start_color', 'fade_time' etc.
                if (channelData.start_color || channelData.fade_time || channelData.mode) {
                    console.log(`⚠️ Scene ${scene.name} looks like a Chaser. Treating as Chaser.`);
                    isChaser = true;
                }
            }

            if (isChaser) {
                // --- CHASER PLAYBACK ---
                const existing = this.runningChasers.find(c => c.id.startsWith(sceneId + '_'));
                if (!existing) {
                    if (this.debugMode) console.log(`✅ [TRACE] recallScene: Starting Chaser Cue '${scene.name}' (ID: ${sceneId}) @ ${cueStartTime}s`);
                    this.startChaser(sceneId, channelData, cueRef, cueStartTime);
                } else {
                    if (this.debugMode) console.log(`ℹ️ [TRACE] recallScene: Chaser '${scene.name}' already running.`);
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
            cueStartTime: cueStartTime,
            cueRef: cueRef // CRITICAL: Store for automation Factor
        };


        this.runningChasers.push(chaserState);
        cueRef.activeChaserId = chaserState.id;
        if (this.debugMode) console.log(`✨ [TRACE] startChaser: Chaser registered. Total running: ${this.runningChasers.length}`, activeConfig);
    }

    stopChaser(runId) {
        if (!this.runningChasers) return;
        this.runningChasers = this.runningChasers.filter(c => c.id !== runId);
    }

    updateChasers() {
        if (!this.runningChasers || this.runningChasers.length === 0) return;

        // Use Timeline Time convert to ms for compatibility with fader logic
        const currentMs = this.currentTime * 1000;

        this.runningChasers.forEach(chaser => {
            const state = chaser.config;
            const startTime = chaser.cueStartTime * 1000;
            const elapsed = Math.max(0, currentMs - startTime);

            // --- PARAMETERS ---
            const fadeTime = parseInt(state.fade_time) || 3000; // ms
            const cycleDuration = fadeTime * 2; // Loop: A->B->A

            // Automation Factor
            const cueRef = chaser.cueRef;
            const factor = cueRef ? this.getAutomationValue(cueRef, this.currentTime - cueRef.startTime) : 1.0;

            // --- COLOR CALCULATION ---
            let r, g, b;
            const startRGB = this.hexToRgb(state.start_color || '#000000');
            const endRGB = this.hexToRgb(state.end_color || '#000000');

            if (state.color_fade_enabled !== false) {
                // Determine Phase (0..2)
                let phase = (elapsed / fadeTime) % 2;

                // Mode Logic
                let progress;
                if (state.mode === 'pulse') {
                    progress = (phase < 1) ? phase : 0;
                } else if (state.mode === 'strobe') {
                    progress = (phase < 1) ? 1 : 0; // 50% duty cycle logic
                } else {
                    // Linear / Default (Ping-Pong)
                    progress = (phase < 1) ? phase : (2 - phase);
                }

                if (state.reverse) progress = 1.0 - progress;

                r = Math.round(startRGB.r + (endRGB.r - startRGB.r) * progress);
                g = Math.round(startRGB.g + (endRGB.g - startRGB.g) * progress);
                b = Math.round(startRGB.b + (endRGB.b - startRGB.b) * progress);
            } else {
                // Static Color
                r = startRGB.r;
                g = startRGB.g;
                b = startRGB.b;
            }

            // Apply Master Dimming / Automation to Color
            r = Math.min(255, Math.round(r * factor));
            g = Math.min(255, Math.round(g * factor));
            b = Math.min(255, Math.round(b * factor));


            // --- ZOOM CALCULATION ---
            let zVal = 0;
            if (state.zoom_enabled) {
                const zoomMax = state.zoom_max !== undefined ? state.zoom_max : 255;
                const shouldOscillate = (state.color_fade_enabled !== false); // Match faders.js logic

                if (shouldOscillate) {
                    // Calc separate zoom phase
                    // Zoom Time is usually sync with Fade Time or explicitly set. 
                    // Faders.js logic:
                    // const currentFadeTime = ...; 
                    // const zEffectiveProgress ...
                    // Here we reuse fadeTime as base for sync

                    const zTime = fadeTime / 2; // Default logic from faders.js
                    const zElapsed = elapsed % (zTime * 2);

                    let zEffectiveProgress;
                    if (state.zoom_sawtooth) {
                        zEffectiveProgress = (elapsed % cycleDuration) / cycleDuration; // Simplified sawtooth over full cycle
                        // ACTUALLY: faders.js uses: ((currentTime - startTime) % (currentFadeTime / 2) / (currentFadeTime / 2))
                        // Let's stick to faders.js exactly:
                        zEffectiveProgress = (elapsed % (fadeTime / 2)) / (fadeTime / 2);
                    } else {
                        // Triangle / PingPong
                        zEffectiveProgress = (zElapsed < zTime) ? (zElapsed / zTime) : (1 - ((zElapsed - zTime) / zTime));
                    }

                    let zFinalProgress = state.zoom_invert ? (1 - zEffectiveProgress) : zEffectiveProgress;
                    // Phase shift reverse for zoom if global reverse is on? Usually separate.
                    // But cue reverse might want to reverse everything.
                    if (state.reverse) zFinalProgress = 1.0 - zFinalProgress;

                    zVal = Math.round(zFinalProgress * zoomMax);
                } else {
                    // Static Zoom Output
                    zVal = zoomMax;
                }
            }


            // --- STROBE CALCULATION ---
            let sVal = 0;
            if (state.strobe_enabled) {
                sVal = state.strobe_value !== undefined ? state.strobe_value : 128;
                // Strobe usually doesn't fade, just exists.
            }

            // --- DIMMER CALCULATION (If specified or Default) ---
            let dVal = 255; // Default full for active chasers
            if (state.dimmer_enabled && state.dimmer_value !== undefined) {
                const baseDim = state.dimmer_value;
                dVal = Math.round(baseDim * factor);
            } else {
                // Even if dimmer_enabled is false, we usually want chasers to be visible.
                // Force 100% unless explicitly 0?
                dVal = Math.round(255 * factor);
            }


            // --- OUTPUT TO BUFFER ---
            const targetIds = state.targetFixtureIds || [];
            targetIds.forEach(fId => {
                const idNum = Number(fId);
                const device = this.devices.find(d => d.id === idNum);
                const devAssignments = this.assignments[idNum] || this.assignments[String(idNum)];

                if (device && devAssignments) {
                    const startAddr = device.dmx_address;
                    Object.entries(devAssignments).forEach(([relCh, funcs]) => {
                        const relChNum = parseInt(relCh);
                        const absCh = startAddr + relChNum - 2; // 0-indexed Buffer
                        if (absCh < 0 || absCh >= 512) return;

                        const funcList = Array.isArray(funcs) ? funcs.map(f => f.toLowerCase()) : [funcs.toLowerCase()];

                        let valToSet = -1;

                        // Color
                        if (funcList.includes('red') || funcList.includes('r')) valToSet = r;
                        else if (funcList.includes('green') || funcList.includes('g')) valToSet = g;
                        else if (funcList.includes('blue') || funcList.includes('b')) valToSet = b;
                        else if (funcList.includes('white') || funcList.includes('w')) {
                            // White handling? If w_enabled? For now basic.
                            if (state.w_enabled) valToSet = 255; // Simplistic
                        }

                        // Zoom
                        else if (funcList.includes('zoom')) {
                            if (state.zoom_enabled) valToSet = zVal;
                        }

                        // Strobe
                        else if (funcList.includes('strobe') || funcList.includes('shutter')) {
                            if (state.strobe_enabled) valToSet = sVal;
                        }

                        // Master Dimmer
                        else if (funcList.includes('dimmer') || funcList.includes('dim') || funcList.includes('intensity')) {
                            // Always apply calculated dVal (255 or custom) to ensure visibility
                            valToSet = dVal;
                        }


                        if (valToSet !== -1) {
                            // HTP or Overwrite?
                            // For Cues, usually Highest Wins or Latest. 
                            // Since updateChasers runs AFTER processDmxFrame, this acts as LTP overlay.
                            // But if multiple Chasers target same fixture... HTP is safer for colors.
                            this.dmxBuffer[absCh] = Math.max(this.dmxBuffer[absCh], valToSet);
                        }
                    });
                }
            });
        });
    }



    // --- FX ENGINE ---
    startFX(id, config, cueRef, cueStartTime) {
        if (!this.runningFX) this.runningFX = [];
        console.log(`🚀 Starting FX: ${id}`, config);

        if (!config.targetFixtureIds || config.targetFixtureIds.length === 0) {
            console.warn(`⚠️ FX ${id} has no target fixtures!`);
        }

        const fxState = {
            id: id + '_' + Date.now(),
            config: config,
            cueStartTime: cueStartTime,
            cueRef: cueRef,
            lastLogTick: -1 // Force first frame log
        };
        this.runningFX.push(fxState);
        cueRef.activeFXId = fxState.id;
    }

    stopFX(runId) {
        console.log(`🛑 Stopping FX: ${runId}`);
        this.runningFX = this.runningFX.filter(f => f.id !== runId);
    }

    updateFX() {
        if (!this.runningFX || this.runningFX.length === 0) return;

        this.runningFX.forEach(fx => {
            const cfg = fx.config;
            const targetIds = cfg.targetFixtureIds || [];
            if (targetIds.length === 0) return;

            // 1. Collect all individual control points (channels) for distribution
            const controlPoints = [];
            targetIds.forEach(fId => {
                const idNum = Number(fId);
                const dev = this.devices.find(d => d.id === idNum);
                const assign = this.assignments[idNum] || this.assignments[String(idNum)];
                if (!dev || !assign) return;

                const start = dev.dmx_address;
                const targetAttr = (cfg.attribute || 'dimmer').toLowerCase();

                Object.entries(assign).forEach(([rel, funcs]) => {
                    const funcList = Array.isArray(funcs) ? funcs : [funcs];
                    if (funcList.some(f => this.isAttributeMatch(f, targetAttr))) {
                        controlPoints.push({
                            absIdx: start + parseInt(rel) - 2,
                            fixtureName: dev.name
                        });
                    }
                });
            });

            const total = controlPoints.length;
            if (total === 0) return;

            const elapsedS = this.currentTime - fx.cueStartTime;
            const automationFactor = fx.cueRef ? this.getAutomationValue(fx.cueRef, elapsedS) : 1.0;

            const speed = cfg.speed || 1.0;
            const amplitude = cfg.size !== undefined ? cfg.size : 255;
            const baseLevel = cfg.offset || 0;
            const spread = cfg.spread !== undefined ? cfg.spread : 360;
            const wings = cfg.wings || 1;
            const wf = cfg.waveform || 'sine';

            // 2. Process each control point with its own phase
            controlPoints.forEach((cp, index) => {
                let effectiveIndex = index;
                if (wings > 1) {
                    const sectionSize = Math.ceil(total / wings);
                    effectiveIndex = index % sectionSize;
                }

                const fixturePhase = (effectiveIndex / (total / wings)) * spread;
                const timePhase = (elapsedS * speed * 360);
                const totalPhaseDeg = (timePhase + fixturePhase) % 360;
                const rad = (totalPhaseDeg * Math.PI) / 180;

                let val = 0;
                if (wf === 'sine') val = baseLevel + ((Math.sin(rad) + 1) / 2) * amplitude;
                else if (wf === 'square') val = (totalPhaseDeg < 180) ? (baseLevel + amplitude) : baseLevel;
                else if (wf === 'saw') val = baseLevel + (1.0 - (totalPhaseDeg / 360)) * amplitude;
                else if (wf === 'ramp') val = baseLevel + (totalPhaseDeg / 360) * amplitude;
                else if (wf === 'strobe') val = (totalPhaseDeg < 36) ? (baseLevel + amplitude) : baseLevel;

                val = Math.max(0, Math.min(255, val * automationFactor));

                if (window.debugFX && Math.floor(elapsedS * 10) !== fx.lastLogTick && index === 0) {
                    console.log(`[FX RUN] ${cp.fixtureName} Ch ${cp.absIdx + 1} -> ${Math.round(val)}`);
                }

                // Apply to buffer
                this.dmxBuffer[cp.absIdx] = Math.round(val);
            });

            if (window.debugFX) fx.lastLogTick = Math.floor(elapsedS * 10);
        });
    }

    // --- FX BUILDER UI ---
    showFXBuilder(e) {
        // Create or get the FX Modal
        let modal = document.getElementById('fx-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'fx-modal';
            modal.className = 'modal-overlay';
            modal.innerHTML = `
                <div class="modal" style="width: 500px; max-width: 90vw;">
                    <div class="modal-header">FX Builder (Mathematical Engine)</div>
                    <div class="modal-body">
                        <div style="display: flex; gap: 20px;">
                            <div style="flex: 1;">
                                <div class="fx-preview-container" style="position: relative;">
                                    <canvas id="fx-preview-canvas" width="300" height="120" style="cursor: crosshair;"></canvas>
                                    <div class="fx-canvas-guides" style="position: absolute; top:0; left:0; width:100%; height:100%; pointer-events:none; display:flex; font-size:9px; color:rgba(255,255,255,0.1);">
                                        <div style="flex:1; border-right: 1px dashed rgba(255,255,255,0.1); display:flex; align-items:center; justify-content:center;">BASE LEVEL</div>
                                        <div style="flex:1; display:flex; align-items:center; justify-content:center;">AMPLITUDE</div>
                                    </div>
                                    <div class="fx-preview-hint">Drag: X=Speed | Left Y=Base | Right Y=Amp</div>
                                </div>
                                <div class="form-group">
                                    <label>Attribute</label>
                                    <select id="fx-attribute">
                                        <option value="dimmer">Dimmer / Intensity</option>
                                        <option value="r">Red</option>
                                        <option value="g">Green</option>
                                        <option value="b">Blue</option>
                                        <option value="w">White</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label>Waveform</label>
                                    <select id="fx-waveform">
                                        <option value="sine">Sine (Smooth)</option>
                                        <option value="square">Square (Hard On/Off)</option>
                                        <option value="saw">Saw (Fade Out)</option>
                                        <option value="ramp">Ramp (Fade In)</option>
                                        <option value="strobe">Strobe (Pulse)</option>
                                    </select>
                                </div>
                                <div class="form-group-row">
                                    <div class="form-group">
                                        <label>Speed</label>
                                        <input type="number" id="fx-speed" value="1.0" step="0.1">
                                    </div>
                                    <div class="form-group">
                                        <label>Spread (Deg)</label>
                                        <input type="number" id="fx-spread" value="360" step="10">
                                    </div>
                                </div>
                                <div class="form-group-row">
                                    <div class="form-group">
                                        <label>Amplitude (Size)</label>
                                        <input type="number" id="fx-size" value="255">
                                    </div>
                                    <div class="form-group">
                                        <label>Base Level (Offset)</label>
                                        <input type="number" id="fx-offset" value="0">
                                    </div>
                                </div>
                                <div class="form-group">
                                    <label>Wings (Symmetry)</label>
                                    <input type="number" id="fx-wings" value="1" min="1">
                                </div>
                            </div>
                            <div style="flex: 1; display: flex; flex-direction: column;">
                                <label>Target Fixtures</label>
                                <div id="fx-fixture-list" class="fx-fixture-list"></div>
                                <div style="display: flex; gap: 5px; margin-top: 5px;">
                                    <button class="btn-secondary" style="flex:1; padding:4px;" id="fx-select-all">All</button>
                                    <button class="btn-secondary" style="flex:1; padding:4px;" id="fx-select-none">None</button>
                                </div>
                            </div>
                        </div>

                        <div class="modal-actions" style="margin-top: 20px;">
                            <button type="button" class="btn-secondary" onclick="document.getElementById('fx-modal').classList.remove('active')">Cancel</button>
                            <button type="button" class="btn-primary" id="fx-create-btn">Create FX Cue</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }

        // Populate fixture list
        const list = modal.querySelector('#fx-fixture-list');
        list.innerHTML = '';
        this.devices.forEach(dev => {
            const item = document.createElement('label');
            item.className = 'fx-fixture-item';
            item.innerHTML = `
                <input type="checkbox" value="${dev.id}" checked>
                <span>${dev.name} <small>(Ch ${dev.dmx_address})</small></span>
            `;
            list.appendChild(item);
        });

        document.getElementById('fx-select-all').onclick = () => list.querySelectorAll('input').forEach(i => i.checked = true);
        document.getElementById('fx-select-none').onclick = () => list.querySelectorAll('input').forEach(i => i.checked = false);

        // Calculate clicked time/track for insertion
        const area = document.querySelector('.timeline-area');
        const rect = area.getBoundingClientRect();
        const timelineLeft = area.scrollLeft;
        const x = e.clientX - rect.left + timelineLeft - 100; // 100 is label padding
        const startTime = x / this.pixelsPerSecond;
        const trackEl = e.target.closest('.track');
        const trackId = trackEl ? parseInt(trackEl.dataset.trackId) : this.tracks[0].id;

        modal.classList.add('active');

        // PREVIEW LOGIC
        const canvas = document.getElementById('fx-preview-canvas');
        const updatePreview = () => {
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            const w = canvas.width;
            const h = canvas.height;
            const amp = parseInt(document.getElementById('fx-size').value);
            const base = parseInt(document.getElementById('fx-offset').value);
            const wf = document.getElementById('fx-waveform').value;

            ctx.clearRect(0, 0, w, h);

            // Draw Grid
            ctx.strokeStyle = '#333';
            ctx.beginPath();
            for (let i = 0; i <= 4; i++) {
                let y = h - (i / 4 * h);
                ctx.moveTo(0, y); ctx.lineTo(w, y);
            }
            ctx.stroke();

            // Draw Wave
            ctx.strokeStyle = '#00ffcc';
            ctx.lineWidth = 2;
            ctx.beginPath();

            for (let x = 0; x < w; x++) {
                const phaseDeg = (x / w) * 360;
                const rad = (phaseDeg * Math.PI) / 180;
                let val = 0;
                if (wf === 'sine') val = base + ((Math.sin(rad) + 1) / 2) * amp;
                else if (wf === 'square') val = (phaseDeg < 180) ? (base + amp) : base;
                else if (wf === 'saw') val = base + (1.0 - (phaseDeg / 360)) * amp;
                else if (wf === 'ramp') val = base + (phaseDeg / 360) * amp;
                else if (wf === 'strobe') val = (phaseDeg < 36) ? (base + amp) : base;

                const yPos = h - ((Math.min(255, val) / 255) * (h - 20)) - 10;
                if (x === 0) ctx.moveTo(x, yPos);
                else ctx.lineTo(x, yPos);
            }
            ctx.stroke();
        };

        // Interactive Canvas
        let isDraggingCanvas = false;
        canvas.onmousedown = (e) => {
            isDraggingCanvas = true;
            handleCanvasDrag(e);
        };
        const handleCanvasDrag = (e) => {
            const rect = canvas.getBoundingClientRect();
            const xNorm = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            const yNorm = 1.0 - Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

            const val = Math.round(yNorm * 255);

            // 1. Horizontal sets SPEED (range 0.1 to 10.0)
            const newSpeed = (xNorm * 9.9) + 0.1;
            document.getElementById('fx-speed').value = newSpeed.toFixed(1);

            // 2. Vertical split: Left side = Base, Right side = Amplitude
            if (xNorm < 0.5) {
                document.getElementById('fx-offset').value = val;
            } else {
                const currentBase = parseInt(document.getElementById('fx-offset').value);
                document.getElementById('fx-size').value = Math.max(0, val - currentBase);
            }
            updatePreview();
        };

        const onMove = (e) => { if (isDraggingCanvas) handleCanvasDrag(e); };
        const onUp = () => { isDraggingCanvas = false; };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);

        ['fx-size', 'fx-offset', 'fx-waveform', 'fx-speed'].forEach(id => {
            document.getElementById(id).oninput = updatePreview;
        });
        updatePreview();

        document.getElementById('fx-create-btn').onclick = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            const selectedIds = Array.from(list.querySelectorAll('input:checked')).map(i => parseInt(i.value));
            if (selectedIds.length === 0) {
                alert('Please select at least one fixture!');
                return;
            }

            const config = {
                attribute: document.getElementById('fx-attribute').value,
                waveform: document.getElementById('fx-waveform').value,
                speed: parseFloat(document.getElementById('fx-speed').value),
                spread: parseFloat(document.getElementById('fx-spread').value),
                size: parseInt(document.getElementById('fx-size').value),
                offset: parseInt(document.getElementById('fx-offset').value),
                wings: parseInt(document.getElementById('fx-wings').value),
                targetFixtureIds: selectedIds
            };

            this.createFXCue(trackId, startTime, config);
            modal.classList.remove('active');
        };
    }

    createFXCue(trackId, startTime, config) {
        const cue = {
            id: Date.now(),
            trackId,
            sceneId: 'fx_generated',
            sceneName: `FX: ${config.waveform.toUpperCase()}`,
            startTime,
            duration: 5.0,
            fadeIn: 0,
            fadeOut: 0,
            automationPoints: [{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }],
            sceneId: null, // No static scene
            type: 'fx',
            channel_data: config
        };
        this.cues.push(cue);
        this.renderCues();
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
