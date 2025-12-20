class WindowManager {
    constructor() {
        this.windows = [];
        this.zIndex = 100;
        this.desktop = document.getElementById('desktop');
        this.initDesktop();
    }

    initDesktop() {
        // Double click desktop to clear focus? 
    }

    createWindow(id, title, options = {}) {
        if (document.getElementById(`win-${id}`)) {
            this.focusWindow(id);
            return;
        }

        const win = document.createElement('div');
        win.id = `win-${id}`;
        win.className = 'window';
        win.style.width = options.width || '600px';
        win.style.height = options.height || '400px';
        win.style.left = options.left || '100px';
        win.style.top = options.top || '100px';
        win.style.zIndex = ++this.zIndex;

        win.innerHTML = `
            <div class="window-header">
                <div class="window-title">${title}</div>
                <div class="window-controls">
                    <div class="win-btn win-min"></div>
                    <div class="win-btn win-max"></div>
                    <div class="win-btn win-close"></div>
                </div>
            </div>
            <div class="window-content" id="content-${id}">
                ${options.content || '<div style="padding: 20px;">Loading...</div>'}
            </div>
            <div class="window-resize" style="position:absolute; bottom:0; right:0; width:10px; height:10px; cursor:se-resize;"></div>
        `;

        this.desktop.appendChild(win);
        this.makeDraggable(win);
        this.makeResizable(win);
        this.windows.push({ id, el: win });

        const closeBtn = win.querySelector('.win-close');
        closeBtn.onclick = () => this.closeWindow(id);

        win.onmousedown = () => this.focusWindow(id);

        return win;
    }

    focusWindow(id) {
        const win = document.getElementById(`win-${id}`);
        if (win) {
            win.style.zIndex = ++this.zIndex;
            document.querySelectorAll('.window').forEach(w => w.classList.remove('active'));
            win.classList.add('active');
        }
    }

    closeWindow(id) {
        const win = document.getElementById(`win-${id}`);
        if (win) {
            win.remove();
            this.windows = this.windows.filter(w => w.id !== id);
        }
    }

    makeDraggable(el) {
        const header = el.querySelector('.window-header');
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

        header.onmousedown = (e) => {
            e = e || window.event;
            e.preventDefault();
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
        };

        function elementDrag(e) {
            e = e || window.event;
            e.preventDefault();
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            el.style.top = (el.offsetTop - pos2) + "px";
            el.style.left = (el.offsetLeft - pos1) + "px";
        }

        function closeDragElement() {
            document.onmouseup = null;
            document.onmousemove = null;
        }
    }

    makeResizable(el) {
        const resizer = el.querySelector('.window-resize');

        resizer.onmousedown = (e) => {
            e.preventDefault();
            window.addEventListener('mousemove', resize);
            window.addEventListener('mouseup', stopResize);
        };

        function resize(e) {
            const width = e.clientX - el.offsetLeft;
            const height = e.clientY - el.offsetTop;

            if (width > 200) el.style.width = width + 'px';
            if (height > 150) el.style.height = height + 'px';
        }

        function stopResize() {
            window.removeEventListener('mousemove', resize);
            window.removeEventListener('mouseup', stopResize);
        }
    }
}

const wm = new WindowManager();
