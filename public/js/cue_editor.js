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
        this.tapTimes = [];
        this.lastTapTime = 0;

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
        this.selectedCues = new Set();
        this.clipboard = null;
        this.initAsync();
    }

    async initAsync() {
        try {
            await this.loadScenes();
            await this.loadPatch(); // Load devices and assignments
            // Start loading saved state
            await this.loadShow();

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

        const bpmInput = document.getElementById('bpm-input');
        if (bpmInput) bpmInput.onchange = (e) => this.setBPM(parseInt(e.target.value));
        const tapBtn = document.getElementById('tap-btn');
        if (tapBtn) tapBtn.onmousedown = (e) => this.handleTap();

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

            // Duration shortcuts for SELECTED cue
            if (this.selectedCue) {
                if (e.shiftKey && e.key.toLowerCase() === 'w') {
                    e.preventDefault();
                    this.selectedCue.duration = Math.min(60, this.selectedCue.duration + 0.5);
                    this.renderCues();
                    console.log(`⏱️ Duration +0.5s: ${this.selectedCue.duration}s`);
                } else if (e.shiftKey && e.key.toLowerCase() === 'q') {
                    e.preventDefault();
                    this.selectedCue.duration = Math.max(0.1, this.selectedCue.duration - 0.5);
                    this.renderCues();
                    console.log(`⏱️ Duration -0.5s: ${this.selectedCue.duration}s`);
                }
            }

            if (e.code === 'Delete' || e.code === 'Backspace') {
                if (this.selectedCue) this.deleteSelectedCue();
            }

            // Copy/Paste Shortcuts
            if ((e.metaKey || e.ctrlKey) && key === 'c') {
                e.preventDefault();
                this.copySelectedCue();
            }
            if ((e.metaKey || e.ctrlKey) && key === 'v') {
                e.preventDefault();
                this.pasteCue();
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

        bindCtx('ctx-reset', (cue) => {
            if (cue) {
                // Reset automation: Clear all points, set default to middle (0.5 = 100%)
                cue.automationPoints = [{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }];
                this.renderCues();
                console.log(`🔄 Reset Automation for Cue ${cue.id}`);
            }
        });

        bindCtx('ctx-copy', (cue) => {
            if (cue) {
                this.selectedCue = cue;
                this.copySelectedCue();
            }
        });

        bindCtx('ctx-paste', () => {
            this.pasteCue();
        });

        bindCtx('ctx-duration-plus', (cue) => {
            if (cue) {
                cue.duration = Math.min(60, cue.duration + 0.5); // Max 60s
                this.renderCues();
                console.log(`⏱️ Duration +0.5s: ${cue.duration}s`);
            }
        });

        bindCtx('ctx-duration-minus', (cue) => {
            if (cue) {
                cue.duration = Math.max(0.1, cue.duration - 0.5); // Min 0.1s
                this.renderCues();
                console.log(`⏱️ Duration -0.5s: ${cue.duration}s`);
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
        this.renderTracks(); // Updates width and calls renderGrid
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

        // Right click: Select if not selected, keep selection if already part of group
        if (e.button === 2) {
            if (!this.selectedCues.has(cue.id)) {
                this.selectedCues.clear();
                this.selectedCues.add(cue.id);
                this.selectedCue = cue;
                this.renderCues();
            }
            return;
        }

        // Shift+Click: Multi-Select Toggle
        if (e.shiftKey) {
            if (this.selectedCues.has(cue.id)) {
                this.selectedCues.delete(cue.id);
                if (this.selectedCue && this.selectedCue.id === cue.id) this.selectedCue = null;
            } else {
                this.selectedCues.add(cue.id);
                this.selectedCue = cue;
            }
            this.renderCues();
        } else {
            // Normal Click: Select single unless dragging existing selection
            if (!this.selectedCues.has(cue.id)) {
                this.selectedCues.clear();
                this.selectedCues.add(cue.id);
                this.selectedCue = cue;
                this.renderCues();
            }
        }

        // Build drag group (Chain Selection if no Ctrl AND Snap Cue Active)
        let dragIds = new Set(this.selectedCues);
        const snapCueEl = document.getElementById('snap-cue');
        const snapCueActive = snapCueEl ? snapCueEl.checked : true;
        const useChain = !e.ctrlKey && !e.metaKey && snapCueActive;

        if (useChain) {
            const EPSILON = 0.05; // 50ms tolerance for loose connections
            let changed = true;
            let loops = 0;
            while (changed && loops < 50) { // Limit iterations
                changed = false;
                loops++;
                const currentIds = Array.from(dragIds);
                this.cues.forEach(c => {
                    if (dragIds.has(c.id)) return;
                    const isConnected = currentIds.some(id => {
                        const existing = this.cues.find(ex => ex.id === id);
                        if (!existing || existing.trackId !== c.trackId) return false;
                        const endToStart = Math.abs((existing.startTime + existing.duration) - c.startTime) < EPSILON;
                        const startToEnd = Math.abs((c.startTime + c.duration) - existing.startTime) < EPSILON;
                        return endToStart || startToEnd;
                    });
                    if (isConnected) {
                        dragIds.add(c.id);
                        changed = true;
                    }
                });
            }
        }

        const group = [];
        dragIds.forEach(id => {
            const c = this.cues.find(x => x.id === id);
            if (c) group.push({ cue: c, originalTime: c.startTime });
        });

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

        group.forEach(g => {
            const el = this.cueElements.get(g.cue.id);
            if (el) el.classList.add('dragging');
        });
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
        ghost.style.pointerEvents = 'none'; // Ghosts don't block clicks
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
            offsetY: 20,
            duration: dur
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
                const snapThreshold = 5 / this.pixelsPerSecond;

                // Toggles
                const snapGridEl = document.getElementById('snap-grid');
                const snapCueEl = document.getElementById('snap-cue');
                const useGrid = snapGridEl ? snapGridEl.checked : true;
                const useCue = snapCueEl ? snapCueEl.checked : true;

                // 1. Grid Snap
                if (useGrid) {
                    const gridSnapStart = Math.round(rawTargetTime / this.snapGrid) * this.snapGrid;
                    candidates.push({ time: gridSnapStart, dist: Math.abs(gridSnapStart - rawTargetTime), type: 'grid' });
                }

                // 2. Object Snap
                if (useCue) {
                    const ignoreIds = this.dragState.group.map(g => g.cue.id);
                    // Allow cross-track snapping (removed currentTrackId check)
                    const otherCues = this.cues.filter(c => !ignoreIds.includes(c.id));


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
                }

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
                pt.y = Math.max(0.2, Math.min(0.8, y)); // 10px margin Top/Bottom (0.2 - 0.8)

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
                // Use duration from dragState (may have been changed via scroll wheel)
                let dur = this.dragState.duration || 2;
                if (!dur || isNaN(dur) || dur <= 0) dur = 2;

                // Determine Default Automation (Dimmer/Zoom start at TOP)
                let autoPoints = null;
                if (scene) {
                    let data = scene.channel_data;
                    if (typeof data === 'string') { try { data = JSON.parse(data); } catch (e) { } }
                    let isTopStart = false;
                    const check = (idx) => {
                        const ch = this.channelMap[idx];
                        // Check for Dimmer or Beam (Zoom/Iris/etc)
                        if (ch && (ch.isDimmer || ch.isBeam)) isTopStart = true;
                    };
                    if (Array.isArray(data)) data.forEach((v, i) => v !== null && check(i));
                    else if (typeof data === 'object') Object.keys(data).forEach(k => check(parseInt(k) - 1));

                    if (isTopStart) autoPoints = [{ x: 0, y: 0.8 }, { x: 1, y: 0.8 }];
                }

                this.createCue(trackId, scene.id, scene.name, startTime, dur, isCtrl, autoPoints);
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

        // Clean up DMX tooltip


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
        this.channelMap = new Array(512).fill(null).map(() => ({ isIntensity: false, isPosition: false, isBeam: false, isSpeed: false, isControl: false }));

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
                // Substring matching for robustness
                const has = (keywords) => funcList.some(f => keywords.some(k => f.includes(k)));
                const exact = (keywords) => funcList.some(f => keywords.includes(f));

                const isDimmer = has(['dim', 'intensity', 'brightness']);
                const isColor = has(['red', 'green', 'blue', 'white', 'color', 'cyan', 'magenta', 'yellow', 'amber', 'uv']) || exact(['r', 'g', 'b', 'w', 'c', 'm', 'y', 'a']);
                const isPosition = has(['pan', 'tilt']) || exact(['p', 't']);
                const isBeam = has(['zoom', 'iris', 'focus', 'gobo', 'prism', 'frost', 'blade']);
                const isSpeed = has(['speed', 'rate']);
                const isControl = has(['strobe', 'shutter', 'macro', 'reset', 'lamp', 'control', 'func', 'flash', 'duration', 'ctrl']);

                this.channelMap[absIdx].isDimmer = isDimmer;
                this.channelMap[absIdx].isColor = isColor;
                this.channelMap[absIdx].isIntensity = isDimmer || (isColor && !this.hasSeparateDimmer(assign));
                this.channelMap[absIdx].isPosition = isPosition;
                this.channelMap[absIdx].isBeam = isBeam;
                this.channelMap[absIdx].isSpeed = isSpeed;
                this.channelMap[absIdx].isControl = isControl;
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
        // Safer ID generation to avoid duplicates after delete
        const maxId = this.tracks.reduce((max, t) => Math.max(max, parseInt(t.id) || 0), 0);
        const trackId = maxId + 1;
        this.tracks.push({ id: trackId, name: `Track ${trackId}`, cues: [], muted: false });
        if (render) this.renderTracks();
    }

    toggleMute(trackId) {
        const track = this.tracks.find(t => t.id === trackId);
        if (!track) return;

        // Migrate legacy muteGroup to muteGroups
        if (track.muteGroup && !track.muteGroups) track.muteGroups = [track.muteGroup];

        const newState = !track.muted;
        track.muted = newState;

        if (track.muteGroups && track.muteGroups.length > 0) {
            this.tracks.forEach(t => {
                if (t === track) return;
                if (t.muteGroup && !t.muteGroups) t.muteGroups = [t.muteGroup]; // Migrate other
                if (t.muteGroups && t.muteGroups.some(g => track.muteGroups.includes(g))) {
                    t.muted = newState;
                }
            });
        }

        this.renderTracks();
    }

    setMuteGroup(track, group) {
        if (!track.muteGroups) track.muteGroups = [];
        if (track.muteGroup) { track.muteGroups.push(track.muteGroup); delete track.muteGroup; }

        if (track.muteGroups.includes(group)) {
            track.muteGroups = track.muteGroups.filter(g => g !== group);
        } else {
            track.muteGroups.push(group);
        }
        this.renderTracks();
    }

    setBPM(bpm) {
        if (!bpm || bpm < 1) bpm = 60;
        this.bpm = bpm;
        this.speed = this.bpm / 60;
        this.snapGrid = (60 / this.bpm) / 4;
        const el = document.getElementById('bpm-input');
        if (el) el.value = Math.round(bpm);
        this.renderGrid();
    }

    handleTap() {
        const now = Date.now();
        if (this.lastTapTime && (now - this.lastTapTime > 2000)) {
            this.tapTimes = [];
        }
        this.lastTapTime = now;
        this.tapTimes.push(now);
        // Keep max 10 for rolling average
        if (this.tapTimes.length > 10) this.tapTimes.shift();

        if (this.tapTimes.length > 1) {
            let intervals = [];
            for (let i = 1; i < this.tapTimes.length; i++) {
                intervals.push(this.tapTimes[i] - this.tapTimes[i - 1]);
            }
            const avgMs = intervals.reduce((a, b) => a + b, 0) / intervals.length;
            const bpm = Math.round(60000 / avgMs);
            this.setBPM(bpm);
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
            nameSpan.ondblclick = (e) => { e.stopPropagation(); this.renameTrack(track.id); }; // Moved here

            label.oncontextmenu = (e) => { e.preventDefault(); e.stopPropagation(); this.showTrackContextMenu(e, track); return false; };

            const muteBtn = document.createElement('button');
            muteBtn.className = `mute-btn ${track.muted ? 'active' : ''}`;
            muteBtn.textContent = 'M';
            muteBtn.title = 'Mute/Unmute';
            muteBtn.onclick = (e) => {
                e.stopPropagation();
                this.toggleMute(track.id);
            };

            const menuBtn = document.createElement('button');
            menuBtn.className = 'track-menu-btn';
            menuBtn.innerHTML = '&#8942;';
            menuBtn.title = 'Options';
            menuBtn.onclick = (e) => {
                e.stopPropagation();
                const rect = menuBtn.getBoundingClientRect();
                this.showTrackContextMenu({ clientX: rect.left, clientY: rect.bottom, preventDefault: () => { } }, track);
            };

            label.appendChild(nameSpan);
            label.appendChild(menuBtn);
            label.appendChild(muteBtn);

            const mgContainer = document.createElement('div');
            mgContainer.className = 'mute-groups';
            ['A', 'B', 'C'].forEach(grp => {
                const box = document.createElement('div');
                const groups = track.muteGroups || (track.muteGroup ? [track.muteGroup] : []);
                const isActive = groups.includes(grp);
                box.className = `mute-group grp-${grp.toLowerCase()} ${isActive ? 'active' : ''}`;
                box.title = `Mute Group ${grp}`;
                box.onclick = (e) => {
                    e.stopPropagation();
                    this.setMuteGroup(track, grp);
                };
                mgContainer.appendChild(box);
            });
            label.appendChild(mgContainer);

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
                if (e.target.closest('.track-label')) return; // Let track label handle it
                this.showTimelineContextMenu(e);
            });

            container.appendChild(trackEl);
        });
        this.renderCues();
        this.renderGrid();
    }

    renderGrid() {
        let overlay = document.getElementById('grid-overlay');
        const container = document.getElementById('tracks-container');
        if (!container) return;

        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'grid-overlay';
            overlay.style.position = 'absolute';
            overlay.style.top = '0';
            overlay.style.left = `${LEFT_MARGIN}px`;
            overlay.style.pointerEvents = 'none';
            overlay.style.zIndex = '5';
            overlay.style.height = '100%';
            container.appendChild(overlay);
        }

        if (!overlay.parentNode) container.appendChild(overlay);

        const width = (this.maxTime * this.pixelsPerSecond);
        overlay.style.width = `${width}px`;

        const bpm = this.speed * 60;
        const beatSec = 60 / bpm;
        const beatPx = beatSec * this.pixelsPerSecond;
        const subBeatPx = beatPx / 2;

        const subGrid = `repeating-linear-gradient(90deg, transparent, transparent ${subBeatPx - 1}px, rgba(255,255,255,0.03) ${subBeatPx - 1}px, rgba(255,255,255,0.03) ${subBeatPx}px)`;
        const mainGrid = `repeating-linear-gradient(90deg, transparent, transparent ${beatPx - 1}px, rgba(255,255,255,0.08) ${beatPx - 1}px, rgba(255,255,255,0.08) ${beatPx}px)`;

        overlay.style.backgroundImage = `${mainGrid}, ${subGrid}`;
    }

    renameTrack(trackId) {
        const track = this.tracks.find(t => t.id === trackId);
        if (!track) return;
        const newName = prompt('Track Name:', track.name);
        if (newName && newName.trim() !== '') {
            track.name = newName.trim();
            this.renderTracks();
        }
    }

    deleteTrack(trackId) {
        if (!confirm('Delete this track and all cues on it?')) return;
        this.cues = this.cues.filter(c => c.trackId !== trackId);
        this.tracks = this.tracks.filter(t => t.id !== trackId);
        this.renderTracks();
        this.renderCues();
    }

    showTrackContextMenu(e, track) {
        const menu = document.getElementById('track-context-menu');
        if (!menu) return;

        const rename = document.getElementById('ctx-track-rename');
        const del = document.getElementById('ctx-track-delete');

        // Clone to clear listeners
        const rClone = rename.cloneNode(true);
        rename.parentNode.replaceChild(rClone, rename);
        const dClone = del.cloneNode(true);
        del.parentNode.replaceChild(dClone, del);

        rClone.onclick = () => { this.renameTrack(track.id); menu.style.display = 'none'; };
        dClone.onclick = () => { this.deleteTrack(track.id); menu.style.display = 'none'; };

        menu.style.left = `${e.clientX}px`;
        menu.style.top = `${e.clientY}px`;
        menu.style.display = 'block';

        this.hideContextMenu(); // Close other menus

        const close = () => { menu.style.display = 'none'; document.removeEventListener('click', close); };
        setTimeout(() => document.addEventListener('click', close), 50);
    }

    createCue(trackId, sceneId, sceneName, startTime, duration = 2, ignoreCollisions = false, automationPoints = null) {
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
            automationPoints: automationPoints || [{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }]
        };
        this.cues.push(cue);
        if (!ignoreCollisions) this.resolveCollisions(cue);
        this.renderCues();
    }

    getCueColor(scene) {
        if (!scene) return null;

        // Analyze channels
        let data = scene.channel_data;
        if (typeof data === 'string') {
            try { data = JSON.parse(data); } catch (e) { }
        }

        let hasPos = false, hasColor = false, hasBeam = false, hasSpeed = false, hasControl = false, hasDim = false;

        const check = (idx) => {
            const ch = this.channelMap[idx];
            if (!ch) return;
            if (ch.isPosition) hasPos = true;
            if (ch.isColor) hasColor = true;
            if (ch.isBeam) hasBeam = true;
            if (ch.isSpeed) hasSpeed = true;
            if (ch.isControl) hasControl = true;
            if (ch.isDimmer) hasDim = true;
        };

        if (Array.isArray(data)) {
            data.forEach((val, idx) => { if (val !== null) check(idx); });
        } else if (data && typeof data === 'object') {
            Object.keys(data).forEach(ch => check(parseInt(ch) - 1));
        }

        // Priority Order
        if (hasControl) return '#607D8B'; // Blue Grey
        if (hasSpeed) return '#FF9800';   // Orange
        if (hasPos) return '#E91E63';     // Pink
        if (hasBeam) return '#4CAF50';    // Green
        if (hasColor) return '#00BCD4';   // Cyan
        if (hasDim) return '#3F51B5';     // Indigo (standard-ish)

        return null; // Default
    }

    getGroupColor(id) {
        if (!id) return null;
        const colors = [
            '#d32f2f', '#c2185b', '#7b1fa2', '#512da8', '#303f9f',
            '#1976d2', '#0288d1', '#0097a7', '#00796b', '#388e3c',
            '#689f38', '#afb42b', '#fbc02d', '#ffa000', '#f57c00',
            '#e64a19', '#5d4037', '#616161'
        ]; // Slightly darker palette for better contrast with white text
        const num = parseInt(id) || 0;
        const idx = Math.abs(num) % colors.length;
        return colors[idx];
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
                    <div class="cue-dmx-value"></div>
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

            // --- Attribute Coloring ---
            const sceneObj = this.scenes.find(s => s.id === cue.sceneId);

            if (sceneObj) {
                const color = this.getCueColor(sceneObj);
                if (color) block.style.setProperty('--cue-bg', color);
                else block.style.removeProperty('--cue-bg');
            } else {
                block.style.removeProperty('--cue-bg');
            }

            block.querySelector('.cue-block-name').textContent = displayName;
            block.querySelector('.cue-block-time').textContent = `${cue.startTime.toFixed(2)}s`;


            // --- RENDER AUTOMATION ---
            this.renderAutomation(cue, block);

            // --- UPDATE DMX VALUE DISPLAY (only for Speed, Color, Control) ---
            const dmxValueEl = block.querySelector('.cue-dmx-value');
            if (dmxValueEl && cue.automationPoints && cue.automationPoints.length > 0) {
                // Determine scene attribute type
                const scene = this.scenes.find(s => s.id === cue.sceneId);
                let showDmxValue = false;
                let isSpeedCue = false;

                if (scene) {
                    let data = scene.channel_data;
                    if (typeof data === 'string') {
                        try { data = JSON.parse(data); } catch (e) { }
                    }

                    // Check if scene contains Speed, Color, or Control attributes
                    const checkChannels = (idx) => {
                        const ch = this.channelMap[idx];
                        if (!ch) return false;
                        if (ch.isSpeed) isSpeedCue = true;
                        return ch.isSpeed || ch.isColor || ch.isControl;
                    };

                    if (Array.isArray(data)) {
                        showDmxValue = data.some((val, idx) => checkChannels(idx));
                    } else if (data && typeof data === 'object') {
                        showDmxValue = Object.keys(data).some(ch => checkChannels(parseInt(ch) - 1));
                    }
                }

                if (showDmxValue) {
                    const relativeTime = this.currentTime - cue.startTime;
                    const factor = this.getAutomationValue(cue, relativeTime); // Returns 0.0 - 1.0

                    let dmxValue = Math.round(factor * 255);
                    // Invert display for Speed cues to match output logic
                    if (isSpeedCue) {
                        dmxValue = Math.round(255 * (1.0 - factor));
                    }

                    dmxValueEl.textContent = dmxValue;
                    dmxValueEl.style.display = 'block';
                } else {
                    dmxValueEl.style.display = 'none';
                }
            }

            if (this.selectedCues.has(cue.id)) block.classList.add('selected');
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
        if (cue.type === 'fx' && cue.channel_data && cue.channel_data.waveform) {
            const layer = block.querySelector('.automation-layer');
            if (layer) {
                layer.style.display = 'block';
                const svg = layer.querySelector('svg');
                const path = svg.querySelector('.automation-line');
                const wf = cue.channel_data.waveform;
                const speed = parseFloat(cue.channel_data.speed || 1.0);
                const duration = cue.duration;
                const cycles = duration * speed;

                let d = '';
                const steps = 100;
                for (let i = 0; i <= steps; i++) {
                    const t = i / steps;
                    const tAbs = t * cycles;
                    let val = 0;
                    switch (wf) {
                        case 'sine': val = Math.sin(tAbs * Math.PI * 2); break;
                        case 'square': val = (tAbs % 1) < 0.5 ? 1 : -1; break;
                        case 'saw': val = 1 - 2 * (tAbs % 1); break;
                        case 'ramp': val = 2 * (tAbs % 1) - 1; break;
                        case 'strobe': val = (tAbs % 1) < 0.5 ? 1 : -1; break;
                        default: val = 0;
                    }

                    const normalizedY = 0.5 + (val * 0.4);
                    const svgX = t * 100;
                    const svgY = 100 - (normalizedY * 100);
                    d += `${i === 0 ? 'M' : 'L'} ${svgX.toFixed(1)} ${svgY.toFixed(1)} `;
                }
                path.setAttribute('d', d);
                path.style.stroke = '#e040fb';
                path.style.strokeWidth = '1.5';
                path.onmousedown = (e) => { e.stopPropagation(); };

                const nodesContainer = layer.querySelector('.automation-nodes');
                if (nodesContainer) nodesContainer.innerHTML = '';
            }
            return;
        }

        // Show Automation Line if Cue controls any automatable attribute
        const scene = this.scenes.find(s => s.id === cue.sceneId);
        let hasAutomatableAttribute = false;

        if (scene) {
            if (scene.type === 'chaser') {
                hasAutomatableAttribute = true;
            } else {
                let data = scene.channel_data;
                if (typeof data === 'string') { try { data = JSON.parse(data); } catch (e) { } }

                if (Array.isArray(data)) {
                    // Check if any channel is automatable (Intensity, Speed, Beam, Control)
                    hasAutomatableAttribute = data.some((val, idx) => {
                        if (!this.channelMap[idx]) return false;
                        const ch = this.channelMap[idx];
                        return ch.isIntensity || ch.isSpeed || ch.isBeam || ch.isControl;
                    });
                } else if (data && typeof data === 'object') {
                    // Object format { "1": 255 }
                    hasAutomatableAttribute = Object.entries(data).some(([ch, val]) => {
                        const idx = parseInt(ch) - 1;
                        if (!this.channelMap[idx]) return false;
                        const chInfo = this.channelMap[idx];
                        return chInfo.isIntensity || chInfo.isSpeed || chInfo.isBeam || chInfo.isControl;
                    });
                }
            }
        }

        const layer = block.querySelector('.automation-layer');
        if (!hasAutomatableAttribute) {
            layer.style.display = 'none'; // Hide if no automatable attributes
            return;
        }
        layer.style.display = 'block';

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
                y: Math.max(0.2, Math.min(0.8, y)) // 10px margin Top/Bottom
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

        // Mapping: yNorm 0.2 (Bottom) -> Factor 0.0
        //          yNorm 0.8 (Top) -> Factor 1.0
        return Math.max(0, Math.min(1.0, (yNorm - 0.2) / 0.6));
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
    copySelectedCue() {
        if (this.selectedCues.size === 0) return;

        this.clipboard = [];
        this.selectedCues.forEach(id => {
            const cue = this.cues.find(c => c.id === id);
            if (cue) {
                this.clipboard.push(JSON.parse(JSON.stringify(cue)));
            }
        });

        console.log(`📋 Copied ${this.clipboard.length} cues to clipboard.`);

        // Visual feedback
        this.selectedCues.forEach(id => {
            const block = this.cueElements.get(id);
            if (block) {
                block.style.filter = 'brightness(1.5)';
                setTimeout(() => block.style.filter = '', 200);
            }
        });
    }

    pasteCue() {
        if (!this.clipboard || this.clipboard.length === 0) return;

        // Calculate offset based on earliest start time
        let minTime = Infinity;
        this.clipboard.forEach(c => { if (c.startTime < minTime) minTime = c.startTime; });

        const timeDelta = this.currentTime - minTime;

        this.selectedCues.clear();
        this.selectedCue = null;

        this.clipboard.forEach(clipCue => {
            const newCue = JSON.parse(JSON.stringify(clipCue));
            newCue.id = `cue_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
            newCue.startTime = Math.max(0, clipCue.startTime + timeDelta);
            // newCue.trackId remains same as source (DAW behavior)

            this.cues.push(newCue);
            this.resolveCollisions(newCue);

            this.selectedCues.add(newCue.id);
            this.selectedCue = newCue; // Update last accessed
        });

        this.renderCues();
        console.log(`📋 Pasted ${this.clipboard.length} cues.`);
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

        // 2. Sort active cues by TRACK ORDER (Layering) then StartTime
        // This makes tracks act as Layers: Track 1 (Bottom) < Track 2 (Top).
        // User wants "Violett" (Track 2) to override "W1 Down" (Track 1).
        // Assuming Track 2 has higher Index in this.tracks array.
        const getTrackIndex = (tId) => this.tracks.findIndex(t => t.id === tId);

        const sortedActiveCues = Array.from(this.activeCues)
            .map(id => this.cues.find(c => c.id === id))
            .filter(c => c)
            .sort((a, b) => {
                const idxA = getTrackIndex(a.trackId);
                const idxB = getTrackIndex(b.trackId);
                // Primary Sort: Track Index (Lower Index = Background, Higher Index = Foreground)
                if (idxA !== idxB) return idxA - idxB;
                // Secondary Sort: StartTime (LTP within same track)
                return a.startTime - b.startTime;
            });

        for (const cue of sortedActiveCues) {
            const scene = this.scenes.find(s => s.id === cue.sceneId);
            if (!scene || scene.type === 'chaser') continue;

            const factor = this.getAutomationValue(cue, this.currentTime - cue.startTime);
            let data = scene.channel_data;
            if (typeof data === 'string') {
                try { data = JSON.parse(data); } catch (e) { data = []; }
            }

            // NEW: Determine which attribute type should receive automation
            // Priority: Intensity > Speed > Beam > Control
            let automationTarget = null; // 'intensity', 'speed', 'beam', 'control', or null
            const sceneAttributeCounts = { intensity: 0, speed: 0, beam: 0, control: 0, other: 0 };

            // Scan scene channels to determine attribute distribution
            const scanChannel = (idx) => {
                if (idx >= 512) return;
                const chanInfo = this.channelMap[idx];
                if (chanInfo.isIntensity) sceneAttributeCounts.intensity++;
                else if (chanInfo.isSpeed) sceneAttributeCounts.speed++;
                else if (chanInfo.isBeam) sceneAttributeCounts.beam++;
                else if (chanInfo.isControl) sceneAttributeCounts.control++;
                else sceneAttributeCounts.other++;
            };

            if (Array.isArray(data)) {
                data.forEach((val, idx) => scanChannel(idx));
            } else if (typeof data === 'object' && data !== null) {
                Object.keys(data).forEach(ch => scanChannel(parseInt(ch) - 1));
            }

            // Determine automation target based on priority
            if (sceneAttributeCounts.intensity > 0) automationTarget = 'intensity';
            else if (sceneAttributeCounts.speed > 0) automationTarget = 'speed';
            else if (sceneAttributeCounts.beam > 0) automationTarget = 'beam';
            else if (sceneAttributeCounts.control > 0) automationTarget = 'control';

            const processChannel = (idx, valRaw) => {
                if (idx >= 512) return;
                addressedThisFrame.add(idx);
                const chanInfo = this.channelMap[idx];
                const isInt = chanInfo.isIntensity;
                const isSpeed = chanInfo.isSpeed;
                const isBeam = chanInfo.isBeam;
                const isControl = chanInfo.isControl;

                // Determine if THIS channel should receive automation
                let applyAutomation = false;
                if (automationTarget === 'intensity' && isInt) applyAutomation = true;
                else if (automationTarget === 'speed' && isSpeed) applyAutomation = true;
                else if (automationTarget === 'beam' && isBeam) applyAutomation = true;
                else if (automationTarget === 'control' && isControl) applyAutomation = true;

                let finalVal;
                if (isInt) {
                    // HTP for Intensity (Dimmer)
                    const v = (typeof valRaw === 'number') ? valRaw : (valRaw.value || 0);
                    finalVal = applyAutomation ? Math.round(v * factor) : v;
                    frameBuffer[idx] = Math.max(frameBuffer[idx], finalVal);
                } else if (isSpeed && applyAutomation) {
                    // INVERTED for Speed: factor 1.0 (Top) → DMX 0 (Fast), factor 0.0 (Bottom) → DMX 255 (Slow)
                    finalVal = Math.round(255 * (1.0 - factor));
                    frameBuffer[idx] = finalVal;
                } else {
                    // LTP for Attributes (Color, Position, Beam, Control)
                    const v = (typeof valRaw === 'number') ? valRaw : (valRaw.value || 0);

                    if (applyAutomation) {
                        // Apply automation to beam/control channels
                        if (factor < 0.01) {
                            // Cue is invisible, don't overwrite
                        } else if (factor >= 0.99) {
                            frameBuffer[idx] = v;
                        } else {
                            // Crossfade with automation factor
                            const current = frameBuffer[idx];
                            frameBuffer[idx] = current + (v - current) * factor;
                        }
                    } else {
                        // No automation: Standard LTP logic for attributes
                        if (factor < 0.01) {
                            // Cue is invisible
                        } else if (factor >= 0.99) {
                            frameBuffer[idx] = v;
                        } else {
                            const current = frameBuffer[idx];
                            frameBuffer[idx] = current + (v - current) * factor;
                        }
                    }
                }
            };

            if (Array.isArray(data)) {
                data.forEach((val, idx) => processChannel(idx, val));
            } else if (typeof data === 'object' && data !== null) {
                Object.entries(data).forEach(([ch, val]) => {
                    const idx = parseInt(ch) - 1;
                    processChannel(idx, parseInt(val));
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
            duration: 2.0,
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
    async loadShow() {
        try {
            const res = await fetch(`${API}/api/timeline`);
            const data = await res.json();

            if (data.success && data.timeline) {
                const tl = data.timeline;
                this.tracks = tl.tracks || [];
                this.cues = tl.cues || [];
                this.maxTime = tl.maxTime || 60;
                this.speed = tl.speed || 1.0;
                const bpm = Math.round(this.speed * 60);
                const bpmEl = document.getElementById('bpm-input');
                if (bpmEl) bpmEl.value = bpm;

                // Fallback if empty
                if (this.tracks.length === 0) {
                    this.addTrack(false); this.addTrack(false); this.addTrack(false);
                }
                console.log('✅ Loaded Timeline');
            } else {
                console.log('ℹ️ No saved timeline, starting fresh.');
                this.addTrack(false); this.addTrack(false); this.addTrack(false);
            }
        } catch (e) {
            console.error('Failed to load timeline:', e);
            this.addTrack(false); this.addTrack(false); this.addTrack(false);
        }
    }

    async saveShow() {
        const showData = {
            tracks: this.tracks,
            cues: this.cues,
            maxTime: this.maxTime,
            speed: this.speed
        };

        try {
            const res = await fetch(`${API}/api/timeline`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(showData)
            });
            const result = await res.json();

            if (result.success) {
                console.log('✅ Show saved successfully');
                const btn = document.getElementById('save-show-btn');
                if (btn) {
                    const originalText = btn.innerHTML; // Use innerHTML to preserve icon if any
                    btn.innerText = 'Saved!';
                    btn.style.background = '#4CAF50';
                    setTimeout(() => {
                        btn.innerHTML = originalText;
                        btn.style.background = '';
                    }, 2000);
                }
            } else {
                alert('Failed to save: ' + result.error);
            }
        } catch (e) {
            console.error('Error saving show:', e);
            alert('Error saving show');
        }
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
