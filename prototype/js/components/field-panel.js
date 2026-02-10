import { store } from '../core/store.js';
import { VerticalStrategy } from '../core/strategies/vertical-strategy.js';
import { HorizontalStrategy } from '../core/strategies/horizontal-strategy.js';
import { transformRegistry } from '../core/transform-registry.js';

class FieldPanel {
    constructor() {
        this.container = null;
        this.state = {
            isOpen: true,
            isRefreshing: false
        };
    }

    init() {
        this.container = document.getElementById('field-cleaning-list');
        const refreshBtn = document.getElementById('refresh-fields');
        // Find the parent config-item and its header
        const configItem = this.container ? this.container.closest('.config-item') : null;
        const header = configItem ? configItem.querySelector('.config-item-header') : null;

        if (refreshBtn) {
            refreshBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent panel toggle
                this.refreshFields();
            });
        }

        if (header) {
            header.style.cursor = 'pointer';
            header.addEventListener('click', () => {
                this.state.isOpen = !this.state.isOpen;
                this.render();
            });
        }

        // Subscribe to store updates if needed
        store.subscribe((state) => {
            // Need to re-render if customRules changed (options) or fieldConfigs changed (selection)
            this.render();
        });

        this.render();
    }

    getAllRegions() {
        const state = store.getState();
        const configs = state.configs || {};
        return configs.regions || [];
    }

    refreshFields() {
        const state = store.getState();
        const regions = this.getAllRegions();

        if (regions.length === 0) {
            alert("请先定义表格区域");
            return;
        }

        const mergeStrategy = (state.configs || {}).mergeStrategy || { type: 'vertical', verticalConfig: { matchMode: 'byName' } };
        let newFieldConfigs = [];
        let strategy;

        if (mergeStrategy.type === 'horizontal') {
            strategy = new HorizontalStrategy(mergeStrategy.horizontalConfig || {});
        } else if (mergeStrategy.type === 'vertical') {
            strategy = new VerticalStrategy(mergeStrategy.verticalConfig || {});
        } else {
            // Default: use first region
            strategy = new VerticalStrategy(); // Fallback to simple listing
        }

        newFieldConfigs = strategy.computeFields(regions, state.workbookData, state.currentSheet);

        // --- PRESERVE EXISTING CONFIGS ---
        const existingConfigs = state.fieldConfigs || [];
        newFieldConfigs = newFieldConfigs.map(newConf => {
            // Match by name and sources (simplified: match by name and first source region)
            const match = existingConfigs.find(ex =>
                ex.name === newConf.name &&
                ex.sources[0]?.regionId === newConf.sources[0]?.regionId
            );
            if (match) {
                // Migration logic: strategy (string) -> strategies (array)
                let strategies = match.strategies || [];
                if (strategies.length === 0 && match.strategy && match.strategy !== 'none') {
                    strategies = [match.strategy];
                }

                return {
                    ...newConf,
                    alias: match.alias,
                    strategies: strategies,
                    hidden: match.hidden
                };
            }
            // Initialize new fields with empty strategies
            if (!newConf.strategies) newConf.strategies = [];
            return newConf;
        });

        store.setState({ fieldConfigs: newFieldConfigs });
        this.render();
        if (window.lucide) window.lucide.createIcons();
    }

    updateRefreshButton(loading) {
        const refreshBtn = document.getElementById('refresh-fields');
        if (!refreshBtn) return;

        if (loading) {
            refreshBtn.classList.add('loading');
            refreshBtn.innerHTML = '<i data-lucide="refresh-cw" class="spin"></i>';
        } else {
            refreshBtn.classList.remove('loading');
            refreshBtn.innerHTML = '<i data-lucide="refresh-cw"></i>';
        }
        if (window.lucide) window.lucide.createIcons();
    }

    render() {
        if (!this.container) return;

        // Update Panel Collapse State
        const configItem = this.container.closest('.config-item');
        const body = configItem ? configItem.querySelector('.config-item-body') : null;
        if (configItem) {
            if (this.state.isOpen) {
                configItem.classList.add('open');
                if (body) body.style.display = 'block';
            } else {
                configItem.classList.remove('open');
                if (body) body.style.display = 'none';
            }
        }

        const state = store.getState();
        const fieldConfigs = state.fieldConfigs || [];

        if (fieldConfigs.length === 0) {
            this.container.innerHTML = '<p class="hint">请点击刷新按钮生成字段列表</p>';
            return;
        }
        this.container.innerHTML = '';
        this.container.className = 'field-strategy-list';

        const regions = state.configs?.regions || [];
        const regionColorMap = new Map(regions.map(r => [r.id, r.color || '#3b82f6']));
        const regionNameMap = new Map(regions.map(r => [r.id, r.name]));

        const allRules = transformRegistry.getAllRules();

        fieldConfigs.forEach((config, idx) => {
            const card = document.createElement('div');
            card.className = `cleaning-card ${config.hidden ? 'is-hidden' : ''} ${config.isAttribute ? 'is-attribute' : ''}`;
            card.draggable = true;
            card.dataset.idx = idx;

            // --- 1. Top Row: Source Info ---
            const sourceHtml = (config.sources || []).map(s => {
                const color = regionColorMap.get(s.regionId) || '#3b82f6';
                const currentName = regionNameMap.get(s.regionId) || s.regionName;
                const style = `border-color: ${color}44; color: ${color}; background-color: ${color}11;`;
                const labelText = s.displayName || s.fieldName;
                return `<span class="source-tag" style="${style}" title="${currentName}.${s.fieldName}">${currentName}.${labelText}</span>`;
            }).join('');

            const attributeBadge = config.isAttribute ? '<span class="attr-indicator-tag">属性提取</span>' : '';

            // --- 2. Middle Row: Target Name (Floating Label) ---
            // Floating label structure: <div class="floating-input-group"><input ...><label>Target Name</label></div>

            // --- 3. Bottom Row: Rules & Validations (Floating Label Style) ---
            // Generate tags for selected strategies
            const currentStrategies = config.strategies || [];
            const currentValidations = config.validations || [];

            const rulesTagsHtml = currentStrategies.map((ruleId, ruleIdx) => {
                const rule = allRules[ruleId];
                if (!rule) return '';
                return `
                    <div class="rule-tag" data-rule-idx="${ruleIdx}">
                        <span>${rule.name}</span>
                        <i data-lucide="x" class="remove-tag-btn"></i>
                    </div>
                `;
            }).join('');

            // Available rules not yet selected (or allow duplicates? Requirement says "multi rules", usually allows sequencing same rule twice e.g. trim -> trim? 
            // Let's allow selecting any rule from dropdown to append.
            const ruleOptions = Object.values(allRules).map(rule => `
                <option value="${rule.id}">${rule.name}</option>
            `).join('');

            const allValRules = store.getState().validationRules || [];
            const validationTagsHtml = currentValidations.map((valId, valIdx) => {
                const rule = allValRules.find(r => r.id === valId);
                if (!rule) return '';
                return `
                    <div class="rule-tag validation-tag" data-val-idx="${valIdx}">
                        <span>${rule.name}</span>
                        <i data-lucide="x" class="remove-tag-btn"></i>
                    </div>
                `;
            }).join('');

            const isRulesActive = this.activeDropdownType === 'rules' && this.activeDropdownIdx === idx;
            const isValidationsActive = this.activeDropdownType === 'validations' && this.activeDropdownIdx === idx;

            card.innerHTML = `
                <!-- Row 1: Source Header -->
                <div class="card-row-header">
                    <div class="source-info">
                        ${attributeBadge}
                        ${sourceHtml}
                    </div>
                    <div class="card-drag-handle" title="拖拽调整顺序">
                        <i data-lucide="grip-vertical"></i>
                    </div>
                </div>

                <!-- Row 2: Target Name -->
                <div class="card-row-target">
                    <div class="floating-input-group full-width">
                        <input type="text" class="alias-input" placeholder=" " value="${config.alias || config.name}">
                        <label>字段名称</label>
                    </div>
                    <div class="switch-wrapper">
                         <label class="visibility-toggle" title="${config.hidden ? '显示字段' : '隐藏字段'}">
                            <input type="checkbox" ${config.hidden ? '' : 'checked'}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>

                <!-- Row 3: Rules & Validations -->
                 <div class="card-row-rules">
                    <div class="rules-container dropdown-trigger ${isRulesActive ? 'open' : ''}" data-type="rules">
                        <label class="rules-label">清洗规则</label>
                        <div class="rules-content">
                            ${rulesTagsHtml}
                            ${currentStrategies.length === 0 ? '<span class="rules-placeholder-text">请选择规则</span>' : ''}
                        </div>
                        <div class="dropdown-arrow">
                            <i data-lucide="chevron-down"></i>
                        </div>
                        
                        <!-- Custom Multi-select Dropdown -->
                        <div class="rules-dropdown ${isRulesActive ? 'show' : ''}">
                            ${Object.values(allRules).map(rule => `
                                <div class="dropdown-item ${currentStrategies.includes(rule.id) ? 'selected' : ''}" data-rule-id="${rule.id}">
                                    <div class="checkbox-box">
                                        <i data-lucide="check"></i>
                                    </div>
                                    <span class="rule-name">${rule.name}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>

                <div class="card-row-rules no-border">
                    <div class="rules-container dropdown-trigger ${isValidationsActive ? 'open' : ''}" data-type="validations">
                        <label class="rules-label">数据校验</label>
                        <div class="rules-content">
                            ${validationTagsHtml}
                            ${currentValidations.length === 0 ? '<span class="rules-placeholder-text">请选择规则</span>' : ''}
                        </div>
                        <div class="dropdown-arrow">
                            <i data-lucide="chevron-down"></i>
                        </div>
                        
                        <!-- Custom Multi-select Dropdown -->
                        <div class="rules-dropdown ${isValidationsActive ? 'show' : ''}">
                            ${allValRules.map(rule => `
                                <div class="dropdown-item ${currentValidations.includes(rule.id) ? 'selected' : ''}" data-val-id="${rule.id}">
                                    <div class="checkbox-box">
                                        <i data-lucide="check"></i>
                                    </div>
                                    <span class="rule-name">${rule.name}</span>
                                </div>
                            `).join('')}
                            ${allValRules.length === 0 ? '<div class="dropdown-item disabled">暂无校验规则</div>' : ''}
                        </div>
                    </div>
                </div>
            `;

            // --- Event Listeners ---

            // 1. Alias Input
            const aliasInput = card.querySelector('.alias-input');
            aliasInput.oninput = (e) => {
                config.alias = e.target.value;
            };

            // 2. Visibility
            const toggle = card.querySelector('.visibility-toggle input');
            toggle.onchange = (e) => {
                config.hidden = !e.target.checked;
                this.saveConfig();
                this.render();
            };

            // 3. Rule Removal & Dropdown Interaction via Delegation
            card.onclick = (e) => {
                const removeBtn = e.target.closest('.remove-tag-btn');
                if (removeBtn) {
                    e.stopPropagation();
                    const ruleTag = removeBtn.closest('.rule-tag');
                    if (ruleTag.classList.contains('validation-tag')) {
                        const valIdx = parseInt(ruleTag.dataset.valIdx);
                        config.validations.splice(valIdx, 1);
                    } else {
                        const ruleIdx = parseInt(ruleTag.dataset.ruleIdx);
                        config.strategies.splice(ruleIdx, 1);
                    }
                    this.saveConfig();
                    this.render();
                    return;
                }

                const trigger = e.target.closest('.dropdown-trigger');
                if (trigger) {
                    const type = trigger.dataset.type;
                    const dropdown = trigger.querySelector('.rules-dropdown');
                    const isShowing = dropdown.classList.contains('show');

                    // Close others
                    this.container.querySelectorAll('.rules-dropdown').forEach(d => d.classList.remove('show'));
                    this.container.querySelectorAll('.dropdown-trigger').forEach(t => t.classList.remove('open'));

                    if (!isShowing) {
                        dropdown.classList.add('show');
                        trigger.classList.add('open');
                        this.activeDropdownIdx = idx;
                        this.activeDropdownType = type;

                        // Check if dropdown goes off-screen
                        const triggerRect = trigger.getBoundingClientRect();
                        const viewportHeight = window.innerHeight;
                        const spaceBelow = viewportHeight - triggerRect.bottom;
                        const spaceAbove = triggerRect.top;
                        const dropdownHeight = 350; // Expected max height

                        // Switch to dropup if space below is less than dropdown height 
                        // AND there is more space above than below
                        if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
                            dropdown.classList.add('dropup');
                        } else {
                            dropdown.classList.remove('dropup');
                        }
                    } else {
                        this.activeDropdownIdx = null;
                        this.activeDropdownType = null;
                        dropdown.classList.remove('dropup');
                    }
                    e.stopPropagation();
                }
            };

            // 4. Dropdown Item Click (Fix: attach to all dropdowns in the card)
            card.querySelectorAll('.rules-dropdown').forEach(dropdown => {
                dropdown.querySelectorAll('.dropdown-item').forEach(item => {
                    item.onclick = (e) => {
                        e.stopPropagation();
                        const ruleId = item.dataset.ruleId;
                        const valId = item.dataset.valId;

                        if (ruleId) {
                            if (!config.strategies) config.strategies = [];
                            const ruleIndex = config.strategies.indexOf(ruleId);
                            if (ruleIndex > -1) {
                                config.strategies.splice(ruleIndex, 1);
                            } else {
                                config.strategies.push(ruleId);
                            }
                        } else if (valId) {
                            if (!config.validations) config.validations = [];
                            const valIndex = config.validations.indexOf(valId);
                            if (valIndex > -1) {
                                config.validations.splice(valIndex, 1);
                            } else {
                                config.validations.push(valId);
                            }
                        }
                        this.saveConfig();
                        this.render();
                    };
                });
            });

            // Close dropdowns on document click
            if (!document._fieldPanelPopupBound) {
                document.addEventListener('click', () => {
                    const allDropdowns = document.querySelectorAll('.rules-dropdown');
                    const allTriggers = document.querySelectorAll('.dropdown-trigger');
                    allDropdowns.forEach(d => d.classList.remove('show'));
                    allTriggers.forEach(t => t.classList.remove('open'));
                    this.activeDropdownIdx = null;
                    this.activeDropdownType = null; // Clear state
                }, { once: false });
                document._fieldPanelPopupBound = true;
            }

            // 5. Drag & Drop (Field Order)
            const handle = card.querySelector('.card-drag-handle');
            handle.onmousedown = () => { card.draggable = true; };
            handle.onmouseup = () => { card.draggable = false; };
            card.draggable = false;

            card.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', idx);
                card.classList.add('dragging');
            });

            card.addEventListener('dragend', () => {
                card.classList.remove('dragging');
            });

            card.addEventListener('dragover', (e) => {
                e.preventDefault();
                card.classList.add('drag-over');
            });

            card.addEventListener('dragleave', () => {
                card.classList.remove('drag-over');
            });

            card.addEventListener('drop', (e) => {
                e.preventDefault();
                card.classList.remove('drag-over');
                const fromIdx = parseInt(e.dataTransfer.getData('text/plain'));
                const toIdx = idx;
                if (fromIdx !== toIdx) {
                    this.reorderFields(fromIdx, toIdx);
                }
            });

            this.container.appendChild(card);
        });

        if (window.lucide) window.lucide.createIcons();
    }

    saveConfig() {
        const state = store.getState();
        store.setState({ fieldConfigs: state.fieldConfigs });
    }

    reorderFields(from, to) {
        const state = store.getState();
        const fieldConfigs = [...(state.fieldConfigs || [])];
        const item = fieldConfigs.splice(from, 1)[0];
        fieldConfigs.splice(to, 0, item);

        store.setState({ fieldConfigs });
        this.render();
    }
}

export const fieldPanel = new FieldPanel();
