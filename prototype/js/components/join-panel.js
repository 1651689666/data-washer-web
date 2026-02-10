
import { store } from '../core/store.js';
import { dbService } from '../core/database.js';

class JoinPanel {
    constructor() {
        this.container = null;
        this.state = {
            isOpen: false,
            sqlJoinState: {
                masterRegionId: null,
                slaves: []
            }
        };
    }

    init() {
        this.container = document.getElementById('join-panel-container');
        if (!this.container) {
            console.warn("Join Panel Container not found, appending to config-sections");
            this.container = document.querySelector('.config-sections');
        }

        // Initialize lastRegionCount to current count
        this.state.lastRegionCount = this.getAllRegions().length;

        store.subscribe((state) => {
            const currentRegions = this.getAllRegions();
            const currentCount = currentRegions.length;

            // Auto-expand if regions increase from <2 to >=2
            if (currentCount >= 2 && this.state.lastRegionCount < 2) {
                this.state.isOpen = true;
            }

            this.state.lastRegionCount = currentCount;
            this.ensureDefaultStrategy();
            this.render();
        });

        // Initial render
        this.render();
    }

    getAllRegions() {
        const configs = store.getState().configs || {};
        return configs.regions || [];
    }

    ensureDefaultStrategy() {
        const state = store.getState();
        const configs = state.configs || {};
        if (!configs.mergeStrategy) {
            console.log("[JoinPanel] Initializing default vertical strategy in store");
            store.setState({
                configs: {
                    ...configs,
                    mergeStrategy: { type: 'vertical', verticalConfig: { matchMode: 'byName' } }
                }
            });
        }
    }

    // Helper to get region fields (real headers from workbook data)
    getRegionFields(region) {
        if (!region) return [];

        const state = store.getState();
        const sheetName = region.sheetName || state.currentSheet;
        if (!sheetName || !state.workbookData[sheetName]) {
            return [];
        }

        const sheetData = state.workbookData[sheetName].matrix;
        if (!sheetData) return [];

        // Identify range (mirroring sidebar.js logic)
        let startRow = 0, startCol = 0, endRow = sheetData.length - 1, endCol = sheetData[0].length - 1;
        let rangeStr = region.range;
        if (!rangeStr && region.start) {
            rangeStr = region.start + ":" + (region.end || "");
        }

        if (rangeStr && window.XLSX) {
            try {
                const rangeObj = window.XLSX.utils.decode_range(rangeStr);
                startRow = rangeObj.s.r;
                startCol = rangeObj.s.c;
                if (region.end) {
                    endRow = rangeObj.e.r;
                    endCol = rangeObj.e.c;
                }
            } catch (e) {
                console.warn(`Invalid range for ${region.name}, using fallback identification`);
            }
        }

        const headerCount = region.headerRows || 1;
        const skipCount = region.skipRows || 0;
        const headerRowIdx = startRow + skipCount;

        if (!sheetData[headerRowIdx]) return [];

        const headers = [];
        for (let c = startCol; c <= endCol; c++) {
            let val = sheetData[headerRowIdx][c];
            // Format as string, handle empty
            if (val === undefined || val === null || val === '') {
                headers.push(`Column_${c + 1}`);
            } else {
                headers.push(String(val).trim());
            }
        }

        return headers;
    }

    render() {
        const regions = this.getAllRegions();
        // Check if we have at least 2 regions to enable merge
        const canMerge = regions.length >= 2;
        const isOpen = this.state.isOpen !== false;

        if (!this.container) return;

        let panel = this.container.querySelector('#join-config-panel');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'join-config-panel';
            panel.className = 'config-item';
            this.container.innerHTML = '';
            this.container.appendChild(panel);
        }

        // Check current strategy from store (if exists) or default
        const configs = store.getState().configs || {};
        const strategy = configs.mergeStrategy || { type: 'vertical', verticalConfig: { matchMode: 'byName' } };

        const isVertical = strategy.type === 'vertical';
        const isHorizontal = strategy.type === 'horizontal';

        const content = `
            <div class="join-strategy-list">
                <!-- Vertical Merge Card -->
                <div class="strategy-card square ${isVertical ? 'active' : ''} ${!canMerge ? 'disabled' : ''}" data-strategy="vertical">
                    <div class="card-diagram vertical-diagram">
                        <div class="rect"></div>
                        <div class="rect"></div>
                        <div class="rect"></div>
                        <div class="arrow-down"></div>
                    </div>
                    <span class="card-title">垂直合并</span>
                    <span class="text-sm text-muted description">纵向拼接多个表格数据</span>
                    
                     ${isVertical ? `
                    <div class="card-footer" onclick="event.stopPropagation()">
                        <select id="vertical-match-mode" class="form-select-sm full-width">
                            <option value="byName" ${strategy.verticalConfig?.matchMode === 'byName' ? 'selected' : ''}>按字段名对齐</option>
                            <option value="byPosition" ${strategy.verticalConfig?.matchMode === 'byPosition' ? 'selected' : ''}>按列位置合并</option>
                        </select>
                    </div>` : ''}
                </div>

                <!-- Horizontal Merge Card -->
                <div class="strategy-card square ${isHorizontal ? 'active' : ''} ${!canMerge ? 'disabled' : ''}" data-strategy="horizontal">
                    <div class="card-diagram horizontal-diagram">
                        <div class="rect-h"></div>
                        <div class="link-line"></div>
                        <div class="rect-h"></div>
                    </div>
                    <span class="card-title">水平合并</span>
                    <span class="text-sm text-muted description">横向关联多个表格字段</span>
                    
                     ${isHorizontal ? `
                    <div class="card-footer" onclick="event.stopPropagation()">
                        <button class="btn btn-outline btn-sm full-width" id="btn-open-join-modal">
                            <i data-lucide="settings-2"></i> 配置规则
                        </button>
                    </div>` : ''}
                </div>
            </div>
            ${!canMerge ? '<div class="text-sm text-muted" style="text-align:center; margin-top:12px;">请至少提取两个表格区域以启用合并功能</div>' : ''}
        `;

        panel.className = `config-item ${this.state.isOpen ? 'open' : ''}`;
        panel.innerHTML = `
            <div class="config-item-header" id="join-config-header" style="cursor: pointer;">
                <i data-lucide="merge"></i>
                <span class="section-title">表格合并</span>
                <i data-lucide="chevron-down" class="chevron" style="margin-left: auto; transition: transform 0.2s;"></i>
            </div>
            <div class="config-item-body" style="padding: 12px; ${this.state.isOpen ? '' : 'display: none;'}">
                ${content}
            </div>
        `;

        if (window.lucide) window.lucide.createIcons();
        this.bindEvents();
    }

    bindEvents() {
        // Toggle Accordion
        const header = document.getElementById('join-config-header');
        if (header) {
            header.onclick = () => {
                this.state.isOpen = !this.state.isOpen;
                this.render();
            };
        }

        // Strategy Selection
        this.container.querySelectorAll('.strategy-card').forEach(card => {
            card.onclick = (e) => {
                // Prevent bubbling if clicked in select/button provided in HTML
                if (e.target.closest('select') || e.target.closest('button')) return;

                if (this.getAllRegions().length < 2) return;

                const strategyType = card.dataset.strategy;
                const currentConfigs = store.getState().configs || {};

                // Construct new strategy object preserving existing config where possible
                let newStrategy = currentConfigs.mergeStrategy || {};
                newStrategy = { ...newStrategy, type: strategyType };

                if (strategyType === 'vertical' && !newStrategy.verticalConfig) {
                    newStrategy.verticalConfig = { matchMode: 'byName' };
                }
                if (strategyType === 'horizontal' && !newStrategy.horizontalConfig) {
                    newStrategy.horizontalConfig = { slaves: [] };
                }

                store.setState({
                    configs: {
                        ...currentConfigs,
                        mergeStrategy: newStrategy
                    }
                });

                // State update triggers subscribe->render, so we don't need manual render
            };
        });

        // Vertical config change
        const matchModeSelect = document.getElementById('vertical-match-mode');
        if (matchModeSelect) {
            matchModeSelect.onchange = (e) => {
                const currentConfigs = store.getState().configs || {};
                const strategy = currentConfigs.mergeStrategy || { type: 'vertical' };

                store.setState({
                    configs: {
                        ...currentConfigs,
                        mergeStrategy: {
                            ...strategy,
                            verticalConfig: { ...strategy.verticalConfig, matchMode: e.target.value }
                        }
                    }
                });
            };
        }

        // Horizontal Open Modal
        const btnOpenModal = document.getElementById('btn-open-join-modal');
        if (btnOpenModal) {
            btnOpenModal.onclick = (e) => {
                e.stopPropagation();
                this.openJoinSetupDialog();
            };
        }


    }

    // --- Modal Logic ---

    openJoinSetupDialog() {
        const allRegions = this.getAllRegions();
        if (allRegions.length < 2) {
            alert('至少需要两个表格区域才能配置合并。');
            return;
        }

        const modal = document.getElementById('join-setup-modal');
        if (!modal) return;

        // Load current config
        const configs = store.getState().configs || {};
        const hConfig = configs.mergeStrategy?.horizontalConfig || {};

        this.state.sqlJoinState = {
            masterRegionId: hConfig.masterRegionId || null,
            slaves: hConfig.slaves ? JSON.parse(JSON.stringify(hConfig.slaves)) : []
        };

        // Render UI parts
        this.renderModalUI();

        // Check binding
        const closeBtn = document.getElementById('join-modal-close');
        const cancelBtn = document.getElementById('join-modal-cancel');
        const saveBtn = document.getElementById('join-modal-save');

        if (closeBtn) closeBtn.onclick = () => modal.style.display = 'none';
        if (cancelBtn) cancelBtn.onclick = () => modal.style.display = 'none';

        if (saveBtn) {
            saveBtn.onclick = () => {
                if (!this.state.sqlJoinState.masterRegionId) {
                    alert("请选择主表");
                    return;
                }

                // Save to store
                const currentConfigs = store.getState().configs || {};
                const currentStrategy = currentConfigs.mergeStrategy || { type: 'horizontal' };

                store.setState({
                    configs: {
                        ...currentConfigs,
                        mergeStrategy: {
                            ...currentStrategy,
                            horizontalConfig: JSON.parse(JSON.stringify(this.state.sqlJoinState))
                        }
                    }
                });

                modal.style.display = 'none';
            };
        }

        modal.style.display = 'flex';
        if (window.lucide) window.lucide.createIcons();
    }

    renderModalUI() {
        this.renderMasterSection();
        this.renderSlaveList();
    }

    renderMasterSection() {
        const select = document.getElementById('join-master-select');
        if (!select) return;

        const allRegions = this.getAllRegions();
        select.innerHTML = '<option value="">选择主表...</option>';
        select.className = 'form-select-sm';
        select.style.fontWeight = '600';
        allRegions.forEach(r => {
            const option = document.createElement('option');
            option.value = r.id;
            option.textContent = r.name;
            option.selected = r.id === this.state.sqlJoinState.masterRegionId;
            select.appendChild(option);
        });

        select.onchange = (e) => {
            const newVal = e.target.value;
            if (newVal !== this.state.sqlJoinState.masterRegionId) {
                this.state.sqlJoinState.masterRegionId = newVal;

                // Auto-load other regions as slaves
                if (newVal) {
                    const otherRegions = allRegions.filter(r => r.id !== newVal);
                    this.state.sqlJoinState.slaves = otherRegions.map(r => ({
                        regionId: r.id,
                        joinType: 'left',
                        joinKeys: [{ slaveField: '', targetInstanceId: 'MASTER', targetField: '' }]
                    }));
                } else {
                    this.state.sqlJoinState.slaves = [];
                }

                this.renderSlaveList();
            }
        };
    }

    renderSlaveList() {
        const container = document.getElementById('slave-tables-container');
        if (!container) return;

        container.innerHTML = '';

        this.state.sqlJoinState.slaves.forEach((slave, index) => {
            container.appendChild(this.createSlaveCard(slave, index));
        });

        if (window.lucide) window.lucide.createIcons();
    }

    createSlaveCard(slave, index) {
        const card = document.createElement('div');
        card.className = 'slave-config-block'; // Now a block/card-like container
        card.style.background = '#ffffff';
        card.style.border = '1px solid #eef2f6';
        card.style.borderRadius = '12px';
        card.style.padding = '16px';
        card.style.marginBottom = '20px';
        card.style.boxShadow = '0 2px 8px rgba(0,0,0,0.02)';

        // 1. Header: Join Type + Slave Table
        const header = document.createElement('div');
        header.className = 'slave-block-header';
        header.style.display = 'flex';
        header.style.alignItems = 'center';
        header.style.gap = '12px';
        header.style.marginBottom = '16px';

        // Join Type Select with Icons
        header.appendChild(this.createCustomJoinTypeSelect(slave));

        // Slave Region Select
        const rSelect = document.createElement('select');
        rSelect.className = 'form-select-sm';
        rSelect.style.width = '180px';
        rSelect.style.fontWeight = '500';

        this.getAllRegions().forEach(r => {
            const opt = document.createElement('option');
            opt.value = r.id;
            opt.textContent = r.name;
            opt.selected = r.id === slave.regionId;
            if (r.id === this.state.sqlJoinState.masterRegionId) opt.disabled = true;
            rSelect.appendChild(opt);
        });

        rSelect.onchange = (e) => {
            slave.regionId = e.target.value;
            this.renderSlaveList();
        };
        header.appendChild(rSelect);

        // Removal button for slave
        const rmSlave = document.createElement('button');
        rmSlave.className = 'btn-icon-sm';
        rmSlave.innerHTML = '<i data-lucide="trash-2"></i>';
        rmSlave.title = "删除此表关联";
        rmSlave.style.marginLeft = 'auto'; // Push to the right
        rmSlave.onclick = () => {
            this.state.sqlJoinState.slaves.splice(index, 1);
            this.renderSlaveList();
        };
        header.appendChild(rmSlave);

        card.appendChild(header);

        // 2. Connector / ON Label
        const conditionLabel = document.createElement('div');
        conditionLabel.className = 'join-condition-header';
        conditionLabel.style.display = 'flex';
        conditionLabel.style.alignItems = 'center';
        conditionLabel.style.gap = '8px';
        conditionLabel.style.marginBottom = '12px';
        conditionLabel.style.paddingLeft = '8px';
        conditionLabel.innerHTML = `
            <span class="sql-keyword" style="font-size: 11px; font-weight: 700; color: #94a3b8; letter-spacing: 0.05em; background: #f1f5f9; padding: 2px 6px; border-radius: 4px;">ON</span>
            <span style="font-size: 12px; color: #64748b; font-weight: 500;">关联条件</span>
            <div style="flex: 1; height: 1px; background: #f1f5f9;"></div>
        `;
        card.appendChild(conditionLabel);

        // 3. Join Keys List
        const keyList = document.createElement('div');
        keyList.className = 'join-keys-list';
        keyList.style.display = 'flex';
        keyList.style.flexDirection = 'column';
        keyList.style.gap = '8px';

        if (slave.joinKeys) {
            slave.joinKeys.forEach((k, kIndex) => {
                keyList.appendChild(this.createJoinKeyRow(k, kIndex, index, slave));
            });
        }

        card.appendChild(keyList);
        return card;
    }

    createCustomJoinTypeSelect(slave) {
        const wrapper = document.createElement('div');
        wrapper.className = 'custom-join-select';

        const types = [
            { id: 'left', name: '左连接', icon: 'left' },
            { id: 'right', name: '右连接', icon: 'right' },
            { id: 'inner', name: '内连接', icon: 'inner' },
            { id: 'full', name: '全连接', icon: 'full' }
        ];

        const current = types.find(t => t.id === slave.joinType) || types[0];

        wrapper.innerHTML = `
            <div class="custom-select-trigger">
                <div class="join-icon-small ${current.icon}"></div>
                <span>${current.name}</span>
                <i data-lucide="chevron-down" class="chevron"></i>
            </div>
            <div class="custom-select-options">
                ${types.map(t => `
                    <div class="custom-option" data-value="${t.id}">
                        <div class="join-icon-small ${t.icon}"></div>
                        <span>${t.name}</span>
                    </div>
                `).join('')}
            </div>
        `;

        const trigger = wrapper.querySelector('.custom-select-trigger');
        const options = wrapper.querySelector('.custom-select-options');

        trigger.onclick = (e) => {
            e.stopPropagation();
            const isOpen = wrapper.classList.contains('open');
            document.querySelectorAll('.custom-join-select.open').forEach(el => el.classList.remove('open'));
            if (!isOpen) wrapper.classList.add('open');
        };

        wrapper.querySelectorAll('.custom-option').forEach(opt => {
            opt.onclick = (e) => {
                e.stopPropagation();
                slave.joinType = opt.dataset.value;
                wrapper.classList.remove('open');
                this.renderSlaveList();
            };
        });

        // Close on outside click
        document.addEventListener('click', () => wrapper.classList.remove('open'), { once: true });

        return wrapper;
    }

    createJoinKeyRow(key, keyIndex, slaveIndex, slave) {
        const row = document.createElement('div');
        row.className = 'join-key-row';
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.gap = '8px';
        row.style.marginBottom = '8px';

        // Slave Field
        const sFields = this.getRegionFields(this.getAllRegions().find(r => r.id === slave.regionId));
        const sSelect = document.createElement('select');
        sSelect.className = 'form-control-sm';
        sSelect.style.width = '160px';
        sSelect.innerHTML = '<option value="">选择字段</option>';
        sFields.forEach(f => {
            sSelect.innerHTML += `<option value="${f}" ${key.slaveField === f ? 'selected' : ''}>${f}</option>`;
        });
        sSelect.onchange = (e) => key.slaveField = e.target.value;

        const eq = document.createElement('span');
        eq.textContent = '=';
        eq.style.color = '#94a3b8';
        eq.style.fontWeight = 'bold';

        // Target Table
        const tTable = document.createElement('select');
        tTable.className = 'form-control-sm';
        tTable.style.width = '160px';

        const targets = [];
        const masterReg = this.getAllRegions().find(r => r.id === this.state.sqlJoinState.masterRegionId);
        targets.push({ id: 'MASTER', name: masterReg ? masterReg.name : '主表' });

        for (let i = 0; i < slaveIndex; i++) {
            const prevSlave = this.state.sqlJoinState.slaves[i];
            const r = this.getAllRegions().find(reg => reg.id === prevSlave.regionId);
            targets.push({ id: `SLAVE_${i}`, name: r ? r.name : `从表 ${i + 1}`, regionId: prevSlave.regionId });
        }

        targets.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.textContent = t.name;
            opt.selected = t.id === key.targetInstanceId;
            tTable.appendChild(opt);
        });

        tTable.onchange = (e) => {
            key.targetInstanceId = e.target.value;
            key.targetField = '';
            this.renderSlaveList();
        };

        // Target Field
        const tField = document.createElement('select');
        tField.className = 'form-control-sm';
        tField.style.width = '160px';
        tField.innerHTML = '<option value="">选择字段</option>';

        let targetRegionId = null;
        if (key.targetInstanceId === 'MASTER') targetRegionId = this.state.sqlJoinState.masterRegionId;
        else if (key.targetInstanceId.startsWith('SLAVE_')) {
            const idx = parseInt(key.targetInstanceId.split('_')[1]);
            targetRegionId = this.state.sqlJoinState.slaves[idx].regionId;
        }

        if (targetRegionId) {
            const tFields = this.getRegionFields(this.getAllRegions().find(r => r.id === targetRegionId));
            tFields.forEach(f => {
                tField.innerHTML += `<option value="${f}" ${key.targetField === f ? 'selected' : ''}>${f}</option>`;
            });
        }
        tField.onchange = (e) => key.targetField = e.target.value;

        // Actions
        const actions = document.createElement('div');
        actions.style.display = 'flex';
        actions.style.gap = '4px';

        // Remove Key
        const rm = document.createElement('button');
        rm.className = 'btn-icon-sm';
        rm.innerHTML = '<i data-lucide="minus-circle"></i>';
        rm.title = "删除连接键";
        rm.onclick = () => {
            slave.joinKeys.splice(keyIndex, 1);
            if (slave.joinKeys.length === 0) {
                slave.joinKeys.push({ slaveField: '', targetInstanceId: 'MASTER', targetField: '' });
            }
            this.renderSlaveList();
        };

        // Add Key
        const add = document.createElement('button');
        add.className = 'btn-icon-sm';
        add.innerHTML = '<i data-lucide="plus-circle"></i>';
        add.title = "添加连接键";
        add.onclick = () => {
            slave.joinKeys.splice(keyIndex + 1, 0, { slaveField: '', targetInstanceId: 'MASTER', targetField: '' });
            this.renderSlaveList();
        };

        row.appendChild(sSelect);
        row.appendChild(eq);
        row.appendChild(tTable);
        row.appendChild(tField);
        actions.appendChild(rm);
        actions.appendChild(add);
        row.appendChild(actions);

        return row;
    }

    addSlave() {
        // Find unused region if possible, or just first available
        if (!this.state.sqlJoinState.masterRegionId) { alert("请先选择主表"); return; }
        const all = this.getAllRegions();
        // simple find first not master
        const candidate = all.find(r => r.id !== this.state.sqlJoinState.masterRegionId);

        this.state.sqlJoinState.slaves.push({
            regionId: candidate ? candidate.id : '',
            joinType: 'left',
            joinKeys: [{ slaveField: '', targetInstanceId: 'MASTER', targetField: '' }]
        });
        this.renderSlaveList();
    }
}

export const joinPanel = new JoinPanel();
