// ═══════════════════════════════════════════════════════════════
//  Finanzas Personales — Aplicación Frontend
// ═══════════════════════════════════════════════════════════════

const API = '/api';

// ── Estado ──────────────────────────────────────────────────────
let currentFilters = {
    type: '',
    priority: '',
    dateFrom: '',
    dateTo: '',
    sortBy: 'date',
    sortOrder: 'DESC',
};

let activeMonth = null; // mes activo en el archivo mensual
let archiveOpen = true; // estado colapsado/expandido

// ── DOM Elements ────────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const dom = {
    // Dashboard
    totalIngresos: $('#total-ingresos'),
    totalEgresos: $('#total-egresos'),
    totalAhorros: $('#total-ahorros'),
    totalBalance: $('#total-balance'),

    // Table
    tableBody: $('#transactions-table-body'),
    emptyState: $('#empty-state'),
    txCount: $('#transaction-count'),

    // Filters
    filterType: $('#filter-type'),
    filterPriority: $('#filter-priority'),
    filterDateFrom: $('#filter-date-from'),
    filterDateTo: $('#filter-date-to'),
    sortBy: $('#sort-by'),
    sortOrder: $('#sort-order'),
    btnClearFilters: $('#btn-clear-filters'),

    // Modal
    modalOverlay: $('#modal-overlay'),
    modalContent: $('#modal-content'),
    btnNewTx: $('#btn-new-transaction'),
    btnCloseModal: $('#btn-close-modal'),
    backdropClick: $('#modal-backdrop-click'),
    txForm: $('#transaction-form'),
    btnSubmit: $('#btn-submit-transaction'),
    fileInput: $('#tx-invoice'),
    fileNameDisplay: $('#file-name-display'),

    // Detail Modal
    detailOverlay: $('#detail-modal-overlay'),
    detailContent: $('#detail-content'),
    btnCloseDetail: $('#btn-close-detail-modal'),
    detailBackdrop: $('#detail-backdrop-click'),

    // Toast
    toastContainer: $('#toast-container'),

    // Monthly Archive
    archiveToggle: $('#archive-toggle'),
    archiveToggleIcon: $('#archive-toggle-icon'),
    archiveBody: $('#archive-body'),
    archiveGrid: $('#archive-grid'),
    archiveEmpty: $('#archive-empty'),
    archiveCount: $('#archive-count'),
    archiveActiveLabel: $('#archive-active-label'),
};

// ── Utilidades ──────────────────────────────────────────────────
function formatMoney(amount) {
    return parseFloat(amount).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

function formatDate(dateStr) {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('es-ES', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
}

function priorityLabel(priority) {
    const labels = {
        indispensable: 'Indispensable',
        importante: 'Importante',
        no_prioritario: 'No prioritario',
    };
    return labels[priority] || priority;
}

function typeLabel(type) {
    const labels = { ingreso: 'Ingreso', egreso: 'Egreso', ahorro: 'Ahorro' };
    return labels[type] || type;
}

function typeIcon(type) {
    const icons = {
        ingreso: '↑',
        egreso: '↓',
        ahorro: '◆',
    };
    return icons[type] || '•';
}

// Convierte '2026-07' → 'Julio 2026'
function formatMonthLabel(monthStr) {
    const [year, month] = monthStr.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1, 1);
    return date.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
               .replace(/^(\w)/, c => c.toUpperCase());
}

// ── Toast Notifications ─────────────────────────────────────────
function showToast(message, type = 'success') {
    const colors = {
        success: 'from-emerald-500/20 to-emerald-500/5 border-emerald-500/30 text-emerald-300',
        error: 'from-red-500/20 to-red-500/5 border-red-500/30 text-red-300',
        info: 'from-blue-500/20 to-blue-500/5 border-blue-500/30 text-blue-300',
    };

    const icons = {
        success: `<svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>`,
        error: `<svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`,
        info: `<svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`,
    };

    const toast = document.createElement('div');
    toast.className = `flex items-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r ${colors[type]} border text-sm font-medium shadow-lg toast-enter`;
    toast.innerHTML = `${icons[type]}<span>${message}</span>`;
    dom.toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.classList.remove('toast-enter');
        toast.classList.add('toast-exit');
        toast.addEventListener('animationend', () => toast.remove());
    }, 3500);
}

// ── API Calls ───────────────────────────────────────────────────
async function fetchSummary() {
    try {
        const res = await fetch(`${API}/summary`);
        const json = await res.json();
        if (json.success) {
            const d = json.data;
            dom.totalIngresos.innerHTML = `${formatMoney(d.ingresos)} <span class="text-sm font-medium text-gray-500">USDT</span>`;
            dom.totalEgresos.innerHTML = `${formatMoney(d.egresos)} <span class="text-sm font-medium text-gray-500">USDT</span>`;
            dom.totalAhorros.innerHTML = `${formatMoney(d.ahorros)} <span class="text-sm font-medium text-gray-500">USDT</span>`;

            const balanceColor = d.balance >= 0 ? 'text-accent-400' : 'text-expense';
            dom.totalBalance.className = `text-2xl font-bold ${balanceColor} tabular-nums`;
            dom.totalBalance.innerHTML = `${d.balance < 0 ? '-' : ''}${formatMoney(Math.abs(d.balance))} <span class="text-sm font-medium text-gray-500">USDT</span>`;

            // Mostrar nombre del mes en la card de Balance
            if (d.month) {
                const monthLabel = $('#dashboard-month-label');
                if (monthLabel) monthLabel.textContent = formatMonthLabel(d.month);
            }
        }
    } catch (err) {
        console.error('Error fetching summary:', err);
    }
}

async function fetchTransactions() {
    try {
        const params = new URLSearchParams();
        if (currentFilters.type) params.set('type', currentFilters.type);
        if (currentFilters.priority) params.set('priority', currentFilters.priority);
        if (currentFilters.dateFrom) params.set('dateFrom', currentFilters.dateFrom);
        if (currentFilters.dateTo) params.set('dateTo', currentFilters.dateTo);
        params.set('sortBy', currentFilters.sortBy);
        params.set('sortOrder', currentFilters.sortOrder);

        const res = await fetch(`${API}/transactions?${params.toString()}`);
        const json = await res.json();

        if (json.success) {
            renderTransactions(json.data);
        }
    } catch (err) {
        console.error('Error fetching transactions:', err);
        showToast('Error al cargar transacciones', 'error');
    }
}

async function createTransaction(formData) {
    const res = await fetch(`${API}/transactions`, {
        method: 'POST',
        body: formData,
    });
    return await res.json();
}

async function deleteTransaction(id) {
    const res = await fetch(`${API}/transactions/${id}`, { method: 'DELETE' });
    return await res.json();
}

async function fetchTransactionDetail(id) {
    const res = await fetch(`${API}/transactions/${id}`);
    return await res.json();
}

// ── Render ──────────────────────────────────────────────────────
function renderTransactions(transactions) {
    dom.tableBody.innerHTML = '';

    if (transactions.length === 0) {
        dom.emptyState.classList.remove('hidden');
        dom.txCount.textContent = '0 registros';
        return;
    }

    dom.emptyState.classList.add('hidden');
    dom.txCount.textContent = `${transactions.length} registro${transactions.length !== 1 ? 's' : ''}`;

    transactions.forEach((tx) => {
        const row = document.createElement('tr');
        row.className = 'group';

        const amountPrefix = tx.type === 'ingreso' ? '+' : tx.type === 'egreso' ? '-' : '';
        const amountColor = tx.type === 'ingreso' ? 'text-income' : tx.type === 'egreso' ? 'text-expense' : 'text-savings';

        row.innerHTML = `
            <td class="px-5 py-3.5">
                <div class="flex items-center gap-2">
                    <span class="type-badge type-${tx.type}">${typeIcon(tx.type)}</span>
                    <span class="text-sm text-gray-300">${formatDate(tx.date)}</span>
                </div>
            </td>
            <td class="px-5 py-3.5">
                <p class="text-sm font-medium text-gray-200 truncate max-w-xs">${escapeHtml(tx.description)}</p>
            </td>
            <td class="px-5 py-3.5">
                <span class="badge badge-${tx.priority}">${priorityLabel(tx.priority)}</span>
            </td>
            <td class="px-5 py-3.5 text-right">
                <span class="text-sm font-semibold ${amountColor} tabular-nums">${amountPrefix}${formatMoney(tx.amount)}</span>
            </td>
            <td class="px-5 py-3.5">
                <div class="flex items-center justify-center gap-1">
                    <button onclick="showDetail(${tx.id})" title="Ver detalles"
                        class="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:text-accent-400 hover:bg-white/5 transition-all">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                        </svg>
                    </button>
                    <button onclick="confirmDelete(${tx.id})" title="Eliminar"
                        class="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:text-expense hover:bg-expense/5 transition-all opacity-0 group-hover:opacity-100">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                        </svg>
                    </button>
                </div>
            </td>
        `;

        dom.tableBody.appendChild(row);
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ── Modal Management ────────────────────────────────────────────
function openModal() {
    dom.modalOverlay.classList.remove('hidden');
    dom.modalContent.classList.remove('modal-exit');
    dom.modalContent.classList.add('modal-enter');
    document.body.style.overflow = 'hidden';

    // Set default date to today
    const today = new Date().toISOString().split('T')[0];
    $('#tx-date').value = today;
}

function closeModal() {
    dom.modalContent.classList.remove('modal-enter');
    dom.modalContent.classList.add('modal-exit');
    setTimeout(() => {
        dom.modalOverlay.classList.add('hidden');
        dom.txForm.reset();
        dom.fileNameDisplay.textContent = 'Seleccionar imagen o PDF...';
        document.body.style.overflow = '';
    }, 200);
}

function openDetailModal() {
    dom.detailOverlay.classList.remove('hidden');
    $('#detail-modal-content').classList.remove('modal-exit');
    $('#detail-modal-content').classList.add('modal-enter');
    document.body.style.overflow = 'hidden';
}

function closeDetailModal() {
    $('#detail-modal-content').classList.remove('modal-enter');
    $('#detail-modal-content').classList.add('modal-exit');
    setTimeout(() => {
        dom.detailOverlay.classList.add('hidden');
        document.body.style.overflow = '';
    }, 200);
}

// ── Detail View ─────────────────────────────────────────────────
async function showDetail(id) {
    try {
        const json = await fetchTransactionDetail(id);
        if (!json.success) {
            showToast('Error al cargar detalle', 'error');
            return;
        }

        const tx = json.data;
        const amountColor = tx.type === 'ingreso' ? 'text-income' : tx.type === 'egreso' ? 'text-expense' : 'text-savings';
        const amountPrefix = tx.type === 'ingreso' ? '+' : tx.type === 'egreso' ? '-' : '';

        let invoiceHtml = '';
        if (tx.invoice_path) {
            if (tx.invoice_path.toLowerCase().endsWith('.pdf')) {
                invoiceHtml = `
                    <div>
                        <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Factura (PDF)</p>
                        <a href="${tx.invoice_path}" target="_blank" class="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-accent-500/10 text-accent-400 text-sm font-medium hover:bg-accent-500/20 transition-colors">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                            Ver PDF
                        </a>
                    </div>
                `;
            } else {
                invoiceHtml = `
                    <div>
                        <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Factura</p>
                        <img src="${tx.invoice_path}" alt="Factura" class="detail-invoice-img w-full">
                    </div>
                `;
            }
        }

        dom.detailContent.innerHTML = `
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Tipo</p>
                    <span class="type-badge type-${tx.type} text-sm">${typeIcon(tx.type)} ${typeLabel(tx.type)}</span>
                </div>
                <div>
                    <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Fecha</p>
                    <p class="text-sm text-gray-200">${formatDate(tx.date)}</p>
                </div>
                <div>
                    <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Prioridad</p>
                    <span class="badge badge-${tx.priority}">${priorityLabel(tx.priority)}</span>
                </div>
                <div>
                    <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Monto</p>
                    <p class="text-lg font-bold ${amountColor} tabular-nums">${amountPrefix}${formatMoney(tx.amount)} <span class="text-sm font-medium text-gray-500">USDT</span></p>
                </div>
            </div>
            <div>
                <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Descripción</p>
                <p class="text-sm text-gray-200">${escapeHtml(tx.description)}</p>
            </div>
            ${tx.note ? `
                <div>
                    <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Nota</p>
                    <p class="text-sm text-gray-300 bg-white/[0.03] rounded-xl p-3 border border-white/5">${escapeHtml(tx.note)}</p>
                </div>
            ` : ''}
            ${invoiceHtml}
        `;

        openDetailModal();
    } catch (err) {
        console.error('Error showing detail:', err);
        showToast('Error al cargar detalle', 'error');
    }
}

// ── Delete ──────────────────────────────────────────────────────
async function confirmDelete(id) {
    if (!confirm('¿Estás seguro de que deseas eliminar esta transacción? Esta acción no se puede deshacer.')) {
        return;
    }

    try {
        const json = await deleteTransaction(id);
        if (json.success) {
            showToast('Transacción eliminada correctamente');
            refreshData();
        } else {
            showToast(json.error || 'Error al eliminar', 'error');
        }
    } catch (err) {
        console.error('Error deleting:', err);
        showToast('Error al eliminar transacción', 'error');
    }
}

// ── Monthly Archive ─────────────────────────────────────────────
async function fetchMonthlySummary() {
    try {
        const res = await fetch(`${API}/monthly-summary`);
        const json = await res.json();
        if (json.success) {
            renderMonthlyArchive(json.data);
        }
    } catch (err) {
        console.error('Error fetching monthly summary:', err);
    }
}

function renderMonthlyArchive(months) {
    dom.archiveGrid.innerHTML = '';

    const count = months.length;
    dom.archiveCount.textContent = `${count} ${count === 1 ? 'mes' : 'meses'}`;

    if (count === 0) {
        dom.archiveEmpty.classList.remove('hidden');
        dom.archiveGrid.classList.add('hidden');
        return;
    }

    dom.archiveEmpty.classList.add('hidden');
    dom.archiveGrid.classList.remove('hidden');

    months.forEach(m => {
        const isGreen = m.balance > 0;
        const isRed   = m.balance < 0;
        const colorClass = isGreen ? 'green' : isRed ? 'red' : 'neutral';
        const pillClass   = isGreen ? 'positive' : isRed ? 'negative' : 'zero';
        const pillIcon    = isGreen ? '▲' : isRed ? '▼' : '●';
        const isActive    = activeMonth === m.month;

        const card = document.createElement('div');
        card.className = `month-card rounded-xl bg-surface-850 border p-4 ${colorClass} ${isActive ? 'active' : ''}`;
        card.style.background = 'rgba(255,255,255,0.02)';
        card.dataset.month = m.month;

        card.innerHTML = `
            <div class="flex items-start justify-between mb-3">
                <div>
                    <p class="text-sm font-semibold text-gray-200">${formatMonthLabel(m.month)}</p>
                    <p class="text-xs text-gray-500 mt-0.5">${m.total_transactions} transacción${m.total_transactions !== 1 ? 'es' : ''}</p>
                </div>
                <span class="balance-pill ${pillClass}">${pillIcon} ${formatMoney(Math.abs(m.balance))}</span>
            </div>
            <div class="grid grid-cols-3 gap-2 text-center">
                <div>
                    <p class="text-xs text-gray-600 mb-0.5">Ingresos</p>
                    <p class="text-xs font-semibold text-income tabular-nums">${formatMoney(m.ingresos)}</p>
                </div>
                <div>
                    <p class="text-xs text-gray-600 mb-0.5">Egresos</p>
                    <p class="text-xs font-semibold text-expense tabular-nums">${formatMoney(m.egresos)}</p>
                </div>
                <div>
                    <p class="text-xs text-gray-600 mb-0.5">Ahorros</p>
                    <p class="text-xs font-semibold text-savings tabular-nums">${formatMoney(m.ahorros)}</p>
                </div>
            </div>
            ${isActive ? '<div class="mt-2.5 pt-2.5 border-t border-white/5 text-center"><p class="text-xs text-accent-400">Mostrando transacciones de este mes</p></div>' : ''}
        `;

        card.addEventListener('click', () => filterByMonth(m.month));
        dom.archiveGrid.appendChild(card);
    });
}

function filterByMonth(month) {
    if (activeMonth === month) {
        // Desactivar filtro de mes
        activeMonth = null;
        currentFilters.dateFrom = '';
        currentFilters.dateTo = '';
        dom.filterDateFrom.value = '';
        dom.filterDateTo.value = '';
        dom.archiveActiveLabel.classList.add('hidden');
    } else {
        // Activar filtro por este mes
        activeMonth = month;
        const [year, mon] = month.split('-');
        const firstDay = `${year}-${mon}-01`;
        const lastDay  = new Date(parseInt(year), parseInt(mon), 0)
                            .toISOString().split('T')[0];
        currentFilters.dateFrom = firstDay;
        currentFilters.dateTo   = lastDay;
        dom.filterDateFrom.value = firstDay;
        dom.filterDateTo.value   = lastDay;
        dom.archiveActiveLabel.classList.remove('hidden');
    }
    fetchTransactions();
    fetchMonthlySummary(); // re-render para actualizar el estado activo
}

// ── Refresh ─────────────────────────────────────────────────────
function refreshData() {
    fetchSummary();
    fetchTransactions();
    fetchMonthlySummary();
}

// ── Event Listeners ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // Initial load
    refreshData();

    // Archive toggle (colapsar/expandir)
    dom.archiveToggle.addEventListener('click', () => {
        archiveOpen = !archiveOpen;
        if (archiveOpen) {
            dom.archiveBody.style.display = '';
            dom.archiveToggleIcon.classList.add('rotated');
        } else {
            dom.archiveBody.style.display = 'none';
            dom.archiveToggleIcon.classList.remove('rotated');
        }
    });

    // New transaction button
    dom.btnNewTx.addEventListener('click', openModal);

    // Close modal
    dom.btnCloseModal.addEventListener('click', closeModal);
    dom.backdropClick.addEventListener('click', closeModal);

    // Close detail modal
    dom.btnCloseDetail.addEventListener('click', closeDetailModal);
    dom.detailBackdrop.addEventListener('click', closeDetailModal);

    // Escape key closes modals
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (!dom.modalOverlay.classList.contains('hidden')) closeModal();
            if (!dom.detailOverlay.classList.contains('hidden')) closeDetailModal();
        }
    });

    // File input display
    dom.fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const maxSize = 10 * 1024 * 1024;
            if (file.size > maxSize) {
                showToast('El archivo es demasiado grande. Máximo 10 MB.', 'error');
                e.target.value = '';
                dom.fileNameDisplay.textContent = 'Seleccionar imagen o PDF...';
                return;
            }
            dom.fileNameDisplay.textContent = file.name;
        } else {
            dom.fileNameDisplay.textContent = 'Seleccionar imagen o PDF...';
        }
    });

    // Form submit
    dom.txForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const formData = new FormData(dom.txForm);
        const btn = dom.btnSubmit;

        btn.disabled = true;
        btn.innerHTML = '<span class="flex items-center justify-center gap-2"><span class="spinner"></span> Guardando...</span>';

        try {
            const json = await createTransaction(formData);
            if (json.success) {
                showToast('Transacción guardada correctamente', 'success');
                closeModal();
                refreshData();
            } else {
                showToast(json.error || 'Error al guardar', 'error');
            }
        } catch (err) {
            console.error('Error creating transaction:', err);
            showToast('Error de conexión al servidor', 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Guardar Transacción';
        }
    });

    // Filters
    const filterInputs = [dom.filterType, dom.filterPriority, dom.filterDateFrom, dom.filterDateTo, dom.sortBy, dom.sortOrder];
    filterInputs.forEach((input) => {
        input.addEventListener('change', () => {
            currentFilters.type = dom.filterType.value;
            currentFilters.priority = dom.filterPriority.value;
            currentFilters.dateFrom = dom.filterDateFrom.value;
            currentFilters.dateTo = dom.filterDateTo.value;
            currentFilters.sortBy = dom.sortBy.value;
            currentFilters.sortOrder = dom.sortOrder.value;
            fetchTransactions();
        });
    });

    // Clear filters
    dom.btnClearFilters.addEventListener('click', () => {
        dom.filterType.value = '';
        dom.filterPriority.value = '';
        dom.filterDateFrom.value = '';
        dom.filterDateTo.value = '';
        dom.sortBy.value = 'date';
        dom.sortOrder.value = 'DESC';
        currentFilters = {
            type: '',
            priority: '',
            dateFrom: '',
            dateTo: '',
            sortBy: 'date',
            sortOrder: 'DESC',
        };
        fetchTransactions();
    });
});

// Expose functions to global scope for inline onclick handlers
window.showDetail = showDetail;
window.confirmDelete = confirmDelete;
window.filterByMonth = filterByMonth;
