class DmxVisualizer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.fixtures = [];
        this.dmxData = new Array(512).fill(0);

        this.isDragging = false;
        this.draggedFixture = null;
        this.dragOffset = { x: 0, y: 0 };

        this.init();
        this.initEventListeners();
    }

    init() {
        this.canvas.width = this.canvas.parentElement.clientWidth;
        this.canvas.height = this.canvas.parentElement.clientHeight;

        // Add a few test fixtures
        this.addFixture(1, 'Hero Wash 1', 100, 100, {
            type: 'wash',
            channels: { dimmer: 1, r: 2, g: 3, b: 4, pan: 5, tilt: 6 }
        });

        this.addFixture(2, 'Hero Wash 2', 300, 100, {
            type: 'wash',
            channels: { dimmer: 7, r: 8, g: 9, b: 10, pan: 11, tilt: 12 }
        });

        this.startLoop();
    }

    initEventListeners() {
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', () => this.handleMouseUp());

        // Touch support
        this.canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) this.handleMouseDown(e.touches[0]);
        }, { passive: false });
        this.canvas.addEventListener('touchmove', (e) => {
            if (e.touches.length === 1) this.handleMouseMove(e.touches[0]);
        }, { passive: false });
        this.canvas.addEventListener('touchend', () => this.handleMouseUp());
    }

    getMousePos(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }

    handleMouseDown(e) {
        const pos = this.getMousePos(e);

        // Find fixture under mouse (hit box 40x40)
        const clickedFixture = this.fixtures.find(fix =>
            Math.abs(fix.x - pos.x) < 20 && Math.abs(fix.y - pos.y) < 20
        );

        if (clickedFixture) {
            this.isDragging = true;
            this.draggedFixture = clickedFixture;
            this.dragOffset.x = pos.x - clickedFixture.x;
            this.dragOffset.y = pos.y - clickedFixture.y;

            // Select it
            this.fixtures.forEach(f => f.selected = false);
            clickedFixture.selected = true;
        } else {
            // Deselect all
            this.fixtures.forEach(f => f.selected = false);
        }
    }

    handleMouseMove(e) {
        if (!this.isDragging || !this.draggedFixture) return;

        const pos = this.getMousePos(e);
        this.draggedFixture.x = pos.x - this.dragOffset.x;
        this.draggedFixture.y = pos.y - this.dragOffset.y;
    }

    handleMouseUp() {
        if (this.isDragging && this.draggedFixture) {
            console.log(`Fixture ${this.draggedFixture.id} moved to:`, this.draggedFixture.x, this.draggedFixture.y);
            // In a real app, save to DB here
        }
        this.isDragging = false;
        this.draggedFixture = null;
    }

    addFixture(id, name, x, y, config) {
        this.fixtures.push({ id, name, x, y, config, selected: false });
    }

    updateDmx(data) {
        this.dmxData = data;
    }

    startLoop() {
        const render = () => {
            this.draw();
            requestAnimationFrame(render);
        };
        render();
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw Grid
        this.ctx.strokeStyle = '#222';
        this.ctx.lineWidth = 1;
        for (let i = 0; i < this.canvas.width; i += 50) {
            this.ctx.beginPath(); this.ctx.moveTo(i, 0); this.ctx.lineTo(i, this.canvas.height); this.ctx.stroke();
        }
        for (let i = 0; i < this.canvas.height; i += 50) {
            this.ctx.beginPath(); this.ctx.moveTo(0, i); this.ctx.lineTo(this.canvas.width, i); this.ctx.stroke();
        }

        this.fixtures.forEach(fix => {
            const dimmer = this.dmxData[fix.config.channels.dimmer - 1] / 255;
            const r = this.dmxData[fix.config.channels.r - 1] || 0;
            const g = this.dmxData[fix.config.channels.g - 1] || 0;
            const b = this.dmxData[fix.config.channels.b - 1] || 0;

            // Draw Beam (Stroke)
            if (dimmer > 0) {
                const gradient = this.ctx.createRadialGradient(fix.x, fix.y, 5, fix.x, fix.y, 80 * dimmer);
                gradient.addColorStop(0, `rgba(${r},${g},${b},${0.4 * dimmer})`);
                gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);
                this.ctx.fillStyle = gradient;
                this.ctx.beginPath();
                this.ctx.arc(fix.x, fix.y, 80 * dimmer, 0, Math.PI * 2);
                this.ctx.fill();
            }

            // Selection Glow
            if (fix.selected) {
                this.ctx.shadowBlur = 15;
                this.ctx.shadowColor = '#00d4ff';
            } else {
                this.ctx.shadowBlur = 0;
            }

            // Draw Fixture Body
            this.ctx.fillStyle = fix.selected ? '#00d4ff' : '#444';
            this.ctx.beginPath();
            this.ctx.roundRect(fix.x - 15, fix.y - 15, 30, 30, 5);
            this.ctx.fill();
            this.ctx.strokeStyle = fix.selected ? '#fff' : '#666';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();

            this.ctx.shadowBlur = 0; // Reset shadow

            // Label
            this.ctx.fillStyle = fix.selected ? '#00d4ff' : '#fff';
            this.ctx.font = '500 11px Inter';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(fix.name, fix.x, fix.y + 35);
        });
    }
}
