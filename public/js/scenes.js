const API = `http://${window.location.hostname}:3000`;

class SceneManager {
    constructor() {
        this.scenes = [];
        this.folders = [];
        this.fixtures = []; // Patch Data
        this.currentFolder = null;
        this.selectedSceneId = null;

        this.initAsync();
    }

    async initAsync() {
        await this.loadFixtures(); // Load Patch first
        await this.loadFolders();
        await this.loadScenes();
        this.attachEvents();
        console.log('Scene Manager initialized');
    }

    async loadFixtures() {
        try {
            const res = await fetch(`${API}/api/devices`);
            this.fixtures = await res.json();
        } catch (e) {
            console.error('Failed to load fixtures', e);
            this.fixtures = [];
        }
    }

    async loadFolders() {
        try {
            const res = await fetch(`${API}/api/scene-folders`);
            const data = await res.json();
            this.folders = data.folders || [];
            this.renderFolders();
        } catch (e) { console.error('Failed to load folders:', e); }
    }

    async loadScenes() {
        try {
            const res = await fetch(`${API}/api/scenes`);
            const data = await res.json();
            this.scenes = data.scenes || [];
            this.renderScenes();
        } catch (e) { console.error('Failed to load scenes:', e); }
    }

    renderFolders() {
        const list = document.getElementById('folders-list');
        const filter = document.getElementById('folder-filter');

        // Sidebar List
        list.innerHTML = `
            <div class="folder-item ${this.currentFolder === null ? 'active' : ''}" onclick="sceneManager.filterFolder(null)">
                <span class="folder-icon">📂</span>
                <span class="folder-name">Alle Szenen</span>
                <span class="folder-count">${this.scenes.length}</span>
            </div>
        `;

        // Filter Dropdown
        filter.innerHTML = '<option value="">Alle Ordner</option>';

        this.folders.forEach(f => {
            const count = this.scenes.filter(s => s.folder_id === f.id).length;

            // Sidebar
            const item = document.createElement('div');
            item.className = `folder-item ${this.currentFolder === f.id ? 'active' : ''}`;
            item.innerHTML = `
                <span class="folder-icon">${f.icon || '📁'}</span>
                <span class="folder-name">${f.name}</span>
                <span class="folder-count">${count}</span>
            `;
            item.onclick = () => this.filterFolder(f.id);
            list.appendChild(item);

            // Dropdown
            const opt = document.createElement('option');
            opt.value = f.id;
            opt.textContent = f.name;
            filter.appendChild(opt);
        });
    }

    filterFolder(folderId) {
        this.currentFolder = folderId;
        this.renderFolders(); // Update active state
        this.renderScenes();
        document.getElementById('folder-filter').value = folderId || '';
    }

    renderScenes() {
        const container = document.getElementById('scenes-grid');
        container.innerHTML = '';

        let filtered = this.scenes;
        if (this.currentFolder) {
            filtered = filtered.filter(s => s.folder_id === this.currentFolder);
        }

        if (filtered.length === 0) {
            container.innerHTML = '<p style="color: #444; grid-column: 1/-1; text-align: center; padding: 20px;">Keine Szenen.</p>';
            return;
        }

        filtered.forEach(scene => {
            const card = document.createElement('div');
            card.className = 'scene-card';
            if (scene.color) card.style.borderLeftColor = scene.color;

            card.innerHTML = `
                <div class="scene-name" title="${scene.name}">${scene.name}</div>
                <div class="scene-actions">
                    <button class="scene-btn recall" title="Recall Scene">LOAD</button>
                    <button class="scene-btn update" title="Overwrite Scene">SAVE</button>
                    <button class="scene-btn delete" title="Delete Scene">DEL</button>
                </div>
            `;

            // Events
            card.querySelector('.recall').onclick = (e) => { e.stopPropagation(); this.recallScene(scene); };
            card.querySelector('.update').onclick = (e) => { e.stopPropagation(); this.updateScene(scene); };
            card.querySelector('.delete').onclick = (e) => { e.stopPropagation(); this.deleteScene(scene); };
            card.onclick = () => this.selectScene(scene, card);

            container.appendChild(card);
        });
    }

    selectScene(scene, cardElement = null) {
        this.selectedSceneId = scene.id;
        document.querySelectorAll('.scene-card').forEach(el => el.classList.remove('active'));
        if (cardElement) cardElement.classList.add('active');

        const inspector = document.getElementById('scene-inspector');
        if (inspector) {
            document.getElementById('inspector-title').textContent = `Details: ${scene.name}`;
            this.renderChannelGrid(scene.channel_data);
        }
    }

    renderChannelGrid(channelData) {
        const container = document.getElementById('dmx-grid');
        if (!container) return;
        container.innerHTML = '';

        let getVal = (idx) => 0; // Function to get value by 1-based index

        // Determine data format
        if (Array.isArray(channelData)) {
            getVal = (idx) => channelData[idx - 1] || 0;
        } else if (typeof channelData === 'string') {
            try {
                const parsed = JSON.parse(channelData);
                if (Array.isArray(parsed)) getVal = (idx) => parsed[idx - 1] || 0;
                else getVal = (idx) => parsed[idx] || 0; // Check objects keys
            } catch (e) { }
        } else if (typeof channelData === 'object' && channelData !== null) {
            // Sparse Object { "1": 255 }
            getVal = (idx) => channelData[idx] || 0;
        }

        const infoEl = document.getElementById('inspector-info');
        if (infoEl) infoEl.textContent = '--';

        for (let i = 1; i <= 512; i++) {
            const val = getVal(i);
            const cell = document.createElement('div');
            cell.className = 'dmx-cell';

            // Mouseover Info
            cell.onmouseover = () => {
                if (infoEl) infoEl.textContent = `CH ${i} : VAL ${val} (${Math.round(val / 2.55)}%)`;
            };

            const bar = document.createElement('div');
            bar.className = 'dmx-fill';
            bar.style.height = `${(val / 255) * 100}%`;
            cell.appendChild(bar);

            if (val > 0) {
                const num = document.createElement('div');
                num.className = 'dmx-num';
                num.textContent = i;
                cell.appendChild(num);
                cell.style.borderColor = '#4caf50';
            }
            container.appendChild(cell);
        }

        container.onmouseleave = () => { if (infoEl) infoEl.textContent = '--'; };
    }

    async recallScene(scene) {
        try {
            let data = scene.channel_data;
            if (typeof data === 'string') data = JSON.parse(data);

            if (Array.isArray(data)) {
                // Full Snapshot
                await fetch(`${API}/api/dmx/batch`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ channels: data })
                });
            } else {
                // Sparse Object
                await fetch(`${API}/api/dmx/sparse`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ channels: data })
                });
            }
            console.log(`Scene ${scene.name} recalled.`);
        } catch (e) { console.error('Recall failed', e); }
    }

    async createScene() {
        const name = document.getElementById('scene-name').value;
        const folderId = document.getElementById('scene-folder').value;
        const color = document.getElementById('scene-color').value;

        // Fixture Selection
        const selectedFixIds = Array.from(document.querySelectorAll('.fix-checkbox:checked')).map(cb => parseInt(cb.value));

        // 1. Get Current DMX State
        const dmxRes = await fetch(`${API}/api/dmx/channels`);
        const snapshot = (await dmxRes.json()).channels || [];

        // 2. Build Data (Sparse or Full)
        let channelData = {};

        if (selectedFixIds.length === 0) {
            // Fallback: Full snapshot if nothing selected
            channelData = snapshot;
        } else {
            // Selective Mode
            selectedFixIds.forEach(id => {
                const fix = this.fixtures.find(f => f.id === id);
                if (fix) {
                    for (let ch = 0; ch < fix.channel_count; ch++) {
                        const addr = fix.dmx_address + ch; // 1-based address
                        if (addr <= 512) {
                            // Snapshot is 0-indexed (index 0 = ch 1)
                            const val = snapshot[addr - 1] || 0;
                            channelData[addr] = val; // Store as Key "1"
                        }
                    }
                }
            });
        }

        const payload = {
            name,
            folder_id: folderId || null,
            color,
            channel_data: channelData
        };

        const res = await fetch(`${API}/api/scenes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            document.getElementById('new-scene-modal').classList.remove('active');
            this.loadScenes();
        }
    }

    // Modal Helpers
    populateFixtureList() {
        const list = document.getElementById('fixture-select-list');
        list.innerHTML = '';

        if (this.fixtures.length === 0) {
            list.innerHTML = '<div style="color:#666; font-size:10px; padding:5px;">Keine Fixtures gepatcht.</div>';
            return;
        }

        this.fixtures.forEach(fix => {
            const div = document.createElement('div');
            div.innerHTML = `
                <label style="display: flex; align-items: center; gap: 5px; font-size: 11px; margin-bottom: 2px;">
                    <input type="checkbox" value="${fix.id}" checked class="fix-checkbox">
                    <span style="color:#ddd;">${fix.name}</span>
                    <span style="color:#666;">(Addr: ${fix.dmx_address}, Mode: ${fix.channel_count}ch)</span>
                </label>
            `;
            list.appendChild(div);
        });

        const toggle = document.getElementById('toggle-all-fixtures');
        if (toggle) {
            toggle.onclick = () => {
                const checkboxes = list.querySelectorAll('.fix-checkbox');
                const allChecked = Array.from(checkboxes).every(c => c.checked);
                checkboxes.forEach(c => c.checked = !allChecked);
            };
        }
    }

    attachEvents() {
        document.getElementById('new-folder-btn').onclick = () => document.getElementById('new-folder-modal').classList.add('active');
        document.getElementById('cancel-folder-btn').onclick = () => document.getElementById('new-folder-modal').classList.remove('active');

        // Scene Modal
        const sceneModal = document.getElementById('new-scene-modal');
        document.getElementById('new-scene-btn').onclick = () => {
            sceneModal.classList.add('active');
            this.populateFolderSelect();
            this.populateFixtureList();
        };
        document.getElementById('cancel-scene-btn').onclick = () => sceneModal.classList.remove('active');

        document.getElementById('close-btn').onclick = () => window.parent.wm ? window.parent.wm.closeWindow('scenes') : window.close();

        // Forms
        document.getElementById('new-folder-form').onsubmit = (e) => { e.preventDefault(); this.createFolder(); };
        document.getElementById('new-scene-form').onsubmit = (e) => { e.preventDefault(); this.createScene(); };

        // Search
        document.getElementById('search-scenes').oninput = (e) => this.filterScenes(e.target.value);
        document.getElementById('folder-filter').onchange = (e) => this.filterFolder(e.target.value ? parseInt(e.target.value) : null);
    }

    populateFolderSelect() {
        const sel = document.getElementById('scene-folder');
        sel.innerHTML = '<option value="">Kein Ordner</option>';
        this.folders.forEach(f => {
            const opt = document.createElement('option');
            opt.value = f.id;
            opt.textContent = f.name;
            sel.appendChild(opt);
        });
    }

    filterScenes(query) {
        const cards = document.querySelectorAll('.scene-card');
        query = query.toLowerCase();
        cards.forEach(card => {
            const name = card.querySelector('.scene-name').textContent.toLowerCase();
            if (name.includes(query)) card.style.display = '';
            else card.style.display = 'none';
        });
    }

    async createFolder() {
        const name = document.getElementById('folder-name').value;
        const icon = document.getElementById('folder-icon').value;
        const res = await fetch(`${API}/api/scene-folders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, icon })
        });
        if (res.ok) {
            document.getElementById('new-folder-modal').classList.remove('active');
            this.loadFolders();
        }
    }

    async deleteScene(scene) {
        if (!confirm(`Delete scene "${scene.name}"?`)) return;
        await fetch(`${API}/api/scenes/${scene.id}`, { method: 'DELETE' });
        this.loadScenes();
    }

    async updateScene(scene) {
        if (!confirm(`Overwrite scene "${scene.name}" with current DMX values?`)) return;

        const dmxRes = await fetch(`${API}/api/dmx/channels`);
        const snapshot = (await dmxRes.json()).channels || [];

        await fetch(`${API}/api/scenes/${scene.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: scene.name, folder_id: scene.folder_id, channel_data: snapshot })
        });
        this.loadScenes();
    }
}

const sceneManager = new SceneManager();
