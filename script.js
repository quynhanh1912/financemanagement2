// ---------------- PIN AUTHENTICATION ----------------
const APP_PIN = "1912";
let currentPin = "";
let isAuth = sessionStorage.getItem('finance_auth') === 'true';

window.addEventListener('DOMContentLoaded', () => {
    if (isAuth) {
        document.getElementById('pinOverlay').classList.add('hidden');
        document.getElementById('appContainer').classList.remove('hidden');
    }
});

function enterPin(num) {
    if (currentPin.length < 4) {
        currentPin += num;
        updatePinDots();
        document.getElementById('pinError').classList.add('hidden');
        
        if (currentPin.length === 4) {
            setTimeout(checkPin, 100);
        }
    }
}

function clearPin() {
    currentPin = "";
    updatePinDots();
    document.getElementById('pinError').classList.add('hidden');
}

function deletePin() {
    if (currentPin.length > 0) {
        currentPin = currentPin.slice(0, -1);
        updatePinDots();
    }
}

function updatePinDots() {
    const dots = document.querySelectorAll('.pin-dot');
    dots.forEach((dot, index) => {
        if (index < currentPin.length) {
            dot.classList.add('filled');
        } else {
            dot.classList.remove('filled');
        }
    });
}

function checkPin() {
    if (currentPin === APP_PIN) {
        sessionStorage.setItem('finance_auth', 'true');
        isAuth = true;
        document.getElementById('pinOverlay').style.opacity = '0';
        setTimeout(() => {
            document.getElementById('pinOverlay').classList.add('hidden');
            document.getElementById('appContainer').classList.remove('hidden');
            document.getElementById('pinOverlay').style.opacity = '1'; // reset
        }, 300);
    } else {
        document.getElementById('pinError').classList.remove('hidden');
        clearPin();
    }
}

// ---------------- CATEGORIES ----------------
const categories = {
    quan: [
        "Nguyên vật liệu quán",
        "Chi phí chung (nước rửa chén, chất tổng hợp...)",
        "Lương ứng trước",
        "Thưởng nóng nhân viên"
    ],
    giadinh: [
        "Chi phí ăn uống",
        "Chi tiêu cá nhân",
        "Chi tiêu cho anh Hiền",
        "Chi tiêu cho mẹ",
        "Bông Bảo",
        "Trả góp ngân hàng"
    ],
    congty: [
        "Chi phí chuyển phát",
        "Chi phí vận chuyển",
        "Chi phí sub",
        "Chi phí nhân sự"
    ]
};

// State
let transactions = [];
let scheduledBills = [];
let iceLogs = [];      // { id, date, qty }
let icePayments = [];  // { id, date, qty, amount }

const INITIAL_CAPITAL = 2777000;
const STAFF_SALARY_PER_DAY = 300000;
const TRASH_FEE = 160000; // Per month

// Chart Instances
let cafeChartInstance = null;
let foodChartInstance = null;
let personalChartInstance = null;

// DOM Elements
const totalBalanceEl = document.getElementById('totalBalance');
const totalIncomeEl = document.getElementById('totalIncome');
const totalExpenseEl = document.getElementById('totalExpense');
const transactionListEl = document.getElementById('transactionList');

const expenseForm = document.getElementById('expenseForm');
const incomeForm = document.getElementById('incomeForm');
const expenseCategory = document.getElementById('expenseCategory');
const subCategoryGroup = document.getElementById('subCategoryGroup');

const billsAlert = document.getElementById('billsAlert');
const billsMessage = document.getElementById('billsMessage');
const billForm = document.getElementById('billForm');
const billList = document.getElementById('billList');

// Initialize
async function init() {
    updateDateInputs();
    setInterval(updateDateInputs, 60000);

    attachMoneyFormat('expenseAmount');
    attachMoneyFormat('incomeAmount');
    attachMoneyFormat('billAmount');
    attachMoneyFormat('icePayAmount');

    // Set today for ice date input
    const todayStr = new Date().toISOString().split('T')[0];
    const iceDateEl = document.getElementById('iceDate');
    if (iceDateEl) iceDateEl.value = todayStr;

    setupTabs();
    setupFormEvents();
    setupIceEvents();
    setupCloudModal();
    
    // LOCAL-FIRST: Load from localStorage instantly (no waiting)
    loadFromLocal();
    updateUI();
    renderIceUI();
    
    // Then sync from cloud in background (non-blocking)
    syncFromCloud();
}

// ---------------- LOCAL STORAGE ----------------
const LOCAL_KEY = 'finance_app_data';

function saveToLocal() {
    const data = {
        transactions: transactions,
        scheduledBills: scheduledBills,
        iceLogs: iceLogs,
        icePayments: icePayments
    };
    localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
}

function loadFromLocal() {
    try {
        const raw = localStorage.getItem(LOCAL_KEY);
        if (!raw) return;
        const data = JSON.parse(raw);
        if (data.transactions && Array.isArray(data.transactions)) transactions = data.transactions;
        if (data.scheduledBills && Array.isArray(data.scheduledBills)) scheduledBills = data.scheduledBills;
        if (data.iceLogs && Array.isArray(data.iceLogs)) iceLogs = data.iceLogs;
        if (data.icePayments && Array.isArray(data.icePayments)) icePayments = data.icePayments;
    } catch (e) {
        console.warn('Lỗi đọc localStorage:', e);
    }
}

// ---------------- CLOUD SYNC LOGIC ----------------
function showGlobalLoader(text) {
    const el = document.getElementById('globalLoader');
    if(el) {
        document.getElementById('loadingText').textContent = text || 'Đang xử lý...';
        el.classList.remove('hidden');
        el.style.display = 'flex';
    }
}

function hideGlobalLoader() {
    const el = document.getElementById('globalLoader');
    if(el) {
        el.classList.add('hidden');
        el.style.display = 'none';
    }
}

function setupCloudModal() {
    const cloudBtn = document.getElementById('cloudBtn');
    const cloudModal = document.getElementById('cloudModal');
    const closeBtn = document.getElementById('closeCloudModalBtn');
    const saveBtn = document.getElementById('saveCloudUrlBtn');
    const syncBtn = document.getElementById('syncNowBtn');
    const urlInput = document.getElementById('cloudApiUrl');

    const savedUrl = localStorage.getItem('finance_cloud_url');
    if (savedUrl) urlInput.value = savedUrl;

    if(cloudBtn) {
        cloudBtn.onclick = () => {
            // Refresh URL input each time modal opens
            const url = localStorage.getItem('finance_cloud_url');
            if (url) urlInput.value = url;
            cloudModal.classList.remove('hidden');
        };
    }

    if(closeBtn) {
        closeBtn.onclick = () => cloudModal.classList.add('hidden');
    }
    
    // Close on overlay click
    cloudModal.onclick = (e) => {
        if (e.target === cloudModal) cloudModal.classList.add('hidden');
    };

    if(saveBtn) {
        saveBtn.onclick = async () => {
            const url = urlInput.value.trim();
            if (!url) { alert('Vui lòng nhập URL!'); return; }
            localStorage.setItem('finance_cloud_url', url);
            showCloudStatus('⏳ Đang kết nối và tải dữ liệu...', '#f0fdf4', '#166534');
            await syncFromCloud();
            showCloudStatus('✅ Kết nối thành công!', '#f0fdf4', '#166534');
            setTimeout(() => cloudModal.classList.add('hidden'), 1200);
        };
    }
    
    if(syncBtn) {
        syncBtn.onclick = async () => {
            showCloudStatus('⏳ Đang tải dữ liệu từ Cloud...', '#eef2ff', '#3730a3');
            await syncFromCloud();
            showCloudStatus('✅ Đã đồng bộ xong!', '#f0fdf4', '#166534');
        };
    }
}

function showCloudStatus(msg, bg, color) {
    const el = document.getElementById('cloudSyncStatus');
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
    el.style.background = bg;
    el.style.color = color;
}

// Background sync FROM cloud (pulls latest data, merges, updates UI)
async function syncFromCloud() {
    const url = localStorage.getItem('finance_cloud_url');
    if (!url) {
        // Only show modal if there's no local data either
        if (transactions.length === 0 && scheduledBills.length === 0) {
            document.getElementById('cloudModal').classList.remove('hidden');
        }
        return;
    }
    
    showGlobalLoader('Đang đồng bộ từ Cloud...');
    try {
        const res = await fetch(url);
        const data = await res.json();
        let updated = false;
        
        if (data.transactions && Array.isArray(data.transactions)) {
            // Cloud has more recent/more data? Use cloud version
            if (data.transactions.length >= transactions.length) {
                transactions = data.transactions;
                updated = true;
            }
        }
        if (data.scheduledBills && Array.isArray(data.scheduledBills)) {
            if (data.scheduledBills.length >= scheduledBills.length) {
                scheduledBills = data.scheduledBills;
                updated = true;
            }
        }
        if (data.iceLogs && Array.isArray(data.iceLogs)) {
            if (data.iceLogs.length >= iceLogs.length) {
                iceLogs = data.iceLogs;
                updated = true;
            }
        }
        if (data.icePayments && Array.isArray(data.icePayments)) {
            if (data.icePayments.length >= icePayments.length) {
                icePayments = data.icePayments;
                updated = true;
            }
        }
        
        if (updated) {
            saveToLocal(); // Update local with cloud data
            updateUI();
            renderIceUI();
        }
    } catch (e) {
        console.warn('Cloud sync failed (offline?):', e);
        // No alert - just use local data silently
    } finally {
        hideGlobalLoader();
    }
}

// Background sync TO cloud (pushes local data up, non-blocking)
async function saveCloudData(successMsg) {
    // ALWAYS save to local first (instant, no network needed)
    saveToLocal();
    
    if (successMsg) showToast(successMsg);
    updateUI();
    
    // Then push to cloud in background
    const url = localStorage.getItem('finance_cloud_url');
    if (!url) return true; // No cloud URL = just local, that's fine
    
    try {
        const res = await fetch(url, {
            method: 'POST',
            body: JSON.stringify({
                transactions: transactions,
                scheduledBills: scheduledBills,
                iceLogs: iceLogs,
                icePayments: icePayments
            })
        });
        const data = await res.json();
        if (data.status !== 'success') {
            console.warn('Cloud save returned non-success');
        }
        return true;
    } catch (e) {
        console.warn('Cloud sync failed (offline?). Data saved locally.', e);
        // Data is safe in localStorage - will sync next time
        return true;
    }
}

function updateDateInputs() {
    const today = new Date().toISOString().split('T')[0];
    const expenseDateEl = document.getElementById('expenseDate');
    const incomeDateEl = document.getElementById('incomeDate');
    // Only update if user hasn't manually changed the date
    if (!expenseDateEl.dataset.manuallySet) expenseDateEl.value = today;
    if (!incomeDateEl.dataset.manuallySet) incomeDateEl.value = today;
}

// Format Currency
function formatMoney(amount) {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

// Format number input with dots as thousand separator (e.g. 1.000.000)
function formatInput(input) {
    // Strip all non-digit characters
    let raw = input.value.replace(/\D/g, '');
    if (!raw) { input.value = ''; return; }
    // Add dots every 3 digits from the right
    input.value = parseInt(raw, 10).toLocaleString('de-DE');
}

// Parse formatted string back to number (removes dots/commas)
function parseAmount(str) {
    return parseFloat(String(str).replace(/\./g, '').replace(',', '.')) || 0;
}

// Attach auto-format to a money input
function attachMoneyFormat(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => formatInput(el));
    el.addEventListener('blur', () => formatInput(el));
}

// Setup Tabs
function setupTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active classes
            tabBtns.forEach(b => b.classList.remove('active'));
            document.getElementById('expenseForm').classList.replace('active-form', 'hidden-form');
            document.getElementById('incomeForm').classList.replace('active-form', 'hidden-form');
            
            // Add active to clicked
            btn.classList.add('active');
            const tabName = btn.getAttribute('data-tab');
            document.getElementById(`${tabName}Form`).classList.replace('hidden-form', 'active-form');
        });
    });
}

// Setup Form Events
function setupFormEvents() {
    // Payment method toggle
    document.querySelectorAll('#payBtnCash, #payBtnCard').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#payBtnCash, #payBtnCard').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById('expensePayMethod').value = btn.dataset.method;
        });
    });

    // Show sub-category only for "Nguyên vật liệu quán"
    // Also auto-switch to cash when "Thanh toán thẻ" is selected
    expenseCategory.addEventListener('change', () => {
        subCategoryGroup.classList.toggle('hidden', expenseCategory.value !== 'Nguyên vật liệu quán');
        // Thanh toán thẻ = always cash payment
        if (expenseCategory.value === 'Thanh toán thẻ Techcombank') {
            document.getElementById('payBtnCash').click();
        }
    });

    // Submit Expense
    expenseForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const selectedOption = expenseCategory.options[expenseCategory.selectedIndex];
        const group = selectedOption ? selectedOption.getAttribute('data-group') : 'quan';
        const isCardPayment = expenseCategory.value === 'Thanh toán thẻ Techcombank';
        let subCategory = '';
        if (expenseCategory.value === 'Nguyên vật liệu quán') {
            subCategory = document.getElementById('expenseSubCategory').value;
        }
        const tx = {
            id: Date.now(),
            type: 'expense',
            date: document.getElementById('expenseDate').value,
            amount: parseAmount(document.getElementById('expenseAmount').value),
            name: document.getElementById('expenseName').value,
            group: group,
            category: expenseCategory.value,
            subCategory: subCategory,
            note: document.getElementById('expenseNote').value,
            paymentMethod: isCardPayment ? 'cash' : document.getElementById('expensePayMethod').value,
            isCardPayment: isCardPayment
        };
        const success = await addTransaction(tx);
        if (success) {
            expenseForm.reset();
            document.getElementById('expenseDate').value = new Date().toISOString().split('T')[0];
            // Reset toggle to cash
            document.getElementById('payBtnCash').classList.add('active');
            document.getElementById('payBtnCard').classList.remove('active');
            document.getElementById('expensePayMethod').value = 'cash';
            subCategoryGroup.classList.add('hidden');
        }
    });

    // Submit Income
    incomeForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const tx = {
            id: Date.now(),
            type: 'income',
            date: document.getElementById('incomeDate').value,
            amount: parseAmount(document.getElementById('incomeAmount').value),
            source: document.getElementById('incomeSource').value,
            note: document.getElementById('incomeNote').value
        };
        const success = await addTransaction(tx);
        if (success) {
            incomeForm.reset();
            document.getElementById('incomeDate').value = new Date().toISOString().split('T')[0];
        }
    });

    // Add Scheduled Bill
    billForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const bill = {
            id: Date.now(),
            name: document.getElementById('billName').value,
            day: parseInt(document.getElementById('billDay').value),
            amount: parseAmount(document.getElementById('billAmount').value)
        };
        scheduledBills.push(bill);
        const success = await saveCloudData('Đã thêm lịch nhắc!');
        if (success) {
            billForm.reset();
        } else {
            // Revert on fail
            scheduledBills.pop();
        }
    });

    // Delete Scheduled Bill
    billList.addEventListener('click', async (e) => {
        const btn = e.target.closest('.delete-bill-btn');
        if (btn) {
            const id = parseInt(btn.dataset.id);
            const backup = [...scheduledBills];
            scheduledBills = scheduledBills.filter(b => b.id !== id);
            const success = await saveCloudData('Đã xoá lịch nhắc');
            if (!success) {
                // Revert
                scheduledBills = backup;
            }
        }
    });

    // Reset Data
    document.getElementById('resetBtn').addEventListener('click', async () => {
        if(confirm('Bạn có chắc chắn muốn xoá toàn bộ dữ liệu? Hành động này không thể hoàn tác.')) {
            const backupT = [...transactions];
            const backupB = [...scheduledBills];
            transactions = [];
            scheduledBills = [];
            const success = await saveCloudData('Đã xoá dữ liệu');
            if (!success) {
                transactions = backupT;
                scheduledBills = backupB;
            }
        }
    });

    // Apply Filter
    document.getElementById('applyFilterBtn').addEventListener('click', applyFilter);
}

async function addTransaction(tx) {
    transactions.push(tx);
    transactions.sort((a, b) => new Date(b.date) - new Date(a.date) || b.id - a.id);
    const success = await saveCloudData('Đã thêm thành công!');
    if (!success) {
        // Revert
        transactions = transactions.filter(t => t.id !== tx.id);
        return false;
    }
    return true;
}

function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// Calculate and Update UI
function updateUI() {
    let totalIncome = 0;
    let totalExpense = 0;

    let cafeIncome = 0; let cafeExpense = 0;
    let companyIncome = 0; let companyExpense = 0;

    // Card debt tracking (cumulative)
    let totalCardSpend = 0;   // all expenses paid by card
    let totalCardPaid = 0;    // all "Thanh toán thẻ" cash payments

    // Cash balance outflow (excludes card expenses, includes card payments)
    let cashOutflow = 0;

    const now = new Date();
    const curMonth = now.getMonth();
    const curYear = now.getFullYear();
    let currentMonthAdvance = 0;

    transactions.forEach(tx => {
        if (tx.type === 'income') {
            totalIncome += tx.amount;
            if(tx.source === 'quan') cafeIncome += tx.amount;
            if(tx.source === 'congty') companyIncome += tx.amount;
        } else {
            totalExpense += tx.amount;
            if(tx.group === 'quan') cafeExpense += tx.amount;
            if(tx.group === 'congty') companyExpense += tx.amount;

            if (tx.isCardPayment) {
                // Paying off card bill: reduces cash, reduces card debt
                totalCardPaid += tx.amount;
                cashOutflow += tx.amount;
            } else if (tx.paymentMethod === 'card') {
                // Card purchase: adds to card debt, does NOT reduce cash now
                totalCardSpend += tx.amount;
            } else {
                // Normal cash expense
                cashOutflow += tx.amount;
            }

            if (tx.category === 'Lương ứng trước') {
                const txDate = new Date(tx.date);
                if (txDate.getMonth() === curMonth && txDate.getFullYear() === curYear) {
                    currentMonthAdvance += tx.amount;
                }
            }
        }
    });

    // Cash balance = what's actually in your pocket/wallet
    const currentBalance = INITIAL_CAPITAL + totalIncome - cashOutflow;
    // Card debt = cumulative unpaid card charges
    const cardDebt = Math.max(0, totalCardSpend - totalCardPaid);

    // Update DOM
    totalBalanceEl.textContent = formatMoney(currentBalance);
    totalIncomeEl.textContent = formatMoney(totalIncome);
    totalExpenseEl.textContent = formatMoney(totalExpense);

    // Advance salary display
    const advanceEl = document.getElementById('totalAdvance');
    const advanceNote = document.getElementById('advanceNote');
    if (currentMonthAdvance > 0) {
        advanceEl.textContent = formatMoney(currentMonthAdvance);
        advanceNote.classList.remove('hidden');
    } else {
        advanceEl.textContent = '0 đ';
        advanceNote.classList.add('hidden');
    }

    // Card debt display
    const cardDebtEl = document.getElementById('totalCardDebt');
    const cardDebtNote = document.getElementById('cardDebtNote');
    cardDebtEl.textContent = formatMoney(cardDebt);
    if (cardDebt > 0) {
        const today = now.getDate();
        const daysTo27 = today <= 27 ? 27 - today : (new Date(curYear, curMonth + 1, 27).getDate() + (31 - today));
        const daysLeft = today <= 27 ? 27 - today : 27 + (new Date(curYear, curMonth + 1, 0).getDate() - today);
        cardDebtNote.classList.remove('hidden');
        if (daysLeft <= 5) {
            cardDebtNote.innerHTML = `⚠️ Còn <strong>${daysLeft} ngày</strong> tới ngày thanh toán thẻ (ngày 27). Cần chuẩn bị: <strong>${formatMoney(cardDebt)}</strong>`;
            cardDebtNote.className = 'card-debt-note danger';
        } else {
            cardDebtNote.innerHTML = `💳 Nợ thẻ Techcombank hiện tại: <strong>${formatMoney(cardDebt)}</strong>. Thanh toán vào ngày 27 hàng tháng.`;
            cardDebtNote.className = 'card-debt-note';
        }
    } else {
        cardDebtNote.classList.add('hidden');
    }

    // Update History List
    renderHistory();
    renderBills();

    // Alerts Logic
    checkBillsAlert(currentBalance);
    checkDebtAlert(currentBalance, cafeIncome - cafeExpense, companyIncome - companyExpense);

    // Estimated salary card
    renderEstimatedSalary(currentMonthAdvance);

    // Inter-entity debt card
    renderInterDebt(cafeIncome, cafeExpense, companyIncome, companyExpense);

    // Personal income tax (from company personnel salary expenses)
    renderPitTax();

    // Update Charts
    updateCharts();
}

function renderHistory() {
    transactionListEl.innerHTML = '';
    const recentTx = transactions.slice(0, 20);

    if (recentTx.length === 0) {
        transactionListEl.innerHTML = '<p style="color: #94a3b8; text-align: center;">Chưa có giao dịch nào.</p>';
        return;
    }

    recentTx.forEach(tx => {
        const div = document.createElement('div');
        div.className = 'transaction-item';

        const sourceLabel = tx.source === 'quan' ? 'Quán' : (tx.source === 'congty' ? 'Công ty' : 'Khác');
        let title = tx.type === 'expense' ? tx.category : `Doanh thu ${sourceLabel}`;
        if(tx.subCategory) title += ` (${tx.subCategory})`;
        const displayName = (tx.type === 'expense' && tx.name) ? tx.name : title;
        const subtitle = (tx.type === 'expense' && tx.name) ? title : '';
        let dateStr = new Date(tx.date).toLocaleDateString('vi-VN');

        div.innerHTML = `
            <div class="transaction-info">
                <span class="tx-cat">${displayName}</span>
                <span class="tx-date">${subtitle ? subtitle + ' • ' : ''}${dateStr} ${tx.note ? '• ' + tx.note : ''}${tx.paymentMethod === 'card' ? ' <span class="card-tag">💳 Thẻ</span>' : ''}${tx.isCardPayment ? ' <span class="card-pay-tag">✅ Trả thẻ</span>' : ''}</span>
            </div>
            <span class="tx-amount ${tx.type === 'expense' ? 'tx-expense' : 'tx-income'}">
                ${tx.type === 'expense' ? '-' : '+'}${formatMoney(tx.amount)}
            </span>
            <div class="tx-actions">
                <button class="tx-action-btn edit" data-id="${tx.id}" title="Sửa"><i class="fas fa-pen"></i></button>
                <button class="tx-action-btn delete" data-id="${tx.id}" title="Xoá"><i class="fas fa-trash"></i></button>
            </div>
        `;
        transactionListEl.appendChild(div);
    });

    // Event delegation for edit/delete
    transactionListEl.onclick = async (e) => {
        const editBtn = e.target.closest('.tx-action-btn.edit');
        const deleteBtn = e.target.closest('.tx-action-btn.delete');
        if (editBtn) openEditModal(parseInt(editBtn.dataset.id));
        if (deleteBtn) {
            if (confirm('Xoá giao dịch này?')) {
                const backup = [...transactions];
                transactions = transactions.filter(t => t.id !== parseInt(deleteBtn.dataset.id));
                const success = await saveCloudData('Đã xoá giao dịch');
                if (!success) transactions = backup;
            }
        }
    };
}

let editingId = null;

function openEditModal(id) {
    const tx = transactions.find(t => t.id === id);
    if (!tx) return;
    editingId = id;

    document.getElementById('editDate').value = tx.date;
    document.getElementById('editAmount').value = tx.amount.toLocaleString('de-DE');
    document.getElementById('editNote').value = tx.note || '';

    if (tx.type === 'expense') {
        document.getElementById('editExpenseFields').classList.remove('hidden');
        document.getElementById('editIncomeFields').classList.add('hidden');
        document.getElementById('editName').value = tx.name || '';
        document.getElementById('editCategory').value = tx.category;

        // Show/populate sub-category fields based on category
        const editSubCategoryGroup = document.getElementById('editSubCategoryGroup');
        editSubCategoryGroup.classList.toggle('hidden', tx.category !== 'Nguyên vật liệu quán');
        if (tx.category === 'Nguyên vật liệu quán') {
            document.getElementById('editSubCategory').value = tx.subCategory || 'Ly, bao, nắp';
        }

        // Restore payment method toggle
        const method = tx.paymentMethod || 'cash';
        document.getElementById('editPayMethod').value = method;
        document.getElementById('editPayBtnCash').classList.toggle('active', method === 'cash');
        document.getElementById('editPayBtnCard').classList.toggle('active', method === 'card');
    } else {
        document.getElementById('editExpenseFields').classList.add('hidden');
        document.getElementById('editIncomeFields').classList.remove('hidden');
        document.getElementById('editSource').value = tx.source || 'quan';
    }

    document.getElementById('editModal').classList.remove('hidden');
    attachMoneyFormat('editAmount');

    // Edit modal payment toggle
    document.querySelectorAll('#editPayBtnCash, #editPayBtnCard').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('#editPayBtnCash, #editPayBtnCard').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById('editPayMethod').value = btn.dataset.method;
        };
    });

    // Toggle sub-category fields live if category changes within the modal
    document.getElementById('editCategory').onchange = () => {
        const val = document.getElementById('editCategory').value;
        document.getElementById('editSubCategoryGroup').classList.toggle('hidden', val !== 'Nguyên vật liệu quán');
    };
}

function closeEditModal() {
    document.getElementById('editModal').classList.add('hidden');
    editingId = null;
}

// Modal buttons
document.getElementById('closeModalBtn').addEventListener('click', closeEditModal);
document.getElementById('editModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('editModal')) closeEditModal();
});

document.getElementById('saveEditBtn').addEventListener('click', async () => {
    if (!editingId) return;
    const idx = transactions.findIndex(t => t.id === editingId);
    if (idx === -1) return;
    
    // Create a backup of current state
    const backup = JSON.parse(JSON.stringify(transactions));
    const tx = transactions[idx];

    tx.date = document.getElementById('editDate').value;
    tx.amount = parseAmount(document.getElementById('editAmount').value);
    tx.note = document.getElementById('editNote').value;

    if (tx.type === 'expense') {
        tx.name = document.getElementById('editName').value;
        const catEl = document.getElementById('editCategory');
        tx.category = catEl.value;
        tx.group = catEl.options[catEl.selectedIndex].getAttribute('data-group') || tx.group;
        tx.isCardPayment = tx.category === 'Thanh toán thẻ Techcombank';
        tx.paymentMethod = tx.isCardPayment ? 'cash' : (document.getElementById('editPayMethod').value || 'cash');
        if (tx.category === 'Nguyên vật liệu quán') {
            tx.subCategory = document.getElementById('editSubCategory').value;
        } else {
            tx.subCategory = '';
        }
    } else {
        tx.source = document.getElementById('editSource').value;
    }

    transactions[idx] = tx;
    transactions.sort((a, b) => new Date(b.date) - new Date(a.date) || b.id - a.id);
    
    const success = await saveCloudData('Đã cập nhật giao dịch!');
    if (success) {
        closeEditModal();
    } else {
        transactions = backup; // Revert on fail
    }
});

document.getElementById('deleteTransactionBtn').addEventListener('click', async () => {
    if (!editingId) return;
    if (confirm('Xoá giao dịch này?')) {
        const backup = [...transactions];
        transactions = transactions.filter(t => t.id !== editingId);
        const success = await saveCloudData('Đã xoá giao dịch');
        if (success) {
            closeEditModal();
        } else {
            transactions = backup;
        }
    }
});


function applyFilter() {
    const fromVal = document.getElementById('filterFrom').value;
    const toVal = document.getElementById('filterTo').value;
    const catVal = document.getElementById('filterCategory').value;
    const resultEl = document.getElementById('filterResult');

    if (!fromVal || !toVal) {
        resultEl.classList.remove('hidden');
        resultEl.innerHTML = '<p class="filter-warn">⚠️ Vui lòng chọn đầy đủ khoảng ngày.</p>';
        return;
    }

    const from = new Date(fromVal);
    const to = new Date(toVal);
    to.setHours(23, 59, 59);

    let filtered = transactions.filter(tx => {
        if (tx.type !== 'expense') return false;
        const d = new Date(tx.date);
        if (d < from || d > to) return false;
        if (catVal && tx.category !== catVal) return false;
        return true;
    });

    const total = filtered.reduce((sum, tx) => sum + tx.amount, 0);
    const fromStr = from.toLocaleDateString('vi-VN');
    const toStr = to.toLocaleDateString('vi-VN');
    const catLabel = catVal || 'Tất cả danh mục';

    let breakdown = {};
    filtered.forEach(tx => {
        const key = tx.subCategory ? `${tx.category} → ${tx.subCategory}` : tx.category;
        breakdown[key] = (breakdown[key] || 0) + tx.amount;
    });

    let breakdownHTML = Object.entries(breakdown).map(([k, v]) =>
        `<div class="filter-row-item"><span>${k}</span><span class="filter-amount">${formatMoney(v)}</span></div>`
    ).join('');

    resultEl.classList.remove('hidden');
    resultEl.innerHTML = `
        <div class="filter-header">
            <span>📅 ${fromStr} → ${toStr}</span>
            <span class="filter-tag">${catLabel}</span>
        </div>
        <div class="filter-breakdown">${breakdownHTML || '<p style="color:#9ca3af">Không có giao dịch nào.</p>'}</div>
        <div class="filter-total">
            <span>Tổng chi phí</span>
            <strong>${formatMoney(total)}</strong>
        </div>
        <div class="filter-count">${filtered.length} giao dịch được tìm thấy</div>
    `;
}


function renderBills() {
    billList.innerHTML = '';
    if (scheduledBills.length === 0) {
        billList.innerHTML = '<p style="color: #94a3b8; text-align: center; font-size: 0.9rem;">Chưa có lịch nhắc nào.</p>';
        return;
    }

    scheduledBills.forEach(bill => {
        const div = document.createElement('div');
        div.className = 'bill-item';
        div.innerHTML = `
            <div class="bill-item-info">
                <span class="bill-name">${bill.name}</span>
                <span class="bill-meta">Ngày ${bill.day} hàng tháng • ${formatMoney(bill.amount)}</span>
            </div>
            <button class="delete-bill-btn" data-id="${bill.id}" title="Xoá khoản này"><i class="fas fa-trash"></i></button>
        `;
        billList.appendChild(div);
    });
}

function checkBillsAlert(currentBalance) {
    const today = new Date();
    const currentDay = today.getDate();
    
    // Calculate previous month's days for cafe salary
    let prevMonth = today.getMonth() - 1;
    let year = today.getFullYear();
    if (prevMonth < 0) { prevMonth = 11; year--; }
    const daysInPrevMonth = new Date(year, prevMonth + 1, 0).getDate();
    
    let dueBillsHTML = '';
    let totalNeeded = 0;
    let hasAlert = false;

    // 1. Quán (Mặc định báo từ ngày 25 đến mùng 5 như cũ)
    if (currentDay >= 25 || currentDay <= 5) {
        hasAlert = true;
        let advancedSalary = 0;
        transactions.forEach(tx => {
            if (tx.type === 'expense' && tx.category === 'Lương ứng trước') {
                const txDate = new Date(tx.date);
                if (txDate.getMonth() === prevMonth && txDate.getFullYear() === year) {
                    advancedSalary += tx.amount;
                }
            }
        });

        const baseCafeSalary = daysInPrevMonth * STAFF_SALARY_PER_DAY;
        const cafeSalaryNeeded = Math.max(0, baseCafeSalary - advancedSalary);
        
        totalNeeded += cafeSalaryNeeded;
        dueBillsHTML += `<div style="margin-bottom: 5px;">• Lương Quán (Mùng 5): ${formatMoney(cafeSalaryNeeded)} ${advancedSalary > 0 ? `<span style="font-size:0.8rem">(đã trừ ${formatMoney(advancedSalary)} ứng)</span>` : ''}</div>`;
    }

    // 2. Các khoản đã cài đặt
    const daysInCurrentMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    scheduledBills.forEach(bill => {
        let daysLeft;
        if (bill.day >= currentDay) {
            daysLeft = bill.day - currentDay;
        } else {
            daysLeft = (daysInCurrentMonth - currentDay) + bill.day;
        }
        
        // Báo trước 12 ngày (bao gồm cả Lương công ty mùng 5, điện nước...)
        if (daysLeft <= 12) {
            hasAlert = true;
            totalNeeded += bill.amount;
            let timeStr = daysLeft === 0 ? 'Hôm nay' : `Còn ${daysLeft} ngày`;
            dueBillsHTML += `<div style="margin-bottom: 5px;">• ${bill.name} (Mùng ${bill.day}): ${formatMoney(bill.amount)} <span style="font-size:0.8rem; color:var(--warning)">(${timeStr})</span></div>`;
        }
    });

    if (hasAlert) {
        billsAlert.classList.remove('hidden');
        let msg = dueBillsHTML;
        msg += `<div style="margin-top: 8px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 8px;">`;
        msg += `Tổng cần chuẩn bị: <strong>${formatMoney(totalNeeded)}</strong>. `;
        
        if (currentBalance >= totalNeeded) {
            msg += `<span class="text-green">Đã đủ tiền!</span></div>`;
            billsAlert.classList.replace('danger', 'warning');
            billsAlert.querySelector('.alert-icon i').className = 'fas fa-check-circle text-green';
        } else {
            msg += `<span class="text-red">Còn thiếu ${formatMoney(totalNeeded - currentBalance)}</span></div>`;
            billsAlert.classList.replace('warning', 'danger');
            billsAlert.querySelector('.alert-icon i').className = 'fas fa-triangle-exclamation text-red';
        }
        
        billsMessage.innerHTML = msg;
    } else {
        billsAlert.classList.add('hidden');
    }
}

function checkDebtAlert(currentBalance, cafeNet, companyNet) {
    if (currentBalance < 0) {
        debtAlert.classList.remove('hidden');
        const debtAmt = Math.abs(currentBalance);
        let msg = `Bạn đang âm <strong>${formatMoney(debtAmt)}</strong>.<br>`;
        
        if (cafeNet < 0 && companyNet >= 0) {
            msg += `Nguyên nhân chính do <strong>Quán</strong> đang lỗ ${formatMoney(Math.abs(cafeNet))}.`;
        } else if (companyNet < 0 && cafeNet >= 0) {
            msg += `Nguyên nhân chính do <strong>Công ty</strong> đang lỗ ${formatMoney(Math.abs(companyNet))}.`;
        } else if (cafeNet < 0 && companyNet < 0) {
            msg += `Cả Quán (lỗ ${formatMoney(Math.abs(cafeNet))}) và Công ty (lỗ ${formatMoney(Math.abs(companyNet))}) đều bị âm.`;
        } else {
            msg += `Khoản âm này đến từ Chi tiêu Gia đình.`;
        }
        
        debtMessage.innerHTML = msg;
    } else {
        debtAlert.classList.add('hidden');
    }
}

// ---------------- ESTIMATED SALARY ----------------
function renderEstimatedSalary(currentMonthAdvance) {
    const today = new Date();
    const daysPassed = today.getDate();
    // Gross estimate: 300k x days passed
    const gross = daysPassed * STAFF_SALARY_PER_DAY;
    // Deduct advance taken this month
    const net = Math.max(0, gross - currentMonthAdvance);

    const el = document.getElementById('estimatedSalary');
    const noteEl = document.getElementById('estimatedSalaryNote');
    if (!el) return;

    el.textContent = formatMoney(net);
    let noteText = `(${daysPassed} ngày × 300.000đ`;
    if (currentMonthAdvance > 0) {
        noteText += ` − ứng ${formatMoney(currentMonthAdvance)}`;
    }
    noteText += ')';
    noteEl.textContent = noteText;
}

// ---------------- INTER-ENTITY DEBT ----------------
function renderInterDebt(cafeIncome, cafeExpense, companyIncome, companyExpense) {
    const cafeNet = cafeIncome - cafeExpense;           // >0 = Quán lãi, <0 = Quán lỗ
    const companyNet = companyIncome - companyExpense;  // >0 = CT lãi, <0 = CT lỗ

    const amountEl = document.getElementById('interDebtAmount');
    const noteEl = document.getElementById('interDebtNote');
    if (!amountEl) return;

    const cafeLoss    = cafeNet < -999;
    const companyLoss = companyNet < -999;

    if (companyLoss && !cafeLoss) {
        // CT lỗ → CT phải dùng tiền quỹ chung (của Quán) để bù → CT nợ Quán
        amountEl.textContent = formatMoney(Math.abs(companyNet));
        amountEl.style.color = '#F0654B';
        noteEl.textContent = '⚠️ Công ty nợ Quán';
    } else if (cafeLoss && !companyLoss) {
        // Quán lỗ → Quán phải dùng tiền quỹ chung (có của CT) → Quán nợ Công ty
        amountEl.textContent = formatMoney(Math.abs(cafeNet));
        amountEl.style.color = '#F0654B';
        noteEl.textContent = '⚠️ Quán nợ Công ty';
    } else if (cafeLoss && companyLoss) {
        // Cả hai đều lỗ → hiển thị bên nào lỗ nhiều hơn
        const total = Math.abs(cafeNet) + Math.abs(companyNet);
        amountEl.textContent = formatMoney(total);
        amountEl.style.color = '#F0654B';
        noteEl.textContent = `⚠️ Quán lỗ ${formatMoney(Math.abs(cafeNet))} • CT lỗ ${formatMoney(Math.abs(companyNet))}`;
    } else {
        // Không bên nào lỗ
        amountEl.textContent = 'Không nợ';
        amountEl.style.color = 'var(--primary)';
        noteEl.textContent = '✅ Quán và Công ty đều không nợ nhau';
    }
}

// ---------------- PERSONAL INCOME TAX (Chi phí nhân sự - Công ty) ----------------
function renderPitTax() {
    const amountEl = document.getElementById('pitTaxAmount');
    const noteEl = document.getElementById('pitTaxNote');
    if (!amountEl) return;

    const today = new Date();
    const curMonth = today.getMonth();
    const curYear = today.getFullYear();
    const PIT_THRESHOLD = 5000000;

    let totalTax = 0;
    let qualifyingCount = 0;
    let totalSalary = 0;

    transactions.forEach(tx => {
        if (tx.type === 'expense' && tx.category === 'Chi phí nhân sự') {
            const txDate = new Date(tx.date);
            if (txDate.getMonth() === curMonth && txDate.getFullYear() === curYear) {
                if (tx.amount >= PIT_THRESHOLD) {
                    const tax = tx.amount / 0.9 - tx.amount;
                    totalTax += tax;
                    totalSalary += tx.amount;
                    qualifyingCount++;
                }
            }
        }
    });

    amountEl.textContent = formatMoney(totalTax);
    if (qualifyingCount > 0) {
        amountEl.style.color = 'var(--danger)';
        noteEl.textContent = `${qualifyingCount} khoản lương ≥ 5tr • Tổng lương ${formatMoney(totalSalary)}`;
    } else {
        amountEl.style.color = 'var(--primary)';
        noteEl.textContent = 'Chưa có khoản lương nào ≥ 5.000.000đ';
    }
}

// ---------------- CHART LOGIC ----------------
function updateCharts() {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    const daysPassed = today.getDate();

    let cafeRevenue = 0;
    let allCafeCost = 0;  // ALL quan-group expenses
    let foodCost = 0;
    let personalCost = 0;

    transactions.forEach(tx => {
        const txDate = new Date(tx.date);
        if (txDate.getMonth() === currentMonth && txDate.getFullYear() === currentYear) {
            if (tx.type === 'income' && tx.source === 'quan') {
                cafeRevenue += tx.amount;
            }
            if (tx.type === 'expense') {
                // Count ALL quan expenses (nguyên liệu, chi phí chung, lương ứng, thưởng...)
                if (tx.group === 'quan') {
                    allCafeCost += tx.amount;
                }
                if (tx.group === 'giadinh' && tx.category === 'Chi phí ăn uống') {
                    foodCost += tx.amount;
                }
                if (tx.group === 'giadinh' && tx.category === 'Chi tiêu cá nhân') {
                    personalCost += tx.amount;
                }
            }
        }
    });

    // Removed: auto salary accumulation
    // Chart uses only ACTUAL recorded expenses
    renderCafeChart(allCafeCost, cafeRevenue);
    renderFoodChart(foodCost);
    renderPersonalChart(personalCost);
}

const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '75%',
    plugins: {
        legend: { display: false },
        tooltip: { enabled: false }
    }
};

function createDonut(ctx, dataValues, colors) {
    return new Chart(ctx, {
        type: 'doughnut',
        data: {
            datasets: [{
                data: dataValues,
                backgroundColor: colors,
                borderWidth: 0,
                borderRadius: 5
            }]
        },
        options: commonOptions
    });
}

function renderCafeChart(cost, revenue) {
    if (cafeChartInstance) cafeChartInstance.destroy();
    const ctx = document.getElementById('cafeChart');
    const label = document.getElementById('cafeChartLabel');
    
    if (revenue === 0) {
        cafeChartInstance = createDonut(ctx, [1, 0], ['#e2e8f0', '#1e293b']);
        label.innerHTML = 'Chưa có<br>doanh thu';
        label.className = 'chart-label';
        return;
    }

    const ratio = cost / revenue;
    const ratioPercent = Math.round(ratio * 100);
    const isDanger = ratio > 0.65;
    
    // Chi phí (Cost): Vàng, nếu nguy hiểm (vượt 65%) thì Đỏ
    const costColor = isDanger ? '#F0654B' : '#F2A93B';
    // Lợi nhuận (Remaining): Xanh lá
    const remainingColor = '#22B573';
    
    let remaining = revenue - cost;
    if (remaining < 0) remaining = 0;

    cafeChartInstance = createDonut(ctx, [cost, remaining], [costColor, remainingColor]);
    
    // Show amount AND percentage inside chart
    label.innerHTML = `
        <span style="font-size:0.95rem; font-weight:700; display:block; color: var(--text-main);">${formatMoney(cost)}</span>
        <span style="font-size:0.8rem; opacity:0.8; color: var(--text-muted);">Chi phí: ${ratioPercent}%</span>
        ${isDanger ? '<span style="font-size:0.72rem; color:#F0654B;">(Lợi nhuận giảm)</span>' : ''}
    `;
    label.className = isDanger ? 'chart-label danger' : 'chart-label';
}

function renderFoodChart(cost) {
    if (foodChartInstance) foodChartInstance.destroy();
    const ctx = document.getElementById('foodChart');
    const label = document.getElementById('foodChartLabel');
    const limit = 6000000;
    
    let remaining = limit - cost;
    const isDanger = remaining < 0;
    if (remaining < 0) remaining = 0;
    
    // Đã xài (Cost): Vàng, vượt mức thì Đỏ
    const costColor = isDanger ? '#F0654B' : '#F2A93B'; 
    // Còn lại (Remaining): Xanh lá
    const remainingColor = '#22B573';

    // Đổi mảng màu: [Cost, Remaining] => [costColor, remainingColor]
    foodChartInstance = createDonut(ctx, [cost, remaining], [costColor, remainingColor]);
    
    if (isDanger) {
        label.innerHTML = `Vượt mức<br><span style="color:#F0654B">${formatMoney(cost - limit)}</span>`;
        label.className = 'chart-label danger';
    } else {
        label.innerHTML = `Còn lại<br><span style="color:var(--text-main)">${formatMoney(limit - cost)}</span>`;
        label.className = 'chart-label';
    }
}

function renderPersonalChart(cost) {
    if (personalChartInstance) personalChartInstance.destroy();
    const ctx = document.getElementById('personalChart');
    const label = document.getElementById('personalChartLabel');
    const limit = 3500000;
    
    let remaining = limit - cost;
    const isDanger = remaining < 0;
    if (remaining < 0) remaining = 0;
    
    // Đã xài (Cost): Vàng, vượt mức thì Đỏ
    const costColor = isDanger ? '#F0654B' : '#F2A93B'; 
    // Còn lại (Remaining): Xanh lá
    const remainingColor = '#22B573';

    personalChartInstance = createDonut(ctx, [cost, remaining], [costColor, remainingColor]);
    
    if (isDanger) {
        label.innerHTML = `Vượt mức<br><span style="color:#F0654B">${formatMoney(cost - limit)}</span>`;
        label.className = 'chart-label danger';
    } else {
        label.innerHTML = `Còn lại<br><span style="color:var(--text-main)">${formatMoney(limit - cost)}</span>`;
        label.className = 'chart-label';
    }
}

// ---------------- ICE TRACKING ----------------
function setupIceEvents() {
    // Add ice log
    document.getElementById('addIceBtn').addEventListener('click', async () => {
        const dateVal = document.getElementById('iceDate').value;
        const qtyVal = parseInt(document.getElementById('iceQty').value);
        if (!dateVal || !qtyVal || qtyVal < 1) {
            alert('Vui lòng nhập ngày và số bao đá hợp lệ.');
            return;
        }
        const entry = { id: Date.now(), date: dateVal, qty: qtyVal };
        iceLogs.push(entry);
        iceLogs.sort((a, b) => new Date(b.date) - new Date(a.date) || b.id - a.id);
        const success = await saveCloudData('Đã thêm bao đá!');
        if (success) {
            document.getElementById('iceQty').value = '';
            renderIceUI();
        } else {
            iceLogs = iceLogs.filter(l => l.id !== entry.id);
        }
    });

    // Delete ice log (only if element exists in DOM)
    const iceLogListEl = document.getElementById('iceLogList');
    if (iceLogListEl) {
        iceLogListEl.addEventListener('click', async (e) => {
            const btn = e.target.closest('.ice-delete-btn');
            if (!btn) return;
            const id = parseInt(btn.dataset.id);
            if (!confirm('Xoá mục đá này?')) return;
            const backup = [...iceLogs];
            iceLogs = iceLogs.filter(l => l.id !== id);
            const success = await saveCloudData('Đã xoá mục đá');
            if (success) {
                renderIceUI();
            } else {
                iceLogs = backup;
            }
        });
    }

    // Query ice
    document.getElementById('iceQueryBtn').addEventListener('click', () => {
        const fromVal = document.getElementById('iceQueryFrom').value;
        const toVal = document.getElementById('iceQueryTo').value;
        const resultEl = document.getElementById('iceQueryResult');

        if (!fromVal || !toVal) {
            resultEl.classList.remove('hidden');
            resultEl.innerHTML = '<p style="color: var(--warning); font-size: 0.9rem;">⚠️ Vui lòng chọn đầy đủ khoảng ngày.</p>';
            return;
        }

        const from = new Date(fromVal);
        const to = new Date(toVal);
        to.setHours(23, 59, 59);

        const filtered = iceLogs.filter(l => {
            const d = new Date(l.date);
            return d >= from && d <= to;
        });

        const totalQty = filtered.reduce((sum, l) => sum + l.qty, 0);
        const totalDays = filtered.length;
        const fromStr = from.toLocaleDateString('vi-VN');
        const toStr = to.toLocaleDateString('vi-VN');

        // Build daily breakdown
        let dailyMap = {};
        filtered.forEach(l => {
            dailyMap[l.date] = (dailyMap[l.date] || 0) + l.qty;
        });
        const dailyEntries = Object.entries(dailyMap).sort((a, b) => new Date(b[0]) - new Date(a[0]));
        let dailyHTML = dailyEntries.map(([d, q]) =>
            `<div style="display:flex; justify-content:space-between; padding:4px 0; font-size:0.85rem;"><span>${new Date(d).toLocaleDateString('vi-VN')}</span><strong style="color:#3b82f6">${q} bao</strong></div>`
        ).join('');

        resultEl.classList.remove('hidden');
        resultEl.innerHTML = `
            <div class="ice-query-result">
                <span class="iqr-label">📅 ${fromStr} → ${toStr}</span>
                <span class="iqr-value">🧊 ${totalQty} bao đá</span>
                <span class="iqr-detail">${Object.keys(dailyMap).length} ngày có ghi nhận • ${totalDays} lần nhập</span>
                ${dailyHTML ? '<div style="margin-top:8px; border-top:1px solid rgba(96,165,250,0.15); padding-top:8px;">' + dailyHTML + '</div>' : ''}
            </div>
        `;
    });

    // Pay ice (only if element exists)
    const icePayBtnEl = document.getElementById('icePayBtn');
    if (icePayBtnEl) {
        icePayBtnEl.addEventListener('click', async () => {
            const qtyVal = parseInt(document.getElementById('icePayQty').value);
            const amountVal = parseAmount(document.getElementById('icePayAmount').value);
            if (!qtyVal || qtyVal < 1 || !amountVal) {
                alert('Vui lòng nhập số bao và số tiền thanh toán.');
                return;
            }
            const payment = {
                id: Date.now(),
                date: new Date().toISOString().split('T')[0],
                qty: qtyVal,
                amount: amountVal
            };
            icePayments.push(payment);
            
            // Also add as a shop expense (chi phí quán)
            const tx = {
                id: Date.now() + 1,
                type: 'expense',
                date: payment.date,
                amount: amountVal,
                name: `Thanh toán đá (${qtyVal} bao)`,
                group: 'quan',
                category: 'Chi phí chung',
                subCategory: '',
                note: `Thanh toán ${qtyVal} bao đá`,
                paymentMethod: 'cash',
                isCardPayment: false
            };
            transactions.push(tx);
            transactions.sort((a, b) => new Date(b.date) - new Date(a.date) || b.id - a.id);

            const success = await saveCloudData('Đã thanh toán đá!');
            if (success) {
                document.getElementById('icePayQty').value = '';
                document.getElementById('icePayAmount').value = '';
                renderIceUI();
            } else {
                icePayments = icePayments.filter(p => p.id !== payment.id);
                transactions = transactions.filter(t => t.id !== tx.id);
            }
        });
    }

    // Delete ice payment (only if element exists)
    const icePaymentListEl = document.getElementById('icePaymentList');
    if (icePaymentListEl) {
        icePaymentListEl.addEventListener('click', async (e) => {
            const btn = e.target.closest('.ice-delete-btn');
            if (!btn) return;
            const id = parseInt(btn.dataset.id);
            if (!confirm('Xoá lần thanh toán đá này?')) return;
            const backup = [...icePayments];
            icePayments = icePayments.filter(p => p.id !== id);
            const success = await saveCloudData('Đã xoá thanh toán đá');
            if (success) {
                renderIceUI();
            } else {
                icePayments = backup;
            }
        });
    }
}

function renderIceUI() {
    renderIceLogs();
    renderIcePayments();
    renderIceUnpaidBanner();
}

function renderIceLogs() {
    const listEl = document.getElementById('iceLogList');
    if (!listEl) return;
    listEl.innerHTML = '';

    const recent = iceLogs.slice(0, 15);
    if (recent.length === 0) {
        listEl.innerHTML = '<p style="color: #94a3b8; text-align: center; font-size: 0.85rem;">Chưa có dữ liệu đá.</p>';
        return;
    }

    recent.forEach(log => {
        const div = document.createElement('div');
        div.className = 'ice-log-item';
        div.innerHTML = `
            <span class="ice-date">${new Date(log.date).toLocaleDateString('vi-VN')}</span>
            <span class="ice-qty">${log.qty} bao</span>
            <button class="ice-delete-btn" data-id="${log.id}" title="Xoá"><i class="fas fa-trash"></i></button>
        `;
        listEl.appendChild(div);
    });
}

function renderIcePayments() {
    const listEl = document.getElementById('icePaymentList');
    if (!listEl) return;
    listEl.innerHTML = '';

    if (icePayments.length === 0) {
        listEl.innerHTML = '<p style="color: #94a3b8; text-align: center; font-size: 0.85rem;">Chưa thanh toán lần nào.</p>';
        return;
    }

    // Show most recent first
    const sorted = [...icePayments].sort((a, b) => new Date(b.date) - new Date(a.date) || b.id - a.id);
    sorted.forEach(p => {
        const div = document.createElement('div');
        div.className = 'ice-payment-item';
        div.innerHTML = `
            <div class="ip-info">
                <span class="ip-amount">${formatMoney(p.amount)}</span>
                <span class="ip-meta">${new Date(p.date).toLocaleDateString('vi-VN')} • ${p.qty} bao</span>
            </div>
            <button class="ice-delete-btn" data-id="${p.id}" title="Xoá"><i class="fas fa-trash"></i></button>
        `;
        listEl.appendChild(div);
    });
}

function renderIceUnpaidBanner() {
    const el = document.getElementById('iceUnpaidTotal');
    if (!el) return;
    const totalLogged = iceLogs.reduce((sum, l) => sum + l.qty, 0);
    const totalPaid = icePayments.reduce((sum, p) => sum + p.qty, 0);
    const unpaid = Math.max(0, totalLogged - totalPaid);
    el.textContent = `${unpaid} bao`;
}

// Start
init();
