
import { store } from '../core/store.js';
import { ExcelUtils } from '../utils.js';

class Grid {
    constructor() {
        this.container = null;
        this.isDragging = false;
        this.dragStart = null; // {r, c}
        this.lastSheet = null;
        this.lastData = null;
        this.gridElement = null;
        this.colors = [
            '#3b82f6', // Blue
            '#10b981', // Emerald
            '#8b5cf6', // Violet
            '#f59e0b', // Amber
            '#ef4444', // Red
            '#ec4899', // Pink
            '#6366f1', // Indigo
            '#14b8a6', // Teal
            '#f97316', // Orange
            '#84cc16'  // Lime
        ];
    }

    init() {
        this.container = document.getElementById('spreadsheet');
        if (!this.container) return;

        // Subscribe to store
        store.subscribe((state) => {
            this.render(state);
        });
    }

    render(state) {
        const { workbookData, currentSheet, selection, configs } = state;

        if (!currentSheet || !workbookData[currentSheet]) {
            this.container.innerHTML = '';
            return;
        }

        const sheetData = workbookData[currentSheet];
        const data = sheetData.matrix;
        const merges = sheetData.merges || [];

        if (!data || data.length === 0) {
            this.container.innerHTML = '';
            return;
        }

        const shouldFullRender =
            this.lastSheet !== currentSheet ||
            this.lastData !== data;

        if (shouldFullRender) {
            this.lastSheet = currentSheet;
            this.lastData = data;
            this.fullRender(data, merges);
        }

        // Always update selection (classes)
        this.updateSelection(selection);

        // Render Regions if available
        if (configs && configs.regions) {
            this.renderRegions(configs.regions, configs.activeRegionIndex, currentSheet);
        }
    }

    fullRender(data, merges) {
        console.log("---- Grid.fullRender START ----");
        this.container.innerHTML = '';

        const grid = document.createElement('div');
        grid.className = 'mock-grid';
        this.gridElement = grid;

        // Calculate max columns to avoid jagged grid
        const colCount = data.reduce((max, row) => Math.max(max, row.length), 0);

        // 50px index col + 120px data cols
        grid.style.gridTemplateColumns = `50px repeat(${colCount}, 120px)`;

        // --- 1. Headers (A, B, C...) ---
        // Corner
        const corner = document.createElement('div');
        corner.className = 'cell index-col';
        grid.appendChild(corner);

        for (let c = 0; c < colCount; c++) {
            const header = document.createElement('div');
            header.className = 'cell index-col';
            header.textContent = ExcelUtils.encodeCell({ r: 0, c: c }).replace(/\d+/, ''); // Get Column Letter
            grid.appendChild(header);
        }

        // --- 2. Data Rows ---
        data.forEach((row, ri) => {
            // Row Index (1, 2, 3...)
            const idxCell = document.createElement('div');
            idxCell.className = 'cell index-col';
            idxCell.textContent = ri + 1;
            grid.appendChild(idxCell);

            // Render cells
            for (let ci = 0; ci < colCount; ci++) {
                const colVal = row[ci];
                const cell = document.createElement('div');
                cell.className = 'cell';

                // Content
                cell.textContent = (colVal !== undefined && colVal !== null) ? colVal : "";

                // Coordinates (0-based)
                cell.dataset.r = ri;
                cell.dataset.c = ci;
                const address = ExcelUtils.encodeCell({ r: ri, c: ci });
                cell.dataset.address = address;

                // Merges
                const merge = this.findMerge(merges, ri, ci);
                if (merge) {
                    if (merge.isMain) {
                        cell.style.gridRow = `span ${merge.rowspan}`;
                        cell.style.gridColumn = `span ${merge.colspan}`;
                    } else {
                        continue;
                    }
                }

                // Events
                cell.addEventListener('mousedown', (e) => this.handleMouseDown(e, ri, ci));
                cell.addEventListener('mouseenter', (e) => this.handleMouseEnter(e, ri, ci));
                cell.addEventListener('mouseup', (e) => this.handleMouseUp(e, ri, ci));

                grid.appendChild(cell);
            }
        });

        this.container.appendChild(grid);
    }

    findMerge(merges, r, c) {
        for (const m of merges) {
            if (r >= m.s.r && r <= m.e.r && c >= m.s.c && c <= m.e.c) {
                if (r === m.s.r && c === m.s.c) {
                    return { isMain: true, rowspan: m.e.r - m.s.r + 1, colspan: m.e.c - m.s.c + 1 };
                } else {
                    return { isMain: false };
                }
            }
        }
        return null;
    }

    updateSelection(selection) {
        if (!this.gridElement) return;

        // Clear previous selection
        const selected = this.gridElement.querySelectorAll('.cell.selected');
        selected.forEach(el => el.classList.remove('selected'));

        if (!selection) return;

        const { start, end } = selection;
        const minR = Math.min(start.r, end.r);
        const maxR = Math.max(start.r, end.r);
        const minC = Math.min(start.c, end.c);
        const maxC = Math.max(start.c, end.c);

        for (let r = minR; r <= maxR; r++) {
            for (let c = minC; c <= maxC; c++) {
                const cell = this.gridElement.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
                if (cell) {
                    cell.classList.add('selected');
                }
            }
        }
    }

    isInRange(r, c, selection) {
        const { start, end } = selection;
        const minR = Math.min(start.r, end.r);
        const maxR = Math.max(start.r, end.r);
        const minC = Math.min(start.c, end.c);
        const maxC = Math.max(start.c, end.c);
        return r >= minR && r <= maxR && c >= minC && c <= maxC;
    }

    renderRegions(regions, activeIndex, currentSheet) {
        if (!this.gridElement) return;

        // ... (clearing logic matches previous) ...
        const dirtyCells = this.gridElement.querySelectorAll('.cell.has-region-style');
        dirtyCells.forEach(cell => {
            // ... clear styles ...
            cell.style.borderTop = '';
            cell.style.borderBottom = '';
            cell.style.borderLeft = '';
            cell.style.borderRight = '';
            cell.style.backgroundColor = '';
            cell.style.backgroundImage = ''; // Clear header highlight background
            cell.classList.remove('has-region-style');
            cell.classList.remove('region-header-cell');
        });

        regions.forEach((region, idx) => {
            // Filter by Sheet
            // If region has no sheetName, we might assume it belongs to the current sheet (legacy behavior)
            // or better, if it has sheetName and it doesn't match, skip.
            if (region.sheetName && region.sheetName !== currentSheet) {
                return;
            }

            if (!region.start || !region.end) return;
            // ...
            if (!region.start || !region.end) return;

            let s, e;
            try {
                // Assuming start/end are "A1" strings.
                // We need ExcelUtils decode.
                s = ExcelUtils.decodeCell(region.start);
                e = ExcelUtils.decodeCell(region.end);
            } catch (err) { return; }

            const minR = Math.min(s.r, e.r);
            const maxR = Math.max(s.r, e.r);
            const minC = Math.min(s.c, e.c);
            const maxC = Math.max(s.c, e.c);

            const color = this.colors[region.colorIndex % this.colors.length];
            const isActive = idx === activeIndex;
            const borderStyle = isActive ? `2px solid ${color}` : `2px dashed ${color}`;
            // If not active, maybe lighter?

            for (let r = minR; r <= maxR; r++) {
                for (let c = minC; c <= maxC; c++) {
                    const cell = this.gridElement.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
                    if (cell) {
                        cell.classList.add('has-region-style');

                        // Borders (Outline only)
                        if (r === minR) cell.style.borderTop = borderStyle;
                        if (r === maxR) cell.style.borderBottom = borderStyle;
                        if (c === minC) cell.style.borderLeft = borderStyle;
                        if (c === maxC) cell.style.borderRight = borderStyle;

                        // Header Rows Background
                        // Header Rows Background (Starting from minR)
                        if (r < minR + region.headerRows) {
                            if (isActive) {
                                const bgColor = color + '28';
                                cell.style.backgroundColor = '';
                                cell.style.backgroundImage = `linear-gradient(${bgColor}, ${bgColor}), linear-gradient(#fff, #fff)`;
                                cell.classList.add('region-header-cell');
                            }
                        }

                        // Skip Rows Style (Following Headers)
                        const skipCount = region.skipRows || 0;
                        if (skipCount > 0 && r >= minR + region.headerRows && r < minR + region.headerRows + skipCount) {
                            cell.classList.add('skipped-cell');
                        }

                        // Attribute Extraction Highlighting (Only for Active Region)
                        if (isActive && region.headerAttributes && region.headerAttributes.length > 0) {
                            region.headerAttributes.forEach((attr, attrIdx) => {
                                if (!attr.start || !attr.end) return;
                                try {
                                    const aStart = ExcelUtils.decodeCell(attr.start);
                                    const aEnd = ExcelUtils.decodeCell(attr.end);
                                    const aMinR = Math.min(aStart.r, aEnd.r);
                                    const aMaxR = Math.max(aStart.r, aEnd.r);
                                    const aMinC = Math.min(aStart.c, aEnd.c);
                                    const aMaxC = Math.max(aStart.c, aEnd.c);

                                    if (r >= aMinR && r <= aMaxR && c >= aMinC && c <= aMaxC) {
                                        // Attribute highlight color (e.g., Violet/Purple hue)
                                        const attrColor = '#8b5cf633'; // Semi-transparent violet
                                        cell.style.backgroundColor = attrColor;
                                        // Add a small indicator class/style
                                        cell.classList.add('region-attr-cell');
                                        // Border for attribute region
                                        const attrBorder = `1px solid #8b5cf6`;
                                        if (r === aMinR) cell.style.borderTop = attrBorder;
                                        if (r === aMaxR) cell.style.borderBottom = attrBorder;
                                        if (c === aMinC) cell.style.borderLeft = attrBorder;
                                        if (c === aMaxC) cell.style.borderRight = attrBorder;
                                    }
                                } catch (err) { /* ignore invalid cells */ }
                            });
                        }
                    }
                }
            }
        });
    }

    handleMouseDown(e, r, c) {
        // Pick Mode Check
        if (document.body.classList.contains('pick-mode-active')) {
            const address = ExcelUtils.encodeCell({ r, c });
            // Dispatch event for Sidebar to catch
            document.dispatchEvent(new CustomEvent('grid-cell-picked', {
                detail: { address, r, c }
            }));

            // Prevent default selection
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        this.isDragging = true;
        this.dragStart = { r, c };
        store.setSelection({
            start: { r, c },
            end: { r, c },
            rangeString: this.getRangeString({ r, c }, { r, c })
        });
    }

    handleMouseEnter(e, r, c) {
        if (!this.isDragging) return;
        const currentSelection = store.getState().selection;
        if (!currentSelection) return;

        store.setSelection({
            ...currentSelection,
            end: { r, c },
            rangeString: this.getRangeString(this.dragStart, { r, c })
        });
    }

    handleMouseUp(e, r, c) {
        this.isDragging = false;
    }

    getRangeString(start, end) {
        const s = ExcelUtils.encodeCell(start);
        const e = ExcelUtils.encodeCell(end);
        return `${s}:${e}`;
    }
}

export const grid = new Grid();
