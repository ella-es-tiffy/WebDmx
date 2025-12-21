/**
 * Szenen-Manager
 * Verwaltet DMX-Szenen mit Ordner-Struktur
 * Vorbereitet für spätere Effects/Shapes (Kreise, Wellen, etc.)
 */

const API = `http://${window.location.hostname}:3000`;

class SceneManager {
    constructor() {
        this.scenes = [];
        this.folders = [];
        this.currentFolder = null;

        this.init();
    }

    async init() {
        console.log('🎬 Initializing Scene Manager...');

        // Load data
        await this.loadFolders();
        await this.loadScenes();

        // Render UI
        this.renderFolders();
        this.renderScenes();

        // Attach events
        this.attachEvents();
    }

    attachEvents() {
        // New Scene
        document.getElementById('new-scene-btn').onclick = () => this.showNewSceneModal();
        document.getElementById('cancel-scene-btn').onclick = () => this.hideNewSceneModal();
        document.getElementById('new-scene-form').onsubmit = (e) => {
            e.preventDefault();
            this.createScene();
        };

        // New Folder
        document.getElementById('new-folder-btn').onclick = () => this.showNewFolderModal();
        document.getElementById('cancel-folder-btn').onclick = () => this.hideNewFolderModal();
        document.getElementById('new-folder-form').onsubmit = (e) => {
            e.preventDefault();
            this.createFolder();
        };

        // Close
        document.getElementById('close-btn').onclick = () => {
            window.location.href = 'faders.html';
        };

        // Search
        document.getElementById('search-scenes').oninput = (e) => {
            this.filterScenes(e.target.value);
        };

        // Folder Filter
        document.getElementById('folder-filter').onchange = (e) => {
            this.currentFolder = e.target.value || null;
            this.renderScenes();
        };
    }

    // === FOLDERS ===

    async loadFolders() {
        try {
            const res = await fetch(`${API}/api/scene-folders`);
            const data = await res.json();
            if (data.success) {
                this.folders = data.folders || [];
            }
        } catch (e) {
            console.error('Failed to load folders:', e);
            this.folders = [];
        }
    }

    renderFolders() {
        const container = document.getElementById('folders-list');
        const filterSelect = document.getElementById('folder-filter');
        const sceneSelect = document.getElementById('scene-folder');

        container.innerHTML = '';
        filterSelect.innerHTML = '<option value="">Alle Ordner</option>';
        sceneSelect.innerHTML = '<option value="">Kein Ordner</option>';

        // "All Scenes" folder
        const allFolder = document.createElement('div');
        allFolder.className = 'folder-item' + (!this.currentFolder ? ' active' : '');
        allFolder.innerHTML = `
            <span class="folder-icon">📂</span>
            <span class="folder-name">Alle Szenen</span>
            <span class="folder-count">${this.scenes.length}</span>
        `;
        allFolder.onclick = () => {
            this.currentFolder = null;
            this.renderFolders();
            this.renderScenes();
        };
        container.appendChild(allFolder);

        // User folders
        this.folders.forEach(folder => {
            const sceneCount = this.scenes.filter(s => s.folder_id === folder.id).length;

            const item = document.createElement('div');
            item.className = 'folder-item' + (this.currentFolder === folder.id ? ' active' : '');
            item.innerHTML = `
                <span class="folder-icon">${folder.icon || '📁'}</span>
                <span class="folder-name">${folder.name}</span>
                <span class="folder-count">${sceneCount}</span>
            `;
            item.onclick = () => {
                this.currentFolder = folder.id;
                this.renderFolders();
                this.renderScenes();
            };
            container.appendChild(item);

            // Add to selects
            filterSelect.innerHTML += `<option value="${folder.id}">${folder.name}</option>`;
            sceneSelect.innerHTML += `<option value="${folder.id}">${folder.name}</option>`;
        });
    }

    showNewFolderModal() {
        document.getElementById('new-folder-modal').classList.add('active');
    }

    hideNewFolderModal() {
        document.getElementById('new-folder-modal').classList.remove('active');
        document.getElementById('new-folder-form').reset();
    }

    async createFolder() {
        const name = document.getElementById('folder-name').value;
        const icon = document.getElementById('folder-icon').value || '📁';

        try {
            const res = await fetch(`${API}/api/scene-folders`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, icon })
            });
            const data = await res.json();
            if (data.success) {
                await this.loadFolders();
                this.renderFolders();
                this.hideNewFolderModal();
            }
        } catch (e) {
            console.error('Failed to create folder:', e);
            alert('Fehler beim Erstellen des Ordners');
        }
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
            this.scenes = [];
        }
    }

    renderScenes() {
        const container = document.getElementById('scenes-grid');
        container.innerHTML = '';

        let filtered = this.scenes;
        if (this.currentFolder) {
            filtered = filtered.filter(s => s.folder_id === this.currentFolder);
        }

        if (filtered.length === 0) {
            container.innerHTML = '<p style="color: #888; grid-column: 1/-1; text-align: center; padding: 50px;">Keine Szenen vorhanden</p>';
            return;
        }

        filtered.forEach(scene => {
            const card = document.createElement('div');
            card.className = 'scene-card';

            const previewColor = scene.color || '#667eea';

            card.innerHTML = `
                <div class="scene-preview" style="background: ${previewColor}">
                    🎬
                </div>
                <div class="scene-info">
                    <div class="scene-name">${scene.name}</div>
                    <div class="scene-meta">
                        ${new Date(scene.created_at).toLocaleDateString('de-DE')}
                    </div>
                    <div class="scene-actions">
                        <button class="scene-btn recall">RECALL</button>
                        <button class="scene-btn">UPDATE</button>
                        <button class="scene-btn delete">DEL</button>
                    </div>
                </div>
            `;

            // Events
            card.querySelector('.recall').onclick = (e) => {
                e.stopPropagation();
                this.recallScene(scene);
            };
            card.querySelector('.scene-btn:nth-child(2)').onclick = (e) => {
                e.stopPropagation();
                this.updateScene(scene);
            };
            card.querySelector('.delete').onclick = (e) => {
                e.stopPropagation();
                this.deleteScene(scene);
            };

            container.appendChild(card);
        });
    }

    filterScenes(query) {
        const cards = document.querySelectorAll('.scene-card');
        cards.forEach(card => {
            const name = card.querySelector('.scene-name').textContent.toLowerCase();
            if (name.includes(query.toLowerCase())) {
                card.style.display = 'block';
            } else {
                card.style.display = 'none';
            }
        });
    }

    showNewSceneModal() {
        document.getElementById('new-scene-modal').classList.add('active');
    }

    hideNewSceneModal() {
        document.getElementById('new-scene-modal').classList.remove('active');
        document.getElementById('new-scene-form').reset();
    }

    async createScene() {
        const name = document.getElementById('scene-name').value;
        const folderId = document.getElementById('scene-folder').value || null;
        const color = document.getElementById('scene-color').value;

        try {
            // Get current DMX state from backend
            const dmxRes = await fetch(`${API}/api/dmx/channels`);
            const dmxData = await dmxRes.json();
            const channelData = dmxData.channels || new Array(512).fill(0);

            // Create scene
            const res = await fetch(`${API}/api/scenes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name,
                    folder_id: folderId,
                    color,
                    channel_data: channelData
                })
            });
            const data = await res.json();
            if (data.success) {
                await this.loadScenes();
                this.renderScenes();
                this.hideNewSceneModal();
                alert(`Szene "${name}" gespeichert!`);
            }
        } catch (e) {
            console.error('Failed to create scene:', e);
            alert('Fehler beim Erstellen der Szene');
        }
    }

    async recallScene(scene) {
        try {
            console.log(`🎬 Recalling scene: ${scene.name}`);

            // Parse channel data
            let channelData = scene.channel_data;
            if (typeof channelData === 'string') {
                channelData = JSON.parse(channelData);
            }

            // Send all 512 channels to backend
            for (let i = 0; i < 512; i++) {
                const value = channelData[i] || 0;
                if (value > 0) { // Only send non-zero values for efficiency
                    await fetch(`${API}/api/dmx/channel`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ channel: i + 1, value })
                    });
                }
            }

            console.log(`✅ Scene "${scene.name}" recalled`);
        } catch (e) {
            console.error('Failed to recall scene:', e);
            alert('Fehler beim Abrufen der Szene');
        }
    }

    async updateScene(scene) {
        if (!confirm(`Szene "${scene.name}" mit aktuellem DMX-State überschreiben?`)) return;

        try {
            // Get current DMX state
            const dmxRes = await fetch(`${API}/api/dmx/channels`);
            const dmxData = await dmxRes.json();
            const channelData = dmxData.channels || new Array(512).fill(0);

            // Update scene
            const res = await fetch(`${API}/api/scenes/${scene.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ channel_data: channelData })
            });
            const data = await res.json();
            if (data.success) {
                await this.loadScenes();
                this.renderScenes();
                alert(`Szene "${scene.name}" aktualisiert!`);
            }
        } catch (e) {
            console.error('Failed to update scene:', e);
            alert('Fehler beim Aktualisieren der Szene');
        }
    }

    async deleteScene(scene) {
        if (!confirm(`Szene "${scene.name}" wirklich löschen?`)) return;

        try {
            const res = await fetch(`${API}/api/scenes/${scene.id}`, {
                method: 'DELETE'
            });
            const data = await res.json();
            if (data.success) {
                await this.loadScenes();
                this.renderScenes();
                this.renderFolders(); // Update counts
            }
        } catch (e) {
            console.error('Failed to delete scene:', e);
            alert('Fehler beim Löschen der Szene');
        }
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    window.sceneManager = new SceneManager();
});
