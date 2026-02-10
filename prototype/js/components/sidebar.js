
import { regionPanel } from './region-panel.js';

class Sidebar {
    constructor() { }

    init() {
        // Delegate Region logic to the specialized panel
        regionPanel.init();
        this.render();
    }

    render() {
        // Sidebar itself might have other global sections in the future,
        // for now it just ensures sub-panels are rendered if they aren't auto-rendering.
        regionPanel.render();
    }

    reset() {
        regionPanel.reset();
    }
}

export const sidebar = new Sidebar();
