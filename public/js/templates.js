const TEMPLATE_API_URL = `http://${window.location.hostname}:3000/api/templates`;

class TemplateManager {
    constructor() {
        this.templates = [];
        this.functionTypes = ['R', 'G', 'B', 'W', 'P', 'T', 'SPEED', 'DIM', 'STROBE', 'GOBO', 'PRISM', 'FOCUS', 'ZOOM', 'IRIS', 'SHUTTER', 'OTHER'];
    }

    async init() {
        console.log('TemplateManager: Starting init...');
        await this.loadTemplates();
        console.log('TemplateManager: Templates loaded:', this.templates);
        this.render();
    }

    async loadTemplates() {
        try {
            const res = await fetch(TEMPLATE_API_URL);
            const data = await res.json();
            if (data.success) {
                this.templates = data.templates;
            }
        } catch (e) {
            console.error('Failed to load templates:', e);
        }
    }

    render() {
        console.log('TemplateManager: Attempting to render...');
        const container = document.getElementById('content-templates');
        console.log('TemplateManager: Container found:', container);

        if (!container) {
            console.warn('TemplateManager: Container not found, retrying in 100ms...');
            setTimeout(() => this.render(), 100);
            return;
        }

        console.log('TemplateManager: Rendering templates...');
        container.innerHTML = `
            <div class="templates-container">
                <div class="templates-grid">
                    ${this.templates.map(t => this.renderTemplateCard(t)).join('')}
                    ${this.templates.length === 0 ? '<div class="empty-state">No templates yet. Create your first fixture profile!</div>' : ''}
                </div>
            </div>
        `;
        console.log('TemplateManager: Render complete!');
    }

    renderTemplateCard(template) {
        const channelSummary = this.getChannelSummary(template.channels || []);
        return `
            <div class="template-card">
                <div class="template-header">
                    <div class="template-title">${template.name}</div>
                    <div class="template-meta">${template.manufacturer || 'Generic'} ${template.model || ''}</div>
                </div>
                <div class="template-body">
                    <div class="channel-count">${template.channel_count} Channels</div>
                    <div class="channel-summary">${channelSummary}</div>
                </div>
                <div class="template-actions">
                    <button class="btn-edit" onclick="templateManager.showTemplateModal(${template.id})">
                        <svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293l6.5-6.5zm-9.761 5.175-.106.106-1.528 3.821 3.821-1.528.106-.106A.5.5 0 0 1 5 12.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.468-.325z"/></svg>
                        Edit
                    </button>
                    <button class="btn-delete" onclick="templateManager.deleteTemplate(${template.id})">
                        <svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/><path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/></svg>
                        Delete
                    </button>
                </div>
            </div>
        `;
    }

    getChannelSummary(channels) {
        if (!channels || channels.length === 0) return 'No channels defined';
        const types = [...new Set(channels.map(c => c.function_type).filter(Boolean))];
        return types.slice(0, 6).join(', ') + (types.length > 6 ? '...' : '');
    }

    showTemplateModal(templateId = null) {
        const template = templateId ? this.templates.find(t => t.id === templateId) : null;
        const channels = template?.channels || [];

        const overlay = document.createElement('div');
        overlay.className = 'template-modal-overlay';
        overlay.id = 'template-modal';

        overlay.innerHTML = `
            <div class="template-modal">
                <div class="modal-header">
                    <h3>${template ? 'Edit Template' : 'New Fixture Template'}</h3>
                    <button class="btn-close" onclick="document.getElementById('template-modal').remove()">×</button>
                </div>
                
                <div class="modal-body">
                    <div class="form-section">
                        <h4>Basic Information</h4>
                        <div class="form-group">
                            <label>Template Name</label>
                            <input type="text" id="tpl-name" value="${template?.name || ''}" placeholder="e.g. Robe Pointy Standard">
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>Manufacturer</label>
                                <input type="text" id="tpl-manufacturer" value="${template?.manufacturer || ''}" placeholder="e.g. Robe">
                            </div>
                            <div class="form-group">
                                <label>Model</label>
                                <input type="text" id="tpl-model" value="${template?.model || ''}" placeholder="e.g. Pointy">
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Channel Count</label>
                            <input type="number" id="tpl-channel-count" min="1" max="512" value="${template?.channel_count || 16}">
                        </div>
                    </div>

                    <div class="form-section">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <h4>Channel Layout</h4>
                            <button class="btn-secondary" onclick="templateManager.addChannelRow()">+ Add Channel</button>
                        </div>
                        <div style="display: grid; grid-template-columns: 45px 90px 100px 1fr 28px; gap: 6px; padding: 6px 8px; font-size: 10px; color: rgba(255,255,255,0.4); font-weight: 600; text-transform: uppercase; border-bottom: 1px solid #333;">
                            <div>CH</div>
                            <div>Group</div>
                            <div>Function</div>
                            <div>Label</div>
                            <div></div>
                        </div>
                        <div id="channel-layout" class="channel-layout">
                            ${channels.length > 0 ? channels.map((ch, i) => this.renderChannelRow(ch, i)).join('') : this.renderChannelRow({}, 0)}
                        </div>
                    </div>
                </div>

                <div class="modal-footer">
                    <button class="btn-cancel" onclick="document.getElementById('template-modal').remove()">Cancel</button>
                    <button class="btn-save" onclick="templateManager.saveTemplate(${templateId})">Save Template</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
    }

    renderChannelRow(channel, index) {
        const groups = ['Intensity', 'Position', 'Color', 'Beam', 'Speed', 'Control'];
        return `
            <div class="channel-row" data-index="${index}">
                <div class="channel-num" style="width: 50px;">
                    <label>CH</label>
                    <input type="number" class="ch-num" min="1" max="512" value="${channel.channel_num || index + 1}" placeholder="${index + 1}">
                </div>
                <div class="channel-group" style="width: 100px;">
                    <label>Group</label>
                     <select class="ch-group">
                        <option value="">None</option>
                        ${groups.map(g => `<option value="${g}" ${channel.group === g ? 'selected' : ''}>${g}</option>`).join('')}
                    </select>
                </div>
                <div class="channel-function" style="flex: 1;">
                    <label>Function</label>
                    <select class="ch-function">
                        <option value="">-- Select --</option>
                        ${this.functionTypes.map(f => `<option value="${f}" ${channel.function_type === f ? 'selected' : ''}>${f}</option>`).join('')}
                    </select>
                </div>
                <div class="channel-label" style="flex: 1.5;">
                    <label>Label</label>
                    <input type="text" class="ch-label" value="${channel.label || ''}" placeholder="e.g. Red, Pan, Dimmer">
                </div>
                <button class="btn-remove" onclick="this.parentElement.remove()" style="margin-top: 18px;">×</button>
            </div>
        `;
    }

    addChannelRow() {
        const layout = document.getElementById('channel-layout');
        const index = layout.children.length;
        const row = document.createElement('div');
        row.innerHTML = this.renderChannelRow({}, index);
        layout.appendChild(row.firstElementChild);
    }

    async saveTemplate(id = null) {
        const name = document.getElementById('tpl-name').value;
        const manufacturer = document.getElementById('tpl-manufacturer').value;
        const model = document.getElementById('tpl-model').value;
        const channel_count = parseInt(document.getElementById('tpl-channel-count').value);

        if (!name || !channel_count) {
            alert('Please fill in template name and channel count');
            return;
        }

        const channels = [];
        document.querySelectorAll('.channel-row').forEach(row => {
            const num = parseInt(row.querySelector('.ch-num').value);
            const func = row.querySelector('.ch-function').value;
            const label = row.querySelector('.ch-label').value;
            const group = row.querySelector('.ch-group')?.value || ''; // NEW: Read Group

            if (num && func) {
                channels.push({
                    channel_num: num,
                    function_type: func,
                    label: label || func,
                    group: group // NEW: Save Group
                });
            }
        });

        const data = { name, manufacturer, model, channel_count, channels };

        try {
            const url = id ? `${TEMPLATE_API_URL}/${id}` : TEMPLATE_API_URL;
            const method = id ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            const result = await res.json();
            if (result.success) {
                document.getElementById('template-modal').remove();
                await this.init();
            }
        } catch (e) {
            console.error('Failed to save template:', e);
        }
    }

    async deleteTemplate(id) {
        if (!confirm('Delete this template? Fixtures using it will not be affected.')) return;

        try {
            const res = await fetch(`${TEMPLATE_API_URL}/${id}`, { method: 'DELETE' });
            if (res.ok) {
                await this.init();
            }
        } catch (e) {
            console.error('Failed to delete template:', e);
        }
    }
}
