const API_URL = `http://${window.location.hostname}:3000/api/devices`;

class PatchManager {
    constructor() {
        this.fixtures = [];
        this.templates = [];
    }

    async init() {
        await this.loadFixtures();
        await this.loadTemplates();
        this.render();
    }

    async loadFixtures() {
        try {
            const res = await fetch(API_URL);
            this.fixtures = await res.json();
        } catch (e) {
            console.error('Failed to load fixtures:', e);
        }
    }

    async loadTemplates() {
        try {
            const res = await fetch(`http://${window.location.hostname}:3000/api/templates`);
            const data = await res.json();
            if (data.success) {
                this.templates = data.templates;
            }
        } catch (e) {
            console.error('Failed to load templates:', e);
        }
    }

    render() {
        const container = document.getElementById('content-patch');
        if (!container) return;

        container.innerHTML = `
            <div class="patch-container">
                <div class="patch-header">
                    <h2>Fixture Universe 1</h2>
                    <button class="btn-add-fixture" onclick="patchManager.showModal()">+ Add Fixture</button>
                </div>
                <div class="fixture-list" id="fixture-list">
                    ${this.fixtures.map(fix => this.renderFixtureItem(fix)).join('')}
                    ${this.fixtures.length === 0 ? '<div style="text-align:center; padding:40px; color:rgba(255,255,255,0.2);">No fixtures patched yet.</div>' : ''}
                </div>
            </div>
        `;
    }

    renderFixtureItem(fix) {
        return `
            <div class="fixture-item">
                <div class="fix-address">[${String(fix.dmx_address).padStart(3, '0')}]</div>
                <div class="fix-info">
                    <span class="fix-name">${fix.name}</span>
                    <span class="fix-meta">${fix.channel_count} Channels • ${fix.position}</span>
                </div>
                <div class="fix-category">${fix.category}</div>
                <div class="fix-actions">
                    <button class="btn-icon" onclick="patchManager.showModal(${fix.id})">
                        <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293l6.5-6.5zm-9.761 5.175-.106.106-1.528 3.821 3.821-1.528.106-.106A.5.5 0 0 1 5 12.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.468-.325z"/></svg>
                    </button>
                    <button class="btn-icon btn-delete" onclick="patchManager.deleteFixture(${fix.id})">
                        <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/><path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/></svg>
                    </button>
                </div>
            </div>
        `;
    }

    showModal(fixtureId = null) {
        const fixture = fixtureId ? this.fixtures.find(f => f.id === fixtureId) : null;

        const overlay = document.createElement('div');
        overlay.className = 'patch-modal-overlay';
        overlay.id = 'patch-modal';

        overlay.innerHTML = `
            <div class="patch-modal">
                <h3 style="margin-top:0;">${fixture ? 'Edit Fixture' : 'Add New Fixture'}</h3>
                <div class="form-group">
                    <label>Name</label>
                    <input type="text" id="fix-name" value="${fixture ? fixture.name : ''}" placeholder="e.g. Wash MH 1">
                </div>
                <div class="grid" style="display:grid; grid-template-columns: 1fr 1fr; gap:15px;">
                    <div class="form-group">
                        <label>Manufacturer</label>
                        <input type="text" id="fix-manufacturer" value="${fixture ? (fixture.manufacturer || '') : ''}" placeholder="e.g. Robe">
                    </div>
                    <div class="form-group">
                        <label>Model</label>
                        <input type="text" id="fix-model" value="${fixture ? (fixture.model || '') : ''}" placeholder="e.g. Pointy">
                    </div>
                </div>
                <div class="form-group">
                    <label>Fixture Template (Optional)</label>
                    <select id="fix-template" onchange="patchManager.applyTemplate()">
                        <option value="">-- Manual Setup --</option>
                        ${this.templates.map(t => `<option value="${t.id}" ${fixture?.template_id === t.id ? 'selected' : ''}>${t.name} (${t.channel_count}ch)</option>`).join('')}
                    </select>
                </div>
                <div class="grid" style="display:grid; grid-template-columns: 1fr 1fr; gap:15px;">
                    <div class="form-group">
                        <label>Category</label>
                        <select id="fix-category">
                            <option value="spot" ${fixture?.category === 'spot' ? 'selected' : ''}>Spot</option>
                            <option value="wash" ${fixture?.category === 'wash' ? 'selected' : ''}>Wash</option>
                            <option value="par" ${fixture?.category === 'par' ? 'selected' : ''}>Par</option>
                            <option value="dimmer" ${fixture?.category === 'dimmer' ? 'selected' : ''}>Dimmer</option>
                            <option value="strobe" ${fixture?.category === 'strobe' ? 'selected' : ''}>Strobe</option>
                            <option value="sonstiges" ${fixture?.category === 'sonstiges' ? 'selected' : ''}>Sonstiges</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Position</label>
                        <select id="fix-position">
                            <option value="front" ${fixture?.position === 'front' ? 'selected' : ''}>Front</option>
                            <option value="mid" ${fixture?.position === 'mid' ? 'selected' : ''}>Mid</option>
                            <option value="back" ${fixture?.position === 'back' ? 'selected' : ''}>Back</option>
                            <option value="left" ${fixture?.position === 'left' ? 'selected' : ''}>Left</option>
                            <option value="right" ${fixture?.position === 'right' ? 'selected' : ''}>Right</option>
                        </select>
                    </div>
                </div>
                <div class="grid" style="display:grid; grid-template-columns: 1fr 1fr; gap:15px;">
                    <div class="form-group">
                        <label>DMX Address</label>
                        <input type="number" id="fix-address" min="1" max="512" value="${fixture ? fixture.dmx_address : '1'}">
                    </div>
                    <div class="form-group">
                        <label>Channel Count</label>
                        <input type="number" id="fix-channels" min="1" max="512" value="${fixture ? fixture.channel_count : '16'}">
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn-cancel" onclick="document.getElementById('patch-modal').remove()">Cancel</button>
                    <button class="btn-save" onclick="patchManager.saveFixture(${fixtureId})">Save Fixture</button>
                </div>
            </div>
        `;

        document.getElementById('content-patch').appendChild(overlay);
    }

    async saveFixture(id = null) {
        const data = {
            name: document.getElementById('fix-name').value,
            manufacturer: document.getElementById('fix-manufacturer').value,
            model: document.getElementById('fix-model').value,
            category: document.getElementById('fix-category').value,
            position: document.getElementById('fix-position').value,
            dmx_address: parseInt(document.getElementById('fix-address').value),
            channel_count: parseInt(document.getElementById('fix-channels').value),
            template_id: parseInt(document.getElementById('fix-template').value) || null
        };

        if (!data.name || isNaN(data.dmx_address)) return;

        try {
            const url = id ? `${API_URL}/${id}` : API_URL;
            const method = id ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (res.ok) {
                document.getElementById('patch-modal').remove();
                await this.init();
            }
        } catch (e) {
            console.error('Failed to save fixture:', e);
        }
    }

    applyTemplate() {
        const templateId = parseInt(document.getElementById('fix-template').value);
        if (!templateId) return;

        const template = this.templates.find(t => t.id === templateId);
        if (!template) return;

        // Auto-fill fields from template
        if (template.manufacturer) document.getElementById('fix-manufacturer').value = template.manufacturer;
        if (template.model) document.getElementById('fix-model').value = template.model;
        document.getElementById('fix-channels').value = template.channel_count;
    }

    async deleteFixture(id) {
        if (!confirm('Are you sure you want to delete this fixture?')) return;

        try {
            const res = await fetch(`${API_URL}/${id}`, { method: 'DELETE' });
            if (res.ok) {
                await this.init();
            }
        } catch (e) {
            console.error('Failed to delete fixture:', e);
        }
    }
}

const patchManager = new PatchManager();
