
import { store } from '../core/store.js';
import { regionService } from '../services/region-service.js';

class RegionPanel {
    constructor() {
        this.container = null;
        this.gridCellPickedHandler = null; // Store handler to prevent duplication
        // 10 Preset Colors for Regions
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

        this.state = {
            activeTab: 0,
            editingRegionIndex: null,
            isOpen: true,
            regions: [
                {
                    id: 'r_0',
                    name: '表格1',
                    range: '',
                    start: '',
                    end: '',
                    headerRows: 1,
                    skipRows: 0,
                    direction: 'vertical',
                    cascadeHeader: false,
                    tableName: 't_table1',
                    colorIndex: 0,
                    isDirty: false
                }
            ]
        };
    }

    init() {
        this.container = document.getElementById('region-config-container');
        if (!this.container) return;

        // Global Event Listener for Cell Picking - Prevent duplication
        if (this.gridCellPickedHandler) {
            document.removeEventListener('grid-cell-picked', this.gridCellPickedHandler);
        }
        this.gridCellPickedHandler = (e) => {
            const { address, row, col } = e.detail;
            const targetInputId = document.body.dataset.pickTargetId;
            const attrPickIdx = document.body.dataset.pickAttrIdx;
            const attrPickType = document.body.dataset.pickAttrType;

            if (attrPickIdx !== undefined && attrPickIdx !== null) {
                const idx = parseInt(attrPickIdx);
                const region = this.state.regions[this.state.activeTab];
                if (region && region.headerAttributes && region.headerAttributes[idx]) {
                    if (attrPickType === 'start') {
                        region.headerAttributes[idx].start = address;
                    } else if (attrPickType === 'end') {
                        region.headerAttributes[idx].end = address;
                    }
                    region.isDirty = true;
                    this.setPickMode(false);
                    this.syncToStore();
                    this.render();
                } else {
                    this.setPickMode(false);
                }
                return;
            }

            if (targetInputId && address) {
                const region = this.state.regions[this.state.activeTab];
                if (region) {
                    const currentSheet = store.getState().currentSheet;
                    if (targetInputId === 'region-start') region.start = address;
                    if (targetInputId === 'region-end') region.end = address;
                    if (currentSheet) region.sheetName = currentSheet; // Sync sheet name
                    region.isDirty = true;
                    this.syncToStore();
                    this.render(); // Re-render to update card and inputs
                }
                this.setPickMode(false);
            }
        };
        document.addEventListener('grid-cell-picked', this.gridCellPickedHandler);

        this.syncToStore();
        this.render();
    }

    render() {
        if (!this.container) return;
        const activeRegion = this.state.regions[this.state.activeTab];
        const isOpen = this.state.isOpen !== false;

        const html = `
            <div class="config-item ${isOpen ? 'open' : ''}" id="region-config-item">
                <div class="config-item-header" id="region-config-header" style="cursor: pointer;">
                    <i data-lucide="grid-3x3"></i>
                    <span class="section-title">表格区域</span>
                    <button class="btn-icon-sm btn-add-inline" id="btn-add-region" title="添加区域">
                        <i data-lucide="plus"></i>
                    </button>
                    <i data-lucide="chevron-down" class="chevron" style="transition: transform 0.2s;"></i>
                </div>
                <div class="config-item-body" style="${isOpen ? '' : 'display: none;'}">
                    <div class="region-card-list">
                        ${this.state.regions.map((r, idx) => {
            const color = this.colors[r.colorIndex % this.colors.length];
            const isActive = idx === this.state.activeTab;
            const isEditing = idx === this.state.editingRegionIndex;
            const locationText = `${r.sheetName || 'Sheet1'}!${r.start || ''}:${r.end || ''}`;

            return `
                                <div class="region-card ${isActive ? 'active' : ''} ${isEditing ? 'editing' : ''}" data-idx="${idx}" style="border-left: 4px solid ${color};">
                                    <div class="region-card-header">
                                        <div class="region-card-info" style="flex-direction: row; align-items: center; gap: 8px;">
                                            ${isEditing ?
                    `<input type="text" class="region-name-input" value="${r.name}" data-idx="${idx}">` :
                    `<span class="region-name">${r.name}</span>`
                }
                                            <span class="badge-sm">${locationText}</span>
                                        </div>
                                        <div class="region-card-actions">
                                            ${r.isDirty ? `<button class="btn-icon-sm save-region-btn highlighted" data-idx="${idx}" title="保存更改"><i data-lucide="save"></i></button>` : ''}
                                            <button class="btn-icon-sm rename-btn" data-idx="${idx}" title="重命名"><i data-lucide="edit-2"></i></button>
                                            ${this.state.regions.length > 1 ? `<button class="btn-icon-sm delete-btn" data-idx="${idx}" title="删除"><i data-lucide="trash-2"></i></button>` : ''}
                                        </div>
                                    </div>
                                </div>
                            `;
        }).join('')}
                    </div>

                    <div class="current-region-form-container" style="background: #f8fafc; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0;">
                         <div class="sidebar-form-row">
                             <div class="form-group sidebar-form-col">
                                <label>起始位置</label>
                                <div class="input-with-action">
                                    <input type="text" id="region-start" placeholder="必填 (如 A1)" value="${activeRegion.start || ''}">
                                    <button class="btn-icon btn-pick" data-target="region-start" title="点击后在表格中选择"><i data-lucide="pipette"></i></button>
                                </div>
                            </div>
                            <div class="form-group sidebar-form-col">
                                <label>终止位置</label>
                                <div class="input-with-action">
                                    <input type="text" id="region-end" placeholder="必填 (如 D100)" value="${activeRegion.end || ''}">
                                    <button class="btn-icon btn-pick" data-target="region-end" title="点击后在表格中选择"><i data-lucide="pipette"></i></button>
                                </div>
                            </div>
                        </div>

                        <div class="sidebar-form-row">
                            <div class="form-group sidebar-form-col">
                                <label>表头行数</label>
                                <input type="number" id="region-header-rows" value="${activeRegion.headerRows}" min="0">
                            </div>
                            <div class="form-group sidebar-form-col">
                                <label>跳过行数</label>
                                <input type="number" id="region-skip-rows" value="${activeRegion.skipRows}" min="0">
                            </div>
                        </div>

                        <div class="sidebar-form-row" style="margin-top: 4px;">
                            <div class="form-group sidebar-form-col">
                                <label>表格方向</label>
                                <div class="direction-switcher">
                                    <button class="dir-btn ${activeRegion.direction !== 'horizontal' ? 'active' : ''}" data-dir="vertical" title="纵向">
                                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style="flex-shrink: 0; margin-right: 2px;">
                                            <rect x="0.5" y="0.5" width="15" height="15" rx="1.5" stroke="currentColor" stroke-opacity="0.2" />
                                            <rect x="0" y="0" width="16" height="5" rx="1" fill="currentColor" />
                                            <path d="M0 9H16" stroke="currentColor" stroke-opacity="0.1" />
                                            <path d="M0 13H16" stroke="currentColor" stroke-opacity="0.1" />
                                            <path d="M5.5 5V16" stroke="currentColor" stroke-opacity="0.1" />
                                            <path d="M10.5 5V16" stroke="currentColor" stroke-opacity="0.1" />
                                        </svg>
                                        <span>纵向</span>
                                    </button>
                                    <button class="dir-btn ${activeRegion.direction === 'horizontal' ? 'active' : ''}" data-dir="horizontal" title="横向">
                                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style="flex-shrink: 0; margin-right: 2px;">
                                            <rect x="0.5" y="0.5" width="15" height="15" rx="1.5" stroke="currentColor" stroke-opacity="0.2" />
                                            <rect x="0" y="0" width="5" height="16" rx="1" fill="currentColor" />
                                            <path d="M9 0V16" stroke="currentColor" stroke-opacity="0.2" />
                                            <path d="M13 0V16" stroke="currentColor" stroke-opacity="0.2" />
                                            <path d="M5 5.5H16" stroke="currentColor" stroke-opacity="0.1" />
                                            <path d="M5 10.5H16" stroke="currentColor" stroke-opacity="0.1" />
                                        </svg>
                                        <span>横向</span>
                                    </button>
                                </div>
                            </div>
                            <div class="form-group sidebar-form-col">
                                <label style="opacity: ${activeRegion.headerRows > 1 ? 1 : 0.3};">级联拼接表头(_)</label>
                                <div style="height: 32px; display: flex; align-items: center;">
                                    <label class="visibility-toggle" style="margin-top: 0; ${activeRegion.headerRows > 1 ? '' : 'pointer-events: none; opacity: 0.3;'}">
                                        <input type="checkbox" id="region-cascade-header" ${activeRegion.cascadeHeader ? 'checked' : ''}>
                                        <span class="toggle-slider"></span>
                                    </label>
                                </div>
                            </div>
                        </div>

                        <!-- 属性提取 (Attribute Extraction) -->
                        <div class="attr-extraction-section" style="margin-top: 12px; padding-top: 12px; border-top: 1px dashed #e2e8f0;">
                            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                                <label style="font-weight: 500; font-size: 0.85rem; color: var(--text-muted);">属性提取</label>
                                <button class="btn btn-outline btn-sm" id="btn-add-attr" style="padding: 2px 8px; height: 24px; font-size: 0.75rem;">
                                    <i data-lucide="plus" style="width: 12px; height: 12px;"></i> 添加属性
                                </button>
                            </div>
                            <div class="attr-list" id="attr-list">
                                ${(activeRegion.headerAttributes || []).map((attr, aIdx) => {
            const errorMsg = this.validateAttrRange(attr, activeRegion.direction);
            return `
                                        <div class="attr-item-rule" style="margin-bottom: 12px; display: flex; flex-direction: column; gap: 2px;">
                                            <div class="sidebar-form-row" style="margin-bottom: 0; gap: 4px; align-items: center; flex-wrap: nowrap; width: 100%;">
                                                <div style="flex: 1.2; min-width: 0;">
                                                    <div class="input-with-action">
                                                        <input type="text" class="attr-start" data-idx="${aIdx}" placeholder="起始位置" value="${attr.start || ''}" style="background: #fff; font-size: 12px; height: 28px; border-color: ${errorMsg ? '#ef4444' : '#cbd5e1'}; width: 100%; min-width: 0; padding: 0 4px;">
                                                        <button class="btn-icon btn-pick-attr" data-idx="${aIdx}" data-type="start" style="width: 24px; height: 28px; border-color: ${errorMsg ? '#ef4444' : '#cbd5e1'}; flex-shrink: 0;" title="在表格中选取起始点"><i data-lucide="pipette" style="width: 12px; height: 12px;"></i></button>
                                                    </div>
                                                </div>
                                                <div style="flex: 1.2; min-width: 0;">
                                                    <div class="input-with-action">
                                                        <input type="text" class="attr-end" data-idx="${aIdx}" placeholder="终止位置" value="${attr.end || ''}" style="background: #fff; font-size: 12px; height: 28px; border-color: ${errorMsg ? '#ef4444' : '#cbd5e1'}; width: 100%; min-width: 0; padding: 0 4px;">
                                                        <button class="btn-icon btn-pick-attr" data-idx="${aIdx}" data-type="end" style="width: 24px; height: 28px; border-color: ${errorMsg ? '#ef4444' : '#cbd5e1'}; flex-shrink: 0;" title="在表格中选取终止点"><i data-lucide="pipette" style="width: 12px; height: 12px;"></i></button>
                                                    </div>
                                                </div>
                                                <div style="flex: 0.6; min-width: 0;">
                                                    <input type="text" class="attr-suffix" data-idx="${aIdx}" placeholder="后缀" value="${attr.suffix || ''}" style="background: #fff; font-size: 12px; height: 28px; border-color: #cbd5e1; width: 100%; min-width: 0; padding: 0 4px;">
                                                </div>
                                                <button class="btn-icon-sm delete-attr-btn" data-idx="${aIdx}" style="color: #94a3b8; width: 22px; height: 24px; flex-shrink: 0; padding: 0; border: none; background: none;" title="删除"><i data-lucide="x" style="width: 14px; height: 14px;"></i></button>
                                            </div>
                                            ${errorMsg ? `<div class="error-text" style="color: #ef4444; font-size: 10px; width: 100%; padding-left: 2px; line-height: 1.2;">${errorMsg}</div>` : ''}
                                        </div>
                                    `;
        }).join('')}
                                ${(!activeRegion.headerAttributes || activeRegion.headerAttributes.length === 0) ? '<p class="hint" style="text-align: center; margin: 4px 0; font-size: 0.75rem; color: #94a3b8;">暂无属性提取规则</p>' : ''}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.container.innerHTML = html;
        if (window.lucide) window.lucide.createIcons();
        this.bindEvents();
    }

    bindEvents() {
        if (!this.container) return;

        // Save Region Button
        this.container.querySelectorAll('.save-region-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.dataset.idx);
                const region = this.state.regions[idx];

                // Mandatory validation
                if (!region.start || !region.end) {
                    alert(`表格区域 [${region.name}] 的起始位置和终止位置不能为空。`);
                    return;
                }

                btn.disabled = true;
                try {
                    await regionService.saveAllRegionsToDB(this.state.regions);
                    region.isDirty = false;
                    this.render();
                } catch (e) {
                    console.error(e);
                    alert("保存失败: " + e.message);
                    btn.disabled = false;
                }
            });
        });

        // Region Card Selection
        this.container.querySelectorAll('.region-card').forEach(el => {
            el.addEventListener('click', (e) => {
                if (e.target.closest('button')) return;
                const idx = parseInt(el.dataset.idx);
                this.state.activeTab = idx;
                this.syncToStore();
                this.render();
            });
        });

        // Header Toggle
        const header = document.getElementById('region-config-header');
        if (header) {
            header.addEventListener('click', () => {
                this.state.isOpen = !this.state.isOpen;
                this.render();
            });
        }

        // Rename
        this.container.querySelectorAll('.rename-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.dataset.idx);
                this.state.editingRegionIndex = idx;
                this.render();
                const input = this.container.querySelector(`.region-name-input[data-idx="${idx}"]`);
                if (input) { input.focus(); input.select(); }
            });
        });

        // Inline Rename Input
        this.container.querySelectorAll('.region-name-input').forEach(input => {
            const saveRename = () => {
                const idx = parseInt(input.dataset.idx);
                const newName = input.value.trim();
                if (newName) this.state.regions[idx].name = newName;
                this.state.editingRegionIndex = null;
                this.render();
                this.syncToStore();
            };
            input.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveRename(); });
            input.addEventListener('blur', () => saveRename());
            input.addEventListener('click', (e) => e.stopPropagation());
        });

        // Delete
        this.container.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.dataset.idx);
                if (confirm('确定要删除这个表格区域吗？')) {
                    this.state.regions.splice(idx, 1);
                    if (this.state.activeTab >= this.state.regions.length) {
                        this.state.activeTab = Math.max(0, this.state.regions.length - 1);
                    }
                    this.syncToStore();
                    this.render();
                }
            });
        });

        // Add Region
        const btnAdd = document.getElementById('btn-add-region');
        if (btnAdd) {
            btnAdd.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = this.state.regions.length;
                const currentSheet = store.getState().currentSheet || 'Sheet1';
                this.state.regions.push({
                    id: `r_${Date.now()}`,
                    name: `表格${idx + 1}`,
                    range: '',
                    start: '',
                    end: '',
                    headerRows: 1,
                    skipRows: 0,
                    direction: 'vertical',
                    cascadeHeader: false,
                    tableName: `t_table${idx + 1}`,
                    colorIndex: idx,
                    sheetName: currentSheet,
                    isDirty: false
                });
                this.state.activeTab = idx;
                this.syncToStore();
                this.render();
            });
        }

        // Direction Switcher
        this.container.querySelectorAll('.dir-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const region = this.state.regions[this.state.activeTab];
                region.direction = btn.dataset.dir;
                region.isDirty = true;
                this.syncToStore();
                this.render();
            });
        });

        // Pick Mode Handlers
        this.container.querySelectorAll('.btn-pick').forEach(btn => {
            btn.addEventListener('click', () => {
                const targetId = btn.dataset.target;
                this.setPickMode(true, targetId);
            });
        });

        // Generic Input Change
        const inputs = this.container.querySelectorAll('input');
        inputs.forEach(input => {
            input.addEventListener('input', () => {
                if (input.classList.contains('region-name-input') || input.classList.contains('attr-suffix')) return;
                const region = this.state.regions[this.state.activeTab];
                region.isDirty = true;
                const currentSheet = store.getState().currentSheet;
                if (currentSheet) region.sheetName = currentSheet; // Sync sheet name

                if (input.id === 'region-start') region.start = input.value;
                if (input.id === 'region-end') region.end = input.value;
                if (input.id === 'region-header-rows') {
                    region.headerRows = parseInt(input.value) || 1;
                    if (region.headerRows <= 1) region.cascadeHeader = false;
                }
                if (input.id === 'region-skip-rows') region.skipRows = parseInt(input.value) || 0;
                if (input.id === 'region-cascade-header') region.cascadeHeader = input.checked;

                this.syncToStore();
                this.render(); // Ensure card label and buttons update
            });
        });

        // Add Attribute
        const btnAddAttr = document.getElementById('btn-add-attr');
        if (btnAddAttr) {
            btnAddAttr.addEventListener('click', () => {
                const region = this.state.regions[this.state.activeTab];
                if (!region.headerAttributes) region.headerAttributes = [];
                region.headerAttributes.push({
                    start: '',
                    end: '',
                    suffix: `属性${region.headerAttributes.length + 1}`
                });
                region.isDirty = true;
                this.syncToStore();
                this.render();
            });
        }

        // Delete Attribute
        this.container.querySelectorAll('.delete-attr-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.idx);
                const region = this.state.regions[this.state.activeTab];
                if (region.headerAttributes) {
                    region.headerAttributes.splice(idx, 1);
                    region.isDirty = true;
                    this.syncToStore();
                    this.render();
                }
            });
        });

        // Pick Attribute (Updated for Start/End)
        this.container.querySelectorAll('.btn-pick-attr').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = btn.dataset.idx;
                const type = btn.dataset.type; // 'start' or 'end'
                this.setPickMode(true, null, idx, type);
            });
        });

        // Attribute Input Changes (Manual Input Support)
        ['.attr-start', '.attr-end'].forEach(selector => {
            this.container.querySelectorAll(selector).forEach(input => {
                input.addEventListener('input', () => {
                    const idx = parseInt(input.dataset.idx);
                    const region = this.state.regions[this.state.activeTab];
                    if (region.headerAttributes && region.headerAttributes[idx]) {
                        if (input.classList.contains('attr-start')) {
                            region.headerAttributes[idx].start = input.value;
                        } else {
                            region.headerAttributes[idx].end = input.value;
                        }
                        region.isDirty = true;
                    }
                });
                input.addEventListener('blur', () => {
                    this.syncToStore();
                    this.render(); // Re-render to show validation state
                });
            });
        });

        // Suffix Input Change - Performance Optimization: Update state on input, sync to store on blur
        this.container.querySelectorAll('.attr-suffix').forEach(input => {
            input.addEventListener('input', () => {
                const idx = parseInt(input.dataset.idx);
                const region = this.state.regions[this.state.activeTab];
                if (region.headerAttributes && region.headerAttributes[idx]) {
                    region.headerAttributes[idx].suffix = input.value;
                    region.isDirty = true;
                    // Do NOT sync to store or render here to avoid lag
                }
            });
            input.addEventListener('blur', () => {
                this.syncToStore();
            });
        });
    }

    setPickMode(active, targetId = null, attrIdx = null, attrType = null) {
        if (active) {
            document.body.classList.add('pick-mode-active');
            if (targetId) document.body.dataset.pickTargetId = targetId;
            if (attrIdx !== null) document.body.dataset.pickAttrIdx = attrIdx;
            if (attrType !== null) document.body.dataset.pickAttrType = attrType;
        } else {
            document.body.classList.remove('pick-mode-active');
            delete document.body.dataset.pickTargetId;
            delete document.body.dataset.pickAttrIdx;
            delete document.body.dataset.pickAttrType;
        }
    }

    validateAttrRange(attr, direction) {
        if (!attr.start || !attr.end) return null;
        if (!window.XLSX) return null;

        try {
            const s = window.XLSX.utils.decode_cell(attr.start);
            const e = window.XLSX.utils.decode_cell(attr.end);

            if (direction === 'horizontal') {
                // Horizontal mode: Start and End must be in the same column
                if (s.c !== e.c) return '横向模式起止位置必须在同一列';
            } else {
                // Vertical mode: Start and End must be in the same row
                if (s.r !== e.r) return '起止位置必须在同一行';
            }
        } catch (err) {
            return '无效的单元格地址';
        }
        return null;
    }

    syncToStore() {
        const currentConfigs = store.getState().configs || {};
        const regionsWithColor = this.state.regions.map(r => ({
            ...r,
            color: this.colors[r.colorIndex % this.colors.length]
        }));

        store.setState({
            configs: {
                ...currentConfigs,
                regions: regionsWithColor,
                activeRegionIndex: this.state.activeTab
            }
        });
    }

    reset() {
        this.state.regions = [
            {
                id: 'r_0',
                name: '表格1',
                range: '',
                start: '',
                end: '',
                headerRows: 1,
                skipRows: 0,
                direction: 'vertical',
                cascadeHeader: false,
                tableName: 't_table1',
                colorIndex: 0,
                isDirty: false
            }
        ];
        this.state.activeTab = 0;
        this.state.editingRegionIndex = null;
        this.syncToStore();
        this.render();
    }
}

export const regionPanel = new RegionPanel();
