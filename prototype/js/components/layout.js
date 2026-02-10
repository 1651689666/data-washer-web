
class LayoutManager {
    constructor() {
        this.splitDiv = null;
        this.container = null;
        this.sourcePanel = null;
        this.previewPanel = null;
        this.isDragging = false;
    }

    init() {
        this.splitDiv = document.getElementById('split-divider');
        this.container = document.getElementById('split-container');
        this.sourcePanel = document.getElementById('source-panel');
        this.previewPanel = document.getElementById('preview-panel');
        this.sidebarToggle = document.getElementById('sidebar-toggle');
        this.configPanel = document.querySelector('.config-panel');

        if (this.splitDiv) {
            this.initSplitter();
        }

        this.initViewSwitcher();
        this.initSidebarToggle();
    }

    initSplitter() {
        this.splitDiv.addEventListener('mousedown', (e) => {
            this.isDragging = true;
            document.body.style.cursor = this.container.dataset.layout === 'vertical' ? 'row-resize' : 'col-resize';
            document.body.classList.add('is-dragging');
        });

        document.addEventListener('mousemove', (e) => {
            if (!this.isDragging) return;

            const layout = this.container.dataset.layout;
            const containerRect = this.container.getBoundingClientRect();

            if (layout === 'vertical') {
                const offsetY = e.clientY - containerRect.top;
                const percentage = (offsetY / containerRect.height) * 100;
                if (percentage > 10 && percentage < 90) {
                    this.sourcePanel.style.flex = `0 0 ${percentage}%`;
                }
            } else {
                const offsetX = e.clientX - containerRect.left;
                const percentage = (offsetX / containerRect.width) * 100;
                if (percentage > 10 && percentage < 90) {
                    this.sourcePanel.style.flex = `0 0 ${percentage}%`;
                }
            }
        });

        document.addEventListener('mouseup', () => {
            if (this.isDragging) {
                this.isDragging = false;
                document.body.style.cursor = '';
                document.body.classList.remove('is-dragging');
            }
        });
    }

    initViewSwitcher() {
        const btns = document.querySelectorAll('.view-mode-btn');
        btns.forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = btn.dataset.mode;
                this.container.dataset.layout = mode;

                // Clear inline styles when switching to avoid weirdness
                this.sourcePanel.style.flex = '';

                btns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
    }

    initSidebarToggle() {
        if (!this.sidebarToggle || !this.configPanel) return;

        this.sidebarToggle.addEventListener('click', () => {
            const isCollapsed = this.configPanel.classList.toggle('collapsed');
            const icon = this.sidebarToggle.querySelector('i');
            if (icon && window.lucide) {
                // When collapsed: show 'open/expand' icon. When expanded: show 'close/collapse' icon.
                if (isCollapsed) {
                    icon.setAttribute('data-lucide', 'panel-right-open');
                } else {
                    icon.setAttribute('data-lucide', 'panel-right-close');
                }
                window.lucide.createIcons();
            }
        });
    }
}

export const layoutManager = new LayoutManager();
