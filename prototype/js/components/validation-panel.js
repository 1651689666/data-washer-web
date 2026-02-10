import { store } from '../core/store.js';
import { validationRegistry } from '../core/validation-registry.js';

class ValidationPanel {
    constructor() {
        this.container = null;
        this.modal = null;
        this.editingRuleId = null;
        this.currentMode = 'config'; // 'config' or 'script'
        this.tokens = []; // To store expression builder tokens
        this.state = {
            isOpen: false
        };
    }

    init() {
        this.container = document.getElementById('validation-panel-container');
        this.modal = document.getElementById('validation-editor-modal');
        if (!this.container) return;

        this.render();
        this.bindEvents();

        store.subscribe(() => {
            this.render();
        });
    }

    render() {
        const rules = store.getState().validationRules || [];

        this.container.innerHTML = `
            <div class="config-item ${this.state.isOpen ? 'open' : ''}">
                <div class="config-item-header">
                    <i data-lucide="shield-check"></i>
                    <span>校验规则库</span>
                    <button class="btn-icon-sm" id="add-validation-btn" title="添加校验规则" style="margin-left: auto;">
                        <i data-lucide="plus"></i>
                    </button>
                    <i data-lucide="chevron-down" class="chevron"></i>
                </div>
                <div class="config-item-body">
                    <div class="rule-list">
                        ${rules.length === 0 ? '<p class="hint">暂无自定义校验规则</p>' : ''}
                        ${rules.map(rule => `
                            <div class="rule-item" data-id="${rule.id}">
                                <div class="rule-info">
                                    <span class="rule-name">${rule.name}</span>
                                    <small class="rule-type">${rule.type === 'script' ? '脚本模式' : '表达式模式'}</small>
                                </div>
                                <div class="rule-actions">
                                    <button class="btn-icon-sm edit-validation" title="编辑"><i data-lucide="pencil"></i></button>
                                    <button class="btn-icon-sm delete-validation" title="删除"><i data-lucide="trash-2"></i></button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;

        if (window.lucide) window.lucide.createIcons();
    }

    bindEvents() {
        this.container.addEventListener('click', (e) => {
            const addBtn = e.target.closest('#add-validation-btn');
            if (addBtn) {
                this.openModal();
                return;
            }

            const editBtn = e.target.closest('.edit-validation');
            if (editBtn) {
                const id = editBtn.closest('.rule-item').dataset.id;
                this.openModal(id);
                return;
            }

            const deleteBtn = e.target.closest('.delete-validation');
            if (deleteBtn) {
                const id = deleteBtn.closest('.rule-item').dataset.id;
                this.deleteRule(id);
                return;
            }

            const header = e.target.closest('.config-item-header');
            if (header) {
                this.state.isOpen = !this.state.isOpen;
                this.render();
            }
        });

        document.getElementById('validation-modal-close').onclick = () => this.closeModal();
        document.getElementById('validation-modal-cancel').onclick = () => this.closeModal();
        document.getElementById('validation-modal-save').onclick = () => this.saveRule();

        const saveBtn = document.getElementById('validation-modal-save');
        if (saveBtn) saveBtn.textContent = '保存规则';

        // Mode Switcher
        const modeBtns = document.getElementById('validation-mode-switcher').querySelectorAll('.mode-btn');
        modeBtns.forEach(btn => {
            btn.onclick = () => {
                this.currentMode = btn.dataset.mode;
                modeBtns.forEach(b => b.classList.toggle('active', b === btn));
                document.getElementById('validation-config-ui').style.display = (this.currentMode === 'config' ? 'block' : 'none');
                document.getElementById('validation-script-ui').style.display = (this.currentMode === 'script' ? 'block' : 'none');
            };
        });

        // Expression Builder Events
        document.getElementById('builder-symbols').onclick = (e) => {
            const btn = e.target.closest('.symbol-btn');
            if (btn) this.addToken('op', btn.textContent);
        };
        document.getElementById('builder-logic').onclick = (e) => {
            const btn = e.target.closest('.symbol-btn');
            if (btn) this.addToken('logic', btn.textContent);
        };
        document.getElementById('insert-current-value').onclick = () => {
            this.addToken('current', '当前项 (Value)');
        };
        document.getElementById('insert-constant').onclick = () => {
            const val = prompt('请输入常量值 (数值或文本):');
            if (val !== null && val.trim() !== '') {
                this.addToken('constant', val.trim());
            }
        };
        document.getElementById('expression-clear').onclick = () => {
            this.tokens = [];
            this.renderTokens();
        };
        document.getElementById('expression-display').onclick = (e) => {
            const removeBtn = e.target.closest('.token-remove-btn');
            if (removeBtn) {
                const tokenEl = removeBtn.closest('.token');
                const index = parseInt(tokenEl.dataset.index);
                this.tokens.splice(index, 1);
                this.renderTokens();
            }
        };

        const searchInput = document.getElementById('field-search-input');
        if (searchInput) {
            searchInput.oninput = (e) => {
                this.renderFields(e.target.value);
            };
        }
    }

    openModal(ruleId = null) {
        this.editingRuleId = ruleId;
        const nameInput = document.getElementById('validation-name-input');
        const codeInput = document.getElementById('validation-code-input');
        const searchInput = document.getElementById('field-search-input');

        if (searchInput) searchInput.value = '';

        this.renderFields();

        if (ruleId) {
            const rule = store.getState().validationRules.find(r => r.id === ruleId);
            nameInput.value = rule.name;
            this.currentMode = rule.type;
            this.tokens = rule.tokens || [];

            if (rule.type === 'script') {
                codeInput.value = rule.code;
            }
            this.renderTokens();
            this.modal.querySelector('h3').textContent = '编辑校验规则';
        } else {
            nameInput.value = '';
            codeInput.value = 'return true;';
            this.currentMode = 'config';
            this.tokens = [];
            this.renderTokens();
            this.modal.querySelector('h3').textContent = '新增校验规则';
        }

        // Update UI state
        const modeBtns = document.getElementById('validation-mode-switcher').querySelectorAll('.mode-btn');
        modeBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.mode === this.currentMode));
        document.getElementById('validation-config-ui').style.display = (this.currentMode === 'config' ? 'block' : 'none');
        document.getElementById('validation-script-ui').style.display = (this.currentMode === 'script' ? 'block' : 'none');

        this.modal.style.display = 'flex';
    }

    closeModal() {
        this.modal.style.display = 'none';
        this.editingRuleId = null;
    }

    saveRule() {
        const name = document.getElementById('validation-name-input').value.trim();
        if (!name) {
            alert('请输入规则名称');
            return;
        }

        let ruleData = {
            id: this.editingRuleId || 'v_' + Date.now(),
            name: name,
            type: this.currentMode
        };

        if (this.currentMode === 'script') {
            ruleData.code = document.getElementById('validation-code-input').value.trim();
        } else {
            ruleData.tokens = this.tokens;
            ruleData.code = this.generateJSFromTokens();
        }

        const rules = [...(store.getState().validationRules || [])];
        if (this.editingRuleId) {
            const idx = rules.findIndex(r => r.id === this.editingRuleId);
            rules[idx] = ruleData;
        } else {
            rules.push(ruleData);
        }

        store.setValidationRules(rules);
        this.closeModal();
    }

    deleteRule(id) {
        if (!confirm('确定删除该校验规则吗？')) return;
        const rules = store.getState().validationRules.filter(r => r.id !== id);
        store.setValidationRules(rules);
    }

    addToken(type, name, value = null) {
        this.tokens.push({ type, name, value });
        this.renderTokens();
    }

    renderFields(filter = '') {
        const fieldConfigs = store.getState().fieldConfigs || [];
        const fieldList = document.getElementById('validation-fields-list');
        if (!fieldList) return;

        const filtered = fieldConfigs.filter(c => {
            const name = (c.alias || c.name).toLowerCase();
            return name.includes(filter.toLowerCase());
        });

        fieldList.innerHTML = filtered.map(c => `
            <button class="field-btn" data-id="${c.physAlias || c.id}" data-name="${c.alias || c.name}">
                <i data-lucide="columns"></i>
                <span>${c.alias || c.name}</span>
            </button>
        `).join('') || `<p class="hint" style="text-align:center; padding: 20px;">暂无字段</p>`;

        fieldList.querySelectorAll('.field-btn').forEach(btn => {
            btn.onclick = () => {
                this.addToken('field', btn.dataset.name, btn.dataset.id);
            };
        });

        if (window.lucide) window.lucide.createIcons();
    }

    renderTokens() {
        const display = document.getElementById('expression-display');
        if (this.tokens.length === 0) {
            display.innerHTML = '<p class="hint" style="margin: auto; color: #94a3b8;">请通过下方按钮选择字段和运算符构建校验表达式</p>';
            return;
        }

        display.innerHTML = this.tokens.map((t, i) => `
            <div class="token token-${t.type}" data-index="${i}">
                <span>${t.name}</span>
                <div class="token-remove-btn" title="点击删除">
                    <i data-lucide="x"></i>
                </div>
            </div>
        `).join('');

        if (window.lucide) window.lucide.createIcons();
    }

    generateJSFromTokens() {
        if (this.tokens.length === 0) return 'return true;';

        const codePart = this.tokens.map(t => {
            switch (t.type) {
                case 'field':
                    return `_p(row['${t.value}'])`;
                case 'current':
                    return `_p(value)`;
                case 'constant':
                    // Check if it's a number, otherwise wrap in quotes
                    return isNaN(t.name.replace(/,/g, '')) ? `'${t.name}'` : t.name.replace(/,/g, '');
                case 'logic':
                    if (t.name === '=') return '===';
                    if (t.name === '!=') return '!==';
                    return t.name;
                default:
                    return t.name;
            }
        }).join(' ');

        return `
            const _p = (v) => {
                if (typeof v === 'number') return v;
                if (!v) return 0;
                const clean = String(v).replace(/[^0-9.-]/g, '');
                return parseFloat(clean) || 0;
            };
            return (${codePart});
        `;
    }
}

export const validationPanel = new ValidationPanel();
