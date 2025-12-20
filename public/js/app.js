/**
 * WebDMX Frontend Application
 */

const API_URL = 'http://localhost:3000/api'; // Direct to Node backend for now

// State
let currentView = 'patch';
let fixtures = [];

// Init
document.addEventListener('DOMContentLoaded', () => {
    checkHealth();
    // Poll health check every 5 seconds
    setInterval(checkHealth, 5000);

    // Initial view
    showView('patch');
});

/**
 * Check backend health
 */
async function checkHealth() {
    try {
        const response = await fetch(`${API_URL}/health`); // Assuming we proxy or CORS is set
        // Note: For now, assuming localhost:3000 is accessible. 
        // In prod, this should be proxied via Apache probably.

        if (response.ok) {
            const data = await response.json();
            updateStatus('backend', true);
            updateStatus('dmx', data.dmx);
        } else {
            updateStatus('backend', false);
        }
    } catch (e) {
        console.error('Health check failed', e);
        updateStatus('backend', false);
        updateStatus('dmx', false);
    }
}

function updateStatus(type, isOnline) {
    const el = document.querySelector(`#${type}-status .status-indicator`);
    if (el) {
        el.className = `status-indicator ${isOnline ? 'status-online' : ''}`;
    }
}

/**
 * Switch Views
 */
function showView(viewName) {
    // Update Nav
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    const btn = document.querySelector(`.nav-btn[onclick="showView('${viewName}')"]`);
    if (btn) btn.classList.add('active');

    // Update Content
    const content = document.getElementById('main-content');
    const template = document.getElementById(`view-${viewName}`);

    if (template) {
        content.innerHTML = '';
        content.appendChild(template.content.cloneNode(true));

        // View specific initialization
        if (viewName === 'patch') {
            loadPatch();
        }
    } else {
        content.innerHTML = '<div style="padding:20px; color:#666;">View not implemented yet.</div>';
    }

    currentView = viewName;
}

/**
 * Load Fixture Patch
 */
async function loadPatch() {
    const list = document.getElementById('fixture-list');
    if (!list) return;

    list.innerHTML = '<tr><td colspan="6" style="text-align:center;">Loading...</td></tr>';

    // Mock data for now until API is ready
    // TODO: fetch from /api/devices/fixtures

    // Simulate API delay
    await new Promise(r => setTimeout(r, 500));

    // Demo Data (Simulating what we will implement in backend)
    const demoFixtures = [
        { id: 101, name: 'Wash Left 1', type: 'LED Wash', mode: '16ch', address: '1.001' },
        { id: 102, name: 'Wash Left 2', type: 'LED Wash', mode: '16ch', address: '1.017' },
        { id: 103, name: 'Wash Right 1', type: 'LED Wash', mode: '16ch', address: '1.033' },
        { id: 104, name: 'Wash Right 2', type: 'LED Wash', mode: '16ch', address: '1.049' }
    ];

    renderFixtureList(demoFixtures);
}

function renderFixtureList(data) {
    const list = document.getElementById('fixture-list');
    if (!list) return;

    if (data.length === 0) {
        list.innerHTML = '<tr><td colspan="6" style="text-align:center;">No fixtures patched.</td></tr>';
        return;
    }

    list.innerHTML = data.map(fixture => `
        <tr>
            <td>${fixture.id}</td>
            <td>${fixture.name}</td>
            <td>${fixture.type}</td>
            <td>${fixture.mode}</td>
            <td style="color: var(--accent-yellow);">${fixture.address}</td>
            <td>
                <button class="btn" style="padding: 2px 8px; font-size: 0.8rem;">Edit</button>
                <button class="btn" style="padding: 2px 8px; font-size: 0.8rem; border-color: #ff3333; color: #ff3333;">X</button>
            </td>
        </tr>
    `).join('');
}

function openAddFixtureModal() {
    alert('Add Fixture Wizard coming soon!\nThis will allow selecting from the library (Generic 16ch Wash).');
}
