/**
 * Cue Editor - DAW Style Timeline
 * Professional show control with drag & drop, playback, and timeline editing
 */

const API = `http://${window.location.hostname}:3000`;

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
        this.playbackInterval = null;
        this.selectedCue = null;

        this.init();
    }

    async init() {
        console.log('🎬 Initializing Cue Editor...');

        // Load scenes
        await this.loadScenes();

        // Create default tracks
        this.addTrack();
        this.addTrack();
        this.addTrack();

        // Render UI
        this.renderTimeline();
        this.renderTracks();
        this.renderScenePool();

        // Attach events
        this.attachEvents();
    }

    attachEvents() {
        // Transport controls
        document.getElementById('btn-play').onclick = () => this.play();
        document.getElementById('btn-pause').onclick = () => this.pause();
        document.getElementById('btn-stop').onclick = () => this.stop();
        document.getElementById('btn-prev').onclick = () => this.prevCue();
        document.getElementById('btn-next').onclick = () => this.nextCue();
        document.getElementById('btn-loop').onclick = () => this.toggleLoop();

        // Speed control
        document.getElementById('speed-slider').oninput = (e) => {
            this.speed = parseFloat(e.target.value);
            document.getElementById('speed-value').textContent = `${this.speed.toFixed(1)}x`;
        };

        // Track controls
        document.getElementById('add-track-btn').onclick = () => this.addTrack();
        document.getElementById('clear-timeline-btn').onclick = () => this.clearTimeline();
        document.getElementById('save-show-btn').onclick = () => this.saveShow();

        // Close
        document.getElementById('close-btn').onclick = () => {
            window.location.href = 'dashboard.php';
        };

        // Cue modal
        document.getElementById('cancel-cue-btn').onclick = () => this.hideCueModal();
        document.getElementById('delete-cue-btn').onclick = () => this.deleteSelectedCue();
        document.getElementById('cue-form').onsubmit = (e) => {
            e.preventDefault();
            this.saveCueProperties();
        };
    }

    // === SCENES ===

    async loadScenes() {
        try {
            const res = await fetch(`${API}/api/scenes`);
            const data = await res.json();
            if (data.success) {
                this.scenes = data.scenes || [];
            }
        } catch (e) {
            console.error('Failed to load scenes:', e);
        }
    }

    renderScenePool() {
        const container = document.getElementById('scene-pool');
        container.innerHTML = '';

        this.scenes.forEach(scene => {
            const item = document.createElement('div');
            item.className = 'pool-scene';
            item.textContent = scene.name;
            item.draggable = true;
            item.dataset.sceneId = scene.id;

            item.ondragstart = (e) => {
                e.dataTransfer.setData('sceneId', scene.id);
                e.dataTransfer.setData('sceneName', scene.name);
            };

            container.appendChild(item);
        });
    }

    // === TIMELINE ===

    renderTimeline() {
        const ruler = document.getElementById('timeline-ruler');
        ruler.innerHTML = '';
        ruler.style.width = `${this.maxTime * this.pixelsPerSecond}px`;

        for (let i = 0; i <= this.maxTime; i += 5) {
            const marker = document.createElement('div');
            marker.className = 'time-marker';
            marker.style.left = `${i * this.pixelsPerSecond}px`;
            marker.textContent = `${i}s`;
            ruler.appendChild(marker);
        }
    }

    // === TRACKS ===

    addTrack() {
        const trackId = this.tracks.length + 1;
        this.tracks.push({
            id: trackId,
            name: `Track ${trackId}`,
            cues: []
        });
        this.renderTracks();
    }

    renderTracks() {
        const container = document.getElementById('tracks-container');
        container.innerHTML = '';
        container.style.width = `${this.maxTime * this.pixelsPerSecond}px`;

        this.tracks.forEach(track => {
            const trackEl = document.createElement('div');
            trackEl.className = 'track';
            trackEl.dataset.trackId = track.id;

            const label = document.createElement('div');
            label.className = 'track-label';
            label.textContent = track.name;

            const content = document.createElement('div');
            content.className = 'track-content';

            // Allow drop
            content.ondragover = (e) => e.preventDefault();
            content.ondrop = (e) => this.handleDrop(e, track.id);

            trackEl.appendChild(label);
            trackEl.appendChild(content);
            container.appendChild(trackEl);
        });

        // Render all cues
        this.renderCues();
    }

    handleDrop(e, trackId) {
        e.preventDefault();
        const sceneId = parseInt(e.dataTransfer.getData('sceneId'));
        const sceneName = e.dataTransfer.getData('sceneName');

        // Calculate drop position in seconds
        const rect = e.target.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const startTime = x / this.pixelsPerSecond;

        // Create cue
        this.createCue(trackId, sceneId, sceneName, startTime);
    }

    createCue(trackId, sceneId, sceneName, startTime, duration = 5) {
        const cue = {
            id: Date.now(),
            trackId,
            sceneId,
            sceneName,
            startTime,
            duration,
            fadeIn: 0,
            fadeOut: 0
        };

        this.cues.push(cue);
        this.renderCues();
    }

    renderCues() {
        // Clear existing cue blocks
        document.querySelectorAll('.cue-block').forEach(el => el.remove());

        this.cues.forEach(cue => {
            const track = document.querySelector(`[data-track-id="${cue.trackId}"] .track-content`);
            if (!track) return;

            const block = document.createElement('div');
            block.className = 'cue-block';
            block.dataset.cueId = cue.id;
            block.style.left = `${cue.startTime * this.pixelsPerSecond}px`;
            block.style.width = `${cue.duration * this.pixelsPerSecond}px`;

            block.innerHTML = `
                <div class="cue-block-name">${cue.sceneName}</div>
                <div class="cue-block-time">${cue.startTime.toFixed(1)}s - ${(cue.startTime + cue.duration).toFixed(1)}s</div>
                <div class="cue-resize-handle"></div>
            `;

            // Double click to edit
            block.ondblclick = () => this.editCue(cue);

            // Drag to move
            block.draggable = true;
            block.ondragstart = (e) => {
                e.dataTransfer.setData('cueId', cue.id);
                e.stopPropagation();
            };

            track.appendChild(block);
        });
    }

    editCue(cue) {
        this.selectedCue = cue;
        document.getElementById('cue-name').value = cue.sceneName;
        document.getElementById('cue-start').value = cue.startTime;
        document.getElementById('cue-duration').value = cue.duration;
        document.getElementById('cue-fade-in').value = cue.fadeIn;
        document.getElementById('cue-fade-out').value = cue.fadeOut;
        document.getElementById('cue-modal').classList.add('active');
    }

    hideCueModal() {
        document.getElementById('cue-modal').classList.remove('active');
        this.selectedCue = null;
    }

    saveCueProperties() {
        if (!this.selectedCue) return;

        this.selectedCue.startTime = parseFloat(document.getElementById('cue-start').value);
        this.selectedCue.duration = parseFloat(document.getElementById('cue-duration').value);
        this.selectedCue.fadeIn = parseFloat(document.getElementById('cue-fade-in').value);
        this.selectedCue.fadeOut = parseFloat(document.getElementById('cue-fade-out').value);

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
        this.renderCues();
    }

    // === PLAYBACK ===

    play() {
        if (this.isPlaying && !this.isPaused) return;

        this.isPlaying = true;
        this.isPaused = false;

        this.playbackInterval = setInterval(() => {
            this.currentTime += (0.1 * this.speed);

            // Update playhead
            this.updatePlayhead();

            // Check for cues to trigger
            this.checkCues();

            // Loop or stop at end
            if (this.currentTime >= this.maxTime) {
                if (this.loop) {
                    this.currentTime = 0;
                } else {
                    this.stop();
                }
            }
        }, 100);
    }

    pause() {
        this.isPaused = true;
        clearInterval(this.playbackInterval);
    }

    stop() {
        this.isPlaying = false;
        this.isPaused = false;
        this.currentTime = 0;
        clearInterval(this.playbackInterval);
        this.updatePlayhead();
    }

    toggleLoop() {
        this.loop = !this.loop;
        document.getElementById('btn-loop').classList.toggle('active', this.loop);
    }

    updatePlayhead() {
        const playhead = document.getElementById('playhead');
        playhead.style.left = `${this.currentTime * this.pixelsPerSecond}px`;

        const minutes = Math.floor(this.currentTime / 60);
        const seconds = (this.currentTime % 60).toFixed(1);
        document.getElementById('time-display').textContent =
            `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(4, '0')}`;
    }

    async checkCues() {
        this.cues.forEach(async cue => {
            const cueStart = cue.startTime;
            const cueEnd = cue.startTime + cue.duration;

            // Trigger cue if playhead is within range
            if (this.currentTime >= cueStart && this.currentTime < cueEnd) {
                // Highlight active cue
                const block = document.querySelector(`[data-cue-id="${cue.id}"]`);
                if (block) block.classList.add('active');

                // Recall scene (only once per cue)
                if (!cue.triggered) {
                    await this.recallScene(cue.sceneId);
                    cue.triggered = true;
                }
            } else {
                // Remove highlight
                const block = document.querySelector(`[data-cue-id="${cue.id}"]`);
                if (block) block.classList.remove('active');
                cue.triggered = false;
            }
        });
    }

    async recallScene(sceneId) {
        const scene = this.scenes.find(s => s.id === sceneId);
        if (!scene) return;

        try {
            let channelData = scene.channel_data;
            if (typeof channelData === 'string') {
                channelData = JSON.parse(channelData);
            }

            // Send all 512 channels
            const promises = [];
            for (let i = 0; i < 512; i++) {
                const value = channelData[i] || 0;
                promises.push(
                    fetch(`${API}/api/dmx/channel`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ channel: i + 1, value })
                    })
                );
            }
            await Promise.all(promises);
        } catch (e) {
            console.error('Failed to recall scene:', e);
        }
    }

    prevCue() {
        // Find previous cue
        const prevCues = this.cues.filter(c => c.startTime < this.currentTime).sort((a, b) => b.startTime - a.startTime);
        if (prevCues.length > 0) {
            this.currentTime = prevCues[0].startTime;
            this.updatePlayhead();
        }
    }

    nextCue() {
        // Find next cue
        const nextCues = this.cues.filter(c => c.startTime > this.currentTime).sort((a, b) => a.startTime - b.startTime);
        if (nextCues.length > 0) {
            this.currentTime = nextCues[0].startTime;
            this.updatePlayhead();
        }
    }

    async saveShow() {
        // TODO: Save show to database
        const showData = {
            tracks: this.tracks,
            cues: this.cues,
            maxTime: this.maxTime
        };
        console.log('Saving show:', showData);
        alert('Show saved! (TODO: Implement backend)');
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    window.cueEditor = new CueEditor();
});
