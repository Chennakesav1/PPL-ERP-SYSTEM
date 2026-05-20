// ==========================================
// 1. GLOBALS & MEMORY SHARING FOR MARKET.JS
// ==========================================
window.activeWorkOrders = window.activeWorkOrders || [];
window.requestedOrders = window.requestedOrders || [];
window.completedOrders = window.completedOrders || [];

// Map to local variables just in case market.js doesn't use "window."
let activeWorkOrders = window.activeWorkOrders;
let requestedOrders = window.requestedOrders;
let completedOrders = window.completedOrders;

// ==========================================
// 2. FETCH DATA FOR NOTIFICATIONS
// ==========================================
async function fetchWOsForMarket() {
    try {
        // Assuming API_URL is defined further down, we construct it safely here just in case
        const apiPath = typeof API_URL !== 'undefined' ? API_URL : `http://${window.location.hostname}:3000/api`;
        
        const res = await fetch(`${apiPath}/work-orders/all`);
        if (res.ok) {
            let data = await res.json();
            let allWOs = Array.isArray(data) ? data : (data.data || []);
            
            // Populate the arrays
            window.activeWorkOrders = allWOs.filter(w => w.status === 'ACTIVE');
            window.requestedOrders = allWOs.filter(w => w.status === 'REQUESTED');
            window.completedOrders = allWOs.filter(w => w.status === 'COMPLETED');

            activeWorkOrders = window.activeWorkOrders;
            requestedOrders = window.requestedOrders;
            completedOrders = window.completedOrders;

            // Instantly update the UI once data arrives
            if (typeof updateNotificationCenter === 'function') {
                updateNotificationCenter();
            }
        }
    } catch (e) {
        console.log("Market Dashboard WO Fetch Failed:", e);
    }
}

// Trigger the fetch the second the file loads
fetchWOsForMarket();


const API_URL = 'http://localhost:3000/api';



// ==========================================
// 🚨 1. GLOBAL MEMORY STATE 🚨
// ==========================================
let masterPartDictionary = {};
let rawDealersData = []; let currentDealersData = []; let currentDealerColumns = [];
let rawTargetsData = []; let targetOrdersData = [];
let rawSalesData = []; let rawOrderData = []; let rawProdData = []; let rawVisitsData = [];
let rawExpensesData = []; let rawAuditData = [];
let currentOrderCart = [];

let activeSalesFY = ''; let activeSalesMonth = 'ALL';
let activeOrderFY = ''; let activeOrderMonth = 'ALL';
let activeProdMonth = ''; let activeTargetFY = '';
let currentDealerCategory = 'Master Sheet'; let currentDealerSearch = '';
let currentProfileDealerId = null;
let calendarInstance = null;
let alertBadgeCount = 0;


let chartInstances = {
    monthlyRevChart: null, monthlyQtyChart: null, salesBarChart: null, qtyBarChart: null,
    predictChart: null, topCustRevChart: null, topCustVolChart: null, orderTimelineChart: null,
    prodStatusChart: null, prodBarChart: null, freightDeptChart: null
};

let currentUserRole = localStorage.getItem('userRole') || null;
let currentUsername = localStorage.getItem('username') || null;

// ==========================================
// 🚨 2. SECURE BOOT & AUTH 🚨
// ==========================================
window.onload = function() {
    if (!currentUserRole) {
        if(document.getElementById('loginOverlay')) document.getElementById('loginOverlay').style.display = 'flex';
    } else {
        if(document.getElementById('loginOverlay')) document.getElementById('loginOverlay').style.display = 'none';
        applyRolePermissions();
        bootSystem();
    }
};

if(document.getElementById('loginForm')) {
    document.getElementById('loginForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const u = document.getElementById('username').value.trim(); const p = document.getElementById('password').value.trim();
        if (u === 'admin' && p === 'admin') { currentUserRole = 'ADMIN'; currentUsername = 'System Admin'; } 
        else if (u === 'marketer' && p === 'market') { currentUserRole = 'MARKETER'; currentUsername = 'Field Marketer'; } 
        // 🚀 ADD THE STORE ROLE
        else if (u === 'store' && p === 'store') { currentUserRole = 'STORE'; currentUsername = 'Store Manager'; } 
        else { return alert("Invalid Credentials!"); }
        
        localStorage.setItem('userRole', currentUserRole); localStorage.setItem('username', currentUsername);
        document.getElementById('loginOverlay').style.display = 'none';
        applyRolePermissions(); bootSystem();
    });
}

function logout() { localStorage.removeItem('userRole'); localStorage.removeItem('username'); location.reload(); }
function applyRolePermissions() {
    if(document.getElementById('userRoleBadge')) document.getElementById('userRoleBadge').innerText = `LOGGED IN AS: ${currentUserRole}`;
    
    const bell = document.querySelector('.bell-container');
    const fab = document.querySelector('.fab-container');
    // 🚀 Find the logout button so we can protect it
    const logoutBtn = document.querySelector('button[onclick="window.logout()"]'); 
    
    // Default hiding
    document.querySelectorAll('.store-only').forEach(el => el.style.display = 'none');

    if (currentUserRole === 'MARKETER') {
        document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
        document.querySelectorAll('.btn-delete').forEach(el => el.style.display = 'none');
        if(document.getElementById('BulkImportNav')) document.getElementById('BulkImportNav').style.display = 'none';
        if(bell) bell.style.display = 'block';
        if(fab) fab.style.display = 'flex';
    } 
    else if (currentUserRole === 'STORE') {
        // Store only sees their dashboard and inventory
        document.querySelectorAll('.nav-section:not(.store-only)').forEach(el => el.style.display = 'none');
        document.querySelectorAll('.nav-btn:not(.store-only)').forEach(el => el.style.display = 'none');
        document.querySelectorAll('.store-only').forEach(el => el.style.display = 'block');
        document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
        
        // Hide Bell and + button, but FORCE SHOW the Logout button!
        if(bell) bell.style.display = 'none';
        if(fab) fab.style.display = 'none';
        if(logoutBtn) logoutBtn.style.display = 'block'; 
    } 
    else if (currentUserRole === 'ADMIN') {
        document.querySelectorAll('.store-only').forEach(el => el.style.display = 'block');
        if(bell) bell.style.display = 'block';
        if(fab) fab.style.display = 'flex';
    }
}

// ==========================================
// 🚀 THE PROGRESSIVE LIGHTNING BOOT ENGINE 🚀
// ==========================================
async function bootSystem() {
    console.log("⚡ Starting Progressive Lightning Boot...");
    
    try {
        if(document.getElementById('dealerGridWrapper')) {
            document.getElementById('dealerGridWrapper').innerHTML = '<div style="padding:40px; text-align:center;"><h2 style="color:#0ea5e9;">⚡ Fast-Syncing Dealers...</h2><p style="color:#64748b;">Loading heavy data silently in the background.</p></div>';
        }

        // 1. INSTANT LOAD: Dealers (Unlocks the default screen instantly)
        fetch(`${API_URL}/dealers/Master Sheet`).then(res => res.json()).then(dJson => {
            rawDealersData = dJson.dealers || [];
            window.hasFetchedDealerData = true; 
            populateCustomerDropdown();
            
            if (currentUserRole === 'STORE') {
                window.switchTab('StoreDashboard', 'store');
            } else {
                if(typeof fetchDealers === 'function') fetchDealers(); 
            }
        }).catch(e => console.error("Dealer Boot Error:", e));

        // 2. BACKGROUND LOAD: Sales Data
        fetch(`${API_URL}/sales`).then(res => res.json()).then(sJson => {
            rawSalesData = (sJson.sales || []).map(s => { updateMasterDictionary(s); return { ...s, fy: getFY(s.date) }; });
            
            const salesFySet = new Set(); rawSalesData.forEach(s => { if(s.fy !== 'Unknown') salesFySet.add(s.fy); });
            const sFys = Array.from(salesFySet).sort().reverse();
            sFys.unshift('ALL'); 
            const sFySelect = document.getElementById('fySelector');
            activeSalesFY = 'ALL'; window.activeSalesFY = 'ALL';
            if(sFySelect) sFySelect.innerHTML = sFys.map(fy => `<option value="${fy}">${fy === 'ALL' ? '🌎 All Time' : fy}</option>`).join('');
            
            if(typeof renderSalesTabs === 'function') renderSalesTabs();
            if(typeof updateDailyReports === 'function') updateDailyReports();
        }).catch(e => console.error("Sales Boot Error:", e));

        // 3. BACKGROUND LOAD: Order Data (Heavy!)
        fetch(`${API_URL}/orders`).then(res => res.json()).then(oJson => {
            rawOrderData = (oJson.orders || []).map(o => { updateMasterDictionary(o); return { ...o, fy: getFY(o.date) }; });
            targetOrdersData = rawOrderData;
            populateCustomerDropdown();

            const ordFySet = new Set(); rawOrderData.forEach(o => { if(o.fy !== 'Unknown') ordFySet.add(o.fy); });
            const oFys = Array.from(ordFySet).sort().reverse();
            oFys.unshift('ALL'); 
            const oFySelect = document.getElementById('fySelectorOrder');
            activeOrderFY = 'ALL'; window.activeOrderFY = 'ALL';
            if(oFySelect) oFySelect.innerHTML = oFys.map(fy => `<option value="${fy}">${fy === 'ALL' ? '🌎 All Time' : fy}</option>`).join('');

            if(typeof renderOrderTabs === 'function') renderOrderTabs();
            if(typeof renderTargetsTable === 'function') renderTargetsTable(); // Targets depend on Orders!
            if(typeof updateDailyReports === 'function') updateDailyReports();
            if(typeof checkPaymentOverdue === 'function') checkPaymentOverdue();
            if(typeof updateNotificationCenter === 'function') updateNotificationCenter();
        }).catch(e => console.error("Order Boot Error:", e));

        // 4. BACKGROUND LOAD: Targets Data
        fetch(`${API_URL}/targets`).then(res => res.json()).then(tJson => {
            rawTargetsData = tJson.targets || [];
            
            const tFySet = new Set(); targetOrdersData.forEach(o => { if(o.fy !== 'Unknown') tFySet.add(o.fy); });
            const tFys = Array.from(tFySet).sort().reverse();
            tFys.unshift('ALL'); 
            const tFySelect = document.getElementById('fySelectorTarget');
            activeTargetFY = 'ALL'; window.activeTargetFY = 'ALL';
            if(tFySelect) tFySelect.innerHTML = tFys.map(fy => `<option value="${fy}">${fy === 'ALL' ? '🌎 All Time' : fy}</option>`).join('');
            
            if(typeof renderTargetsTable === 'function') renderTargetsTable();
        }).catch(e => console.error("Targets Boot Error:", e));

        // 5. BACKGROUND LOAD: Production Data
        fetch(`${API_URL}/production-market`).then(res => res.json()).then(pJson => {
            rawProdData = pJson.production || [];
            rawProdData.forEach(p => updateMasterDictionary(p));
            
            const prodMSet = new Set(); rawProdData.forEach(p => { if(p.month) prodMSet.add(p.month); }); 
            const pFys = Array.from(prodMSet).sort().reverse();
            if (pFys.length > 0) { activeProdMonth = pFys[0]; }
            
            if(typeof renderProdTabs === 'function') renderProdTabs();
        }).catch(e => console.error("Production Boot Error:", e));

        // 6. SILENT BACKGROUND FETCH FOR SMALL TABS
        fetchFreight();
        fetchVisits();
        fetchExpenses();
        if(currentUserRole === 'ADMIN') fetchAuditLogs();

    } catch(e) {
        console.error("Boot Sequence Failed:", e);
    }
}

// ==========================================
// 🚨 3. UTILITIES & FORMATTING 🚨
// ==========================================
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container'); if(!container) return;
    const toast = document.createElement('div'); toast.className = `native-toast ${type === 'error' ? 'error' : ''}`;
    toast.innerHTML = `<span class="toast-icon">${type === 'error' ? '❌' : '✅'}</span> <span>${message}</span>`;
    container.appendChild(toast); setTimeout(() => toast.classList.add('show'), 10); 
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3500);
}

function escapeHtml(str) { return String(str).replace(/'/g, "&#39;").replace(/"/g, "&quot;"); }
function fmtMoney(n) { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0); }
function fmtNum(n) { return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n || 0); }

function getFY(dateStr) {
    if (!dateStr) return 'Unknown'; const parts = dateStr.split('-'); if (parts.length < 2) return 'Unknown';
    const year = parseInt(parts[0]), month = parseInt(parts[1]);
    return month >= 4 ? `FY ${year}-${String(year + 1).slice(2)}` : `FY ${year - 1}-${String(year).slice(2)}`;
}

function isNameMatch(n1, n2) {
    if(!n1 || !n2) return false;
    let a = String(n1).toUpperCase().trim().replace(/\s+(PVT|LTD|PRIVATE|LIMITED|CO|CORP|CORPORATION|ENTERPRISES|INDUSTRIES|MOTORS|AGENCIES)\b/g, '');
    let b = String(n2).toUpperCase().trim().replace(/\s+(PVT|LTD|PRIVATE|LIMITED|CO|CORP|CORPORATION|ENTERPRISES|INDUSTRIES|MOTORS|AGENCIES)\b/g, '');
    return a.includes(b) || b.includes(a);
}

function destroyChart(chartName) {
    if (chartInstances[chartName]) { chartInstances[chartName].destroy(); chartInstances[chartName] = null; }
}

function updateMasterDictionary(item) {
    if (!item || !item.partCode) return;
    const code = item.partCode.toUpperCase();
    if (!masterPartDictionary[code]) masterPartDictionary[code] = {};
    if (item.description && item.description !== 'x x') masterPartDictionary[code].desc = item.description;
    if (item.wtPerPc) masterPartDictionary[code].wt = item.wtPerPc;
    if (item.type) masterPartDictionary[code].type = item.type;
    if (item.size) masterPartDictionary[code].size = item.size;
    if (item.af) masterPartDictionary[code].af = item.af;
    if (item.pitch) masterPartDictionary[code].pitch = item.pitch;
    if (item.length) masterPartDictionary[code].length = item.length;
    if (item.grade) masterPartDictionary[code].grade = item.grade;
    if (item.unitPrice) masterPartDictionary[code].rate = item.unitPrice;
}

function populateCustomerDropdown() {
    let customers = new Set();
    if (rawOrderData) rawOrderData.forEach(o => { if (o.customerName) customers.add(o.customerName.toUpperCase().trim()); });
    if (currentDealersData) currentDealersData.forEach(d => { if (d.data && d.data.Name) customers.add(String(d.data.Name).toUpperCase().trim()); });
    let sortedCust = Array.from(customers).sort();
    let html = '<option value="">Select Customer...</option>';
    sortedCust.forEach(c => html += `<option value="${escapeHtml(c)}">${c}</option>`);
    if(document.getElementById('oCustomer')) document.getElementById('oCustomer').innerHTML = html;
}

function switchTab(tabId, type) {
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    if(event && event.currentTarget) event.currentTarget.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    const t = document.getElementById(tabId); if(t) t.classList.add('active');

    // 🚀 UPGRADE: Instantly load from RAM instead of hitting the server again!
    if (type === 'dealer') { closeDealerProfile(); fetchDealers(); }
    else if (type === 'target') { renderTargetsTable(); }
    else if (type === 'sales') { renderSalesTabs(); }
    else if (type === 'order') { renderOrderTabs(); }
    else if (type === 'production') { renderProdTabs(); }
    else if (type === 'freight') { fetchFreight(); }
    else if (type === 'visits') { fetchVisits(); setTimeout(()=> { renderCalendar(); }, 200); }
    else if (type === 'expense') { fetchExpenses(); }
    else if (type === 'audit') { fetchAuditLogs(); }
    else if (type === 'reports') { updateDailyReports(); }
    else if (type === 'store') { window.fetchStorePickLists(); }
    else if (type === 'system') {
        if(tabId === 'ManualAdd') { 
            if(document.getElementById('oDate')) document.getElementById('oDate').value = new Date().toISOString().substring(0,7); 
            if(document.getElementById('pMonth')) document.getElementById('pMonth').value = new Date().toISOString().substring(0,7); 
            if(document.getElementById('fDate')) document.getElementById('fDate').valueAsDate = new Date();
            loadDealerFields(); 
        }
        else if (tabId === 'BulkImport') { toggleWipeOptions(); }
    }
}

function switchInnerSalesTab(tabId) { document.querySelectorAll('.sub-tab-btn:not(.order-sub):not(.prod-sub)').forEach(btn => btn.classList.remove('active')); if(event && event.currentTarget) event.currentTarget.classList.add('active'); document.querySelectorAll('#SalesDashboard .inner-tab').forEach(tab => tab.classList.remove('active')); const t = document.getElementById(`sales-${tabId}`); if(t) t.classList.add('active'); }
function switchInnerOrderTab(tabId) { document.querySelectorAll('.order-sub').forEach(btn => btn.classList.remove('active')); if(event && event.currentTarget) event.currentTarget.classList.add('active'); document.querySelectorAll('#OrderDashboard .inner-tab').forEach(tab => tab.classList.remove('active')); const t = document.getElementById(`order-${tabId}`); if(t) t.classList.add('active'); }
function switchInnerProdTab(tabId) { document.querySelectorAll('.prod-sub').forEach(btn => btn.classList.remove('active')); if(event && event.currentTarget) event.currentTarget.classList.add('active'); document.querySelectorAll('#ProductionDashboard .inner-tab').forEach(tab => tab.classList.remove('active')); const t = document.getElementById(`prod-${tabId}`); if(t) t.classList.add('active'); }

window.changeFY = function(module) {
    if (module === 'sales') { 
        activeSalesFY = document.getElementById('fySelector').value; 
        window.activeSalesFY = activeSalesFY; // Sync global
        activeSalesMonth = 'ALL'; window.activeSalesMonth = 'ALL';
        renderSalesTabs(); 
    }
    else if (module === 'order') { 
        activeOrderFY = document.getElementById('fySelectorOrder').value; 
        window.activeOrderFY = activeOrderFY; // Sync global
        activeOrderMonth = 'ALL'; window.activeOrderMonth = 'ALL';
        renderOrderTabs(); 
    }
    else if (module === 'targets') { 
        activeTargetFY = document.getElementById('fySelectorTarget').value; 
        window.activeTargetFY = activeTargetFY; // Sync global
        renderTargetsTable(); 
    }
};

function setMonth(module, monthStr) {
    if (module === 'sales') { activeSalesMonth = monthStr; renderSalesTabs(); }
    else if (module === 'order') { activeOrderMonth = monthStr; renderOrderTable(rawOrderData.filter(o => o.fy === activeOrderFY && (document.getElementById('segmentFilterOrder').value === 'ALL' || o.segment === document.getElementById('segmentFilterOrder').value))); }
    else if (module === 'prod') { activeProdMonth = monthStr; renderProdTable(); }
}

// ==========================================
// 🚨 5. UNIVERSAL NOTIFICATION CENTER 🚨
// ==========================================
function openNotifCenter() {
    let panel = document.getElementById('notifSidePanel');
    if(panel.classList.contains('open')) panel.classList.remove('open');
    else { panel.classList.add('open'); updateNotificationCenter(); }
}

function updateNotificationCenter() {
    alertBadgeCount = 0;
    let html = '';
    const today = new Date(); today.setHours(0,0,0,0);

    if(currentUserRole === 'ADMIN') {
        let overdueCount = 0;
        rawOrderData.forEach(o => {
            if(o.dispatchQty > 0) {
                let due = (o.dispatchValue || 0) - (o.paidAmount || 0);
                if(due > 0) {
                    let dDate = o.bookingDate ? new Date(o.bookingDate) : new Date(o.createdAt);
                    let diffDays = Math.floor((today - dDate) / (1000 * 60 * 60 * 24));
                    if(diffDays > 45) overdueCount++;
                }
            }
        });
        if(overdueCount > 0) {
            alertBadgeCount++;
            html += `<div class="alert-card red"><h4 style="margin:0 0 5px 0; color:#b91c1c;">🚨 Overdue Payments</h4><p style="margin:0; font-size:0.9rem;">You have <b>${overdueCount}</b> orders that are over 45 days unpaid. Check the Accounts Receivable tab.</p></div>`;
        }
    }

    // ⚡ NEW: Alert PPC & Admin about Auto-Generated WO Requests ⚡
    if(currentUserRole === 'ADMIN' || currentUserRole === 'PPC' || currentUserRole === 'PRODUCTION') {
        let requestedWOs = activeWorkOrders.filter(w => w.status === 'REQUESTED');
        if(requestedWOs.length > 0) {
            alertBadgeCount += requestedWOs.length;
            let listHtml = requestedWOs.map(w => `• ${w.partNo} (Need: ${w.targetQty}) - <i>${w.remarks.split('|')[1]}</i>`).join('<br>');
            
            html += `<div class="alert-card yellow">
                        <h4 style="margin:0 0 5px 0; color:#b45309;">⚠️ Pending Sales Production Requests</h4>
                        <p style="margin:0; font-size:0.9rem;">Sales generated <b>${requestedWOs.length}</b> orders that lack inventory. Awaiting PPC approval to begin manufacturing.</p>
                        <p style="margin-top:8px; font-size:0.8rem; font-family:monospace; color:#a16207;">${listHtml}</p>
                     </div>`;
        }
    }

    let upcomingVisits = rawVisitsData.filter(v => {
        if(v.status !== 'Scheduled') return false;
        let diffDays = Math.ceil((new Date(v.visitDate) - today) / (1000 * 60 * 60 * 24));
        return diffDays >= 0 && diffDays <= 2;
    });
    if(upcomingVisits.length > 0) {
        alertBadgeCount += upcomingVisits.length;
        html += `<div class="alert-card yellow"><h4 style="margin:0 0 5px 0; color:#a16207;">🚗 Upcoming Visits</h4><p style="margin:0; font-size:0.9rem;">You have <b>${upcomingVisits.length}</b> dealer visits scheduled in the next 48 hours.</p></div>`;
    }

    let criticalStock = rawProdData.filter(p => p.pendingQty > (p.actualQty * 2) && p.pendingQty > 0);
    if(criticalStock.length > 0) {
        alertBadgeCount++;
        html += `<div class="alert-card red"><h4 style="margin:0 0 5px 0; color:#b91c1c;">⚠️ Factory Shortfall Alert</h4><p style="margin:0; font-size:0.9rem;"><b>${criticalStock.length}</b> items have critical pending quantities exceeding current stock levels.</p></div>`;
    }

    let targetsHit = 0;
    rawTargetsData.forEach(t => {
        let achieved = 0;
        rawOrderData.forEach(o => { if (isNameMatch(o.customerName, t.dealerName)) achieved += (o.schValue || 0); });
        if(achieved >= (t.total || 99999999) && t.total > 0) targetsHit++;
    });
    if(targetsHit > 0) {
        alertBadgeCount++;
        html += `<div class="alert-card green"><h4 style="margin:0 0 5px 0; color:#15803d;">🏆 Targets Achieved!</h4><p style="margin:0; font-size:0.9rem;"><b>${targetsHit}</b> dealers have crossed 100% of their financial targets. Great job!</p></div>`;
    }

    if(html === '') html = '<div style="text-align:center; padding:20px; color:#94a3b8;"><b>No active alerts. You are all caught up!</b></div>';
    
    if(document.getElementById('notifPanelContent')) document.getElementById('notifPanelContent').innerHTML = html;
    if(document.getElementById('bellBadge')) document.getElementById('bellBadge').innerText = alertBadgeCount;
}

// ==========================================
// 🚨 6. AUDIT LOGS & EXPENSES 🚨
// ==========================================
async function fetchAuditLogs() {
    try {
        const res = await fetch(`${API_URL}/audit`); const data = await res.json(); rawAuditData = data.logs || [];
        const tbody = document.getElementById('auditTableBody'); if(!tbody) return;
        document.getElementById('auditTableHead').innerHTML = `<tr><th>Timestamp</th><th>User</th><th>Action</th><th>Details</th></tr>`;
        let html = '';
        rawAuditData.forEach(a => {
            let dt = new Date(a.timestamp).toLocaleString();
            html += `<tr><td style="font-weight:700;">${dt}</td><td><span class="user-badge" style="margin:0;">${a.user}</span></td><td style="font-weight:900; color:var(--order-purple);">${a.action}</td><td style="color:#475569;">${a.details}</td></tr>`;
        });
        tbody.innerHTML = html;
    } catch(e) {}
}

async function fetchExpenses() {
    try {
        const res = await fetch(`${API_URL}/expenses`); const data = await res.json(); rawExpensesData = data.expenses || [];
        const tbody = document.getElementById('expenseTableBody'); if(!tbody) return;
        document.getElementById('expenseTableHead').innerHTML = `<tr><th>Date</th><th>Marketer</th><th>Category</th><th>Amount (₹)</th><th>Remarks</th><th>Status</th><th class="admin-only">Action</th></tr>`;
        let html = '';
        rawExpensesData.forEach(e => {
            let sColor = e.status === 'Approved' ? '#16a34a' : (e.status === 'Rejected' ? '#dc2626' : '#ea580c');
            html += `<tr><td>${e.date}</td><td style="font-weight:800;">${e.marketer}</td><td>${e.category}</td><td class="currency" style="color:#be123c;">${fmtMoney(e.amount)}</td><td>${e.remarks}</td><td><span style="background:${sColor}; color:white; padding:4px 8px; border-radius:4px; font-weight:800;">${e.status}</span></td><td class="admin-only">${e.status==='Pending' ? `<button class="btn-primary" style="padding:6px; background:#16a34a; width:auto;" onclick="updateExpenseStatus('${e._id}','Approved')">✔️</button> <button class="btn-primary" style="padding:6px; background:#dc2626; width:auto;" onclick="updateExpenseStatus('${e._id}','Rejected')">❌</button>` : `<button class="btn-delete" onclick="deleteRecord('expenses', '${e._id}')">Del</button>`}</td></tr>`;
        });
        tbody.innerHTML = html; applyRolePermissions();
    } catch(e) {}
}

if(document.getElementById('newExpenseForm')) {
    document.getElementById('newExpenseForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = { date: document.getElementById('eDate').value, category: document.getElementById('eCat').value, amount: document.getElementById('eAmount').value, remarks: document.getElementById('eRemarks').value, marketer: currentUsername };
        await fetch(`${API_URL}/expenses`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) }); showToast('Expense Submitted!'); e.target.reset(); document.getElementById('newExpenseForm').style.display='none'; fetchExpenses();
    });
}

async function updateExpenseStatus(id, status) { await fetch(`${API_URL}/expenses/${id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({status, user: currentUsername}) }); showToast('Status Updated'); fetchExpenses(); }

// ==========================================
// 🚨 7. INTERACTIVE CALENDAR & VISITS 🚨
// ==========================================
async function fetchVisits() {
    try {
        const res = await fetch(`${API_URL}/visits`); const data = await res.json(); rawVisitsData = data.visits || [];
        renderVisitsTable();
        renderCalendar();
    } catch(e) { console.error(e); }
}

function renderCalendar() {
    let calEl = document.getElementById('calendar'); if(!calEl) return;
    if(calendarInstance) calendarInstance.destroy();
    
    let events = rawVisitsData.map(v => ({
        title: `${v.dealerName} (${v.status})`,
        start: v.visitDate,
        color: v.status === 'Completed' || v.status === 'Noted' ? '#16a34a' : '#ea580c',
        extendedProps: { ...v }
    }));

    calendarInstance = new FullCalendar.Calendar(calEl, {
        initialView: 'dayGridMonth', height: 500, events: events,
        eventClick: function(info) {
            let p = info.event.extendedProps;
            Swal.fire({ title: p.dealerName, html: `<b>Date:</b> ${p.visitDate}<br><b>Phone:</b> ${p.phone||'-'}<br><b>Address:</b> ${p.address||'-'}<br><b>Purpose:</b> ${p.purpose||'-'}<br><br><b>Status:</b> ${p.status}`, icon: 'info' });
        }
    });
    calendarInstance.render();
}

function renderVisitsTable() {
    const tbody = document.getElementById('visitsTableBody'); if(!tbody) return;
    if(document.getElementById('visitsTableHead')) document.getElementById('visitsTableHead').innerHTML = `<tr><th>Visit Date</th><th>Dealer / Customer</th><th>Phone</th><th>Address</th><th>Purpose</th><th>Status</th><th>Map</th><th class="admin-only">Del</th></tr>`;
    let html = '';
    rawVisitsData.forEach(v => {
        let statusColor = v.status === 'Completed' || v.status === 'Noted' ? '#16a34a' : '#ea580c';
        html += `<tr><td style="font-weight:800;">${v.visitDate}</td><td style="font-weight:800; color:#1e40af;">${v.dealerName}</td><td><a href="tel:${v.phone}">${v.phone}</a></td><td>${v.address}</td><td style="white-space:normal; max-width:200px;">${v.purpose}</td><td><span style="background:${statusColor}; color:white; padding:4px 8px; border-radius:4px; font-size:0.8rem; font-weight:800;">${v.status}</span></td><td>${v.mapLink ? `<a href="${v.mapLink}" target="_blank" style="color:#2563eb; text-decoration:none;">🗺️ Open</a>` : '-'}</td><td class="admin-only"><button class="btn-delete" onclick="deleteRecord('visits', '${v._id}')">X</button></td></tr>`;
    });
    tbody.innerHTML = html; applyRolePermissions(); 
}

if(document.getElementById('newVisitForm')) {
    document.getElementById('newVisitForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = { visitDate: document.getElementById('vDate').value, dealerName: document.getElementById('vName').value, phone: document.getElementById('vPhone').value, address: document.getElementById('vAddress').value, mapLink: document.getElementById('vMap').value, purpose: document.getElementById('vPurpose').value, createdBy: currentUsername };
        await fetch(`${API_URL}/visits`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) }); showToast('Visit Scheduled successfully!'); e.target.reset(); document.getElementById('newVisitForm').style.display='none';
        fetchVisits();
    });
}

function checkNotifications() {
    const today = new Date(); today.setHours(0,0,0,0);
    if(!rawVisitsData) return;
    let upcomingVisit = rawVisitsData.find(v => {
        if(v.status !== 'Scheduled') return false;
        let diffDays = Math.ceil((new Date(v.visitDate) - today) / (1000 * 60 * 60 * 24));
        return diffDays >= 0 && diffDays <= 2;
    });

    if (upcomingVisit) {
        const modal = document.getElementById('notificationModal'); const content = document.getElementById('notificationContent'); if(!modal || !content) return;
        let daysStr = "TODAY"; let diffDays = Math.ceil((new Date(upcomingVisit.visitDate) - today) / (1000 * 60 * 60 * 24));
        if(diffDays === 1) daysStr = "TOMORROW"; else if (diffDays === 2) daysStr = "IN 2 DAYS";

        content.innerHTML = `<div class="notification-header" style="position:relative;"><button onclick="document.getElementById('notificationModal').style.display='none'" style="position:absolute; top:15px; right:15px; background:transparent; border:none; font-size:1.5rem; cursor:pointer;" title="Close Temporarily">❌</button><h2 style="margin:0; color:#854d0e;">⚠️ Upcoming Visit Alert</h2><div style="font-weight:900; color:#b45309; font-size:1.2rem; margin-top:5px;">${daysStr} (${upcomingVisit.visitDate})</div></div><div class="notification-body"><p style="font-size:1.5rem; color:#1e40af;">${upcomingVisit.dealerName}</p><p><b>Phone:</b> ${upcomingVisit.phone || '-'}</p><p><b>Address:</b> ${upcomingVisit.address || '-'}</p><p><b>Purpose:</b> ${upcomingVisit.purpose || '-'}</p><div style="margin-top:20px; display:flex; gap:10px;"><button class="btn-primary" style="background:#16a34a;" onclick="markVisitNoted('${upcomingVisit._id}')">✅ Mark as Noted & Close</button>${upcomingVisit.mapLink ? `<a href="${upcomingVisit.mapLink}" target="_blank" class="btn-primary" style="background:#2563eb; text-decoration:none; text-align:center;">🗺️ Open Map</a>` : ''}</div></div>`;
        modal.style.display = 'flex';
    }
}

async function markVisitNoted(id) {
    await fetch(`${API_URL}/visits/${id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({status: 'Noted'}) });
    document.getElementById('notificationModal').style.display = 'none';
    fetchVisits();
}

function checkPaymentOverdue() {
    if(currentUserRole !== 'ADMIN') return;
    const today = new Date();
    let overdueList = '';
    rawOrderData.forEach(o => {
        if(o.dispatchQty > 0) {
            let due = (o.dispatchValue || 0) - (o.paidAmount || 0);
            if(due > 0) {
                let dDate = o.bookingDate ? new Date(o.bookingDate) : new Date(o.createdAt);
                let diffDays = Math.floor((today - dDate) / (1000 * 60 * 60 * 24));
                if(diffDays > 45) {
                    let phone = '';
                    let dMatch = currentDealersData.find(d => isNameMatch(d.data.Name, o.customerName));
                    if(dMatch && dMatch.data.Number) {
                        phone = String(dMatch.data.Number).replace(/[^0-9]/g, '');
                        if(phone.length === 10) phone = '91' + phone;
                    }
                    let waBtn = phone ? `<a href="https://wa.me/${phone}?text=Hello,%20this%20is%20a%20reminder%20that%20your%20payment%20of%20Rs.${due}%20for%20invoice%20${o.bookingNumber}%20is%20now%20overdue%20by%20${diffDays}%20days." target="_blank" style="background:#25d366; color:white; padding:4px 8px; border-radius:4px; font-size:0.8rem; text-decoration:none; font-weight:800; float:right;">💬 WhatsApp Reminder</a>` : '';
                    overdueList += `<div style="border-bottom:1px solid #e2e8f0; padding:10px 0;"><span style="font-weight:900; color:#1e40af;">${o.customerName}</span> ${waBtn}<br>Booking: ${o.bookingNumber} | <span style="color:#b91c1c; font-weight:800;">Due: ₹${fmtNum(due)}</span> | <span style="color:#ea580c; font-weight:bold;">${diffDays} Days Overdue</span></div>`;
                }
            }
        }
    });

    if(overdueList && document.getElementById('paymentAlertModal')) {
        document.getElementById('overdueListContent').innerHTML = overdueList;
        document.getElementById('paymentAlertModal').style.display = 'flex';
    }
}

// ==========================================
// 🚨 8. DAILY REPORTS ENGINE 🚨
// ==========================================
function exportReportsToExcel() {
    let tOrdQty = document.getElementById('repOrdersQty') ? document.getElementById('repOrdersQty').innerText : '0';
    let tOrdVal = document.getElementById('repOrdersVal') ? document.getElementById('repOrdersVal').innerText.replace('Value: ', '') : '0';
    let tDespQty = document.getElementById('repSalesQty') ? document.getElementById('repSalesQty').innerText : '0';
    let tDespVal = document.getElementById('repSalesVal') ? document.getElementById('repSalesVal').innerText.replace('Value: ', '') : '0';
    let tVisits = document.getElementById('repVisits') ? document.getElementById('repVisits').innerText : '0';
    let tOpen = document.getElementById('repOpen') ? document.getElementById('repOpen').innerText : '0';

    let csv = "REPORT,VALUE\n";
    csv += `"Date","${new Date().toISOString().substring(0,10)}"\n`;
    csv += `"Orders Placed Today (Qty)","${tOrdQty}"\n`;
    csv += `"Orders Placed Today (Val)","${tOrdVal}"\n`;
    csv += `"Sales Dispatched Today (Qty)","${tDespQty}"\n`;
    csv += `"Sales Dispatched Today (Val)","${tDespVal}"\n`;
    csv += `"Visits Scheduled Today","${tVisits}"\n`;
    csv += `"Deals Open (Pending Val)","${tOpen}"\n`;

    const a = document.createElement("a"); 
    a.href = URL.createObjectURL(new Blob(["\uFEFF"+csv], {type:'text/csv;charset=utf-8;'})); 
    a.download = `Precifast_Daily_Report_${new Date().toISOString().substring(0,10)}.csv`; 
    a.click(); 
    showToast('Daily Report Downloaded!');
}

function updateDailyReports() {
    const todayStr = new Date().toISOString().substring(0,10);
    let tOrdQty = 0, tOrdVal = 0, tDespQty = 0, tDespVal = 0, pendingVal = 0;

    if (rawOrderData) {
        rawOrderData.forEach(o => {
            if ((o.createdAt && String(o.createdAt).startsWith(todayStr)) || (o.bookingDate && String(o.bookingDate).startsWith(todayStr))) { tOrdQty += (o.orderQty || 0); tOrdVal += (o.schValue || 0); pendingVal += (o.pendingDispatchValue || 0); }
        });
    }
    if (rawSalesData) {
        rawSalesData.forEach(s => {
            if ((s.createdAt && String(s.createdAt).startsWith(todayStr)) || (s.date && String(s.date).startsWith(todayStr))) { tDespQty += (s.quantity || 0); tDespVal += (s.value || 0); }
        });
    }
    let visitsToday = rawVisitsData ? rawVisitsData.filter(v => v.visitDate === todayStr).length : 0;

    if(document.getElementById('repOrdersQty')) document.getElementById('repOrdersQty').innerText = `${fmtNum(tOrdQty)} Pcs`;
    if(document.getElementById('repOrdersVal')) document.getElementById('repOrdersVal').innerText = `Value: ₹${fmtMoney(tOrdVal)}`;
    if(document.getElementById('repSalesQty')) document.getElementById('repSalesQty').innerText = `${fmtNum(tDespQty)} Pcs`;
    if(document.getElementById('repSalesVal')) document.getElementById('repSalesVal').innerText = `Value: ₹${fmtMoney(tDespVal)}`;
    if(document.getElementById('repVisits')) document.getElementById('repVisits').innerText = visitsToday;
    if(document.getElementById('repClosed')) document.getElementById('repClosed').innerText = `₹${fmtMoney(tDespVal)}`;
    if(document.getElementById('repOpen')) document.getElementById('repOpen').innerText = `₹${fmtMoney(pendingVal)}`;
}

// ==========================================
// 🚨 9. SYSTEM ACTIONS (DELETE / WIPE) 🚨
// ==========================================
async function clearTodaysEntries() {
    if(!confirm("⚠️ Are you sure you want to delete all Excel Uploads and Manual Entries made TODAY? This will not affect historical data.")) return;
    try {
        const res = await fetch(`${API_URL}/clear-daily?user=${currentUsername}`, { method: 'DELETE' }); const result = await res.json(); showToast(result.message);
        bootSystem();
    } catch(e) { showToast("Failed to clear daily entries.", "error"); }
}

async function deleteEntireMonth(module) {
    let activeMonth = module === 'sales' ? activeSalesMonth : (module === 'order' ? activeOrderMonth : activeProdMonth);
    if (activeMonth === 'ALL' || !activeMonth) return;
    if (!confirm(`⚠️ WARNING: Delete ALL data for ${activeMonth}?`)) return;
    
    // FIX 4a: Route translation
    let endpoint = module === 'production' ? 'production-market' : module; 
    
    try { 
        await fetch(`${API_URL}/${endpoint}/month/${activeMonth}`, { method: 'DELETE' }); 
        showToast(`${activeMonth} data deleted successfully.`); 
        if (module === 'sales') fetchSales(); else if (module === 'order') fetchOrders(); else if (module === 'production') fetchProduction(); 
    } catch (e) { showToast('Failed to delete month.', 'error'); }
}

async function deleteRecord(module, id) { 
    if(!confirm('Delete this record?')) return; 
    
    // FIX 4b: Route translation
    let endpoint = module === 'production' ? 'production-market' : module;
    
    await fetch(`${API_URL}/${endpoint}/${id}?user=${currentUsername}`, { method: 'DELETE' }); 
    showToast('Record Deleted'); 
    if (module === 'sales') fetchSales(); else if (module === 'orders') fetchOrders(); else if (module === 'production') fetchProduction(); else if (module === 'targets') fetchTargets(); else if (module === 'freight') fetchFreight(); else if (module === 'visits') fetchVisits(); else if (module === 'expenses') fetchExpenses(); else fetchDealers();
}

// ==========================================
// 🚨 10. DEALER CRM LOGIC 🚨
// ==========================================
function changeDealerCategory() { currentDealerCategory = document.getElementById('dealerCatSelect').value; fetchDealers(); }

if(document.getElementById('dealerSearch')) document.getElementById('dealerSearch').addEventListener('input', (e) => { currentDealerSearch = e.target.value; fetchDealers(); });

function colorCodeInput(inp) {
    inp.classList.remove('input-g', 'input-y', 'input-b'); let v = inp.value.trim().toUpperCase();
    if (v === 'G') inp.classList.add('input-g'); else if (v === 'Y') inp.classList.add('input-y'); else if (v === 'B') inp.classList.add('input-b');
}

// Add a memory flag to track if we already downloaded the data
window.hasFetchedDealerData = false;

async function fetchDealers() {
    try {
        const wrapper = document.getElementById('dealerGridWrapper');
        if (wrapper && (!rawDealersData || rawDealersData.length === 0)) {
            wrapper.innerHTML = '<div style="padding:20px; font-weight:bold; color:#2563eb; text-align: center; font-size: 18px;">⚡ Fast-Syncing Dealers... Please wait.</div>';
        }

        // 1. 🚀 THE NETWORK FIX: Only fetch Dealers, don't re-fetch everything!
        if (!window.hasFetchedDealerData || !rawDealersData || rawDealersData.length === 0) {
            const dRes = await fetch(`${API_URL}/dealers/Master Sheet`);
            const dJson = await dRes.json();
            rawDealersData = dJson.dealers || [];
            window.hasFetchedDealerData = true; // Mark as downloaded!
            populateCustomerDropdown();
        }

        // 2. 🚀 INSTANT RAM FILTERING (Zero Network Delay)
        let filteredDealers = rawDealersData;

        // Apply Category Dropdown Filter instantly
        if (currentDealerCategory && currentDealerCategory !== 'Master Sheet') {
            let cat = currentDealerCategory.toUpperCase();
            if (cat === 'DEALERS' || cat === 'ACTIVE') {
                filteredDealers = filteredDealers.filter(d => d.status === 'ACTIVE');
            } else if (cat === 'INACTIVE') {
                filteredDealers = filteredDealers.filter(d => d.status === 'INACTIVE');
            } else {
                filteredDealers = filteredDealers.filter(d => (d.category && d.category.toUpperCase() === cat) || d.status === cat);
            }
        }

        // Apply Search Box Filter instantly
        if (currentDealerSearch) {
            let s = currentDealerSearch.toLowerCase();
            filteredDealers = filteredDealers.filter(d => {
                let name = (d.data && d.data.Name) ? String(d.data.Name).toLowerCase() : '';
                let city = (d.data && d.data.City) ? String(d.data.City).toLowerCase() : '';
                return name.includes(s) || city.includes(s);
            });
        }

        // Update Active/Inactive Counts
        let aCount = filteredDealers.filter(d => d.status === 'ACTIVE').length; 
        let iCount = filteredDealers.filter(d => d.status === 'INACTIVE').length;
        if(document.getElementById('countActive')) document.getElementById('countActive').innerText = aCount; 
        if(document.getElementById('countInactive')) document.getElementById('countInactive').innerText = iCount;

        // Sort Alphabetically
        filteredDealers.sort((a, b) => { 
            let nameA = (a.data && a.data.Name) ? String(a.data.Name).toUpperCase() : ''; 
            let nameB = (b.data && b.data.Name) ? String(b.data.Name).toUpperCase() : ''; 
            return nameA.localeCompare(nameB); 
        });
        
        currentDealersData = filteredDealers;
        
        // Extract Dynamic Excel Columns
        let dynHeaders = new Set(); 
        filteredDealers.forEach(d => { if(d.data) Object.keys(d.data).forEach(k => { if(k && k!=='undefined' && !k.includes('__EMPTY')) dynHeaders.add(k); }); });
        let baseCols = ['Name', 'Seg', 'Connect', 'Visit', 'Business', 'Payment', 'Response', 'G', 'Y', 'B', 'Person', 'Number', 'Email', 'Address', 'City', 'State', 'Remarks'];
        currentDealerColumns = []; 
        baseCols.forEach(c => { let match = Array.from(dynHeaders).find(h => h.toLowerCase() === c.toLowerCase()); if (match) { currentDealerColumns.push(match); dynHeaders.delete(match); } }); 
        Array.from(dynHeaders).forEach(c => currentDealerColumns.push(c)); 
        
        // 3. 🚀 THE UI RENDER FIX: Only draw 100 cards at a time to prevent freezing!
        let visibleDealers = filteredDealers.slice(0, 100);

        let html = '<div class="dealer-grid">';
        visibleDealers.forEach((d) => { 
            let c = d.status === 'ACTIVE' ? 'status-active' : 'status-inactive'; 
            const isInactive = d.status === 'INACTIVE'; 
            const cardBg = isInactive ? 'background:#fee2e2; border-color:#fca5a5;' : '';
            let dName = (d.data && d.data.Name) ? String(d.data.Name) : 'Unknown Dealer'; 
            let location = [d.data.City, d.data.State].filter(Boolean).join(', ') || 'No Location Provided';
            let gybHtml = '';
            
            ['G', 'Y', 'B'].forEach(key => { 
                let v = String(d.data[key] || '').toUpperCase(); 
                if(v === 'G') gybHtml += '<span class="color-block block-g" style="width:22px;height:22px;font-size:0.75rem;margin-right:6px;display:inline-flex;align-items:center;justify-content:center;background:#16a34a;color:white;border-radius:4px;">G</span>'; 
                if(v === 'Y') gybHtml += '<span class="color-block block-y" style="width:22px;height:22px;font-size:0.75rem;margin-right:6px;display:inline-flex;align-items:center;justify-content:center;background:#eab308;color:white;border-radius:4px;">Y</span>'; 
                if(v === 'B') gybHtml += '<span class="color-block block-b" style="width:22px;height:22px;font-size:0.75rem;margin-right:6px;display:inline-flex;align-items:center;justify-content:center;background:#3b82f6;color:white;border-radius:4px;">B</span>'; 
            });

            html += `<div class="dealer-card" style="${cardBg}" onclick="openDealerProfile('${d._id}')">
                <button class="status-badge ${c}">${d.status}</button>
                <div><h3 style="${isInactive ? 'color:#991b1b;' : ''}">${escapeHtml(dName)}</h3><p class="location" style="${isInactive ? 'color:#b91c1c;' : ''}">📍 ${escapeHtml(location)}</p><div style="margin-top:10px;">${gybHtml}</div></div>
                <button class="btn-delete admin-only" onclick="event.stopPropagation(); deleteRecord('dealers', '${d._id}')">Delete</button>
            </div>`;
        });
        html += '</div>';

        // Add a smart message if there are hidden cards
        if (filteredDealers.length > 100) {
            html += `<div style="text-align: center; padding: 20px; color: #64748b; font-weight: bold; background: white; border-radius: 8px; margin-top: 20px; border: 1px solid var(--border);">+ ${filteredDealers.length - 100} more dealers hidden for speed. Use the search bar to find them instantly!</div>`;
        }

        if(document.getElementById('dealerGridWrapper')) document.getElementById('dealerGridWrapper').innerHTML = html;
        if(typeof applyRolePermissions === 'function') applyRolePermissions();

    } catch (err) { 
        console.error(err); 
        if(document.getElementById('dealerGridWrapper')) document.getElementById('dealerGridWrapper').innerHTML = '<div style="padding:20px; color:red; font-weight:bold;">❌ Failed to load Master Database.</div>';
    }
}

function openDealerProfile(id) {
    currentProfileDealerId = id;
    const dealer = currentDealersData.find(d => d._id === id); if(!dealer) return;
    
    let dName = (dealer.data && dealer.data.Name) ? String(dealer.data.Name).trim() : 'Unknown Dealer'; 
    document.getElementById('profDealerName').innerText = dName;
    
    let c = dealer.status === 'ACTIVE' ? 'status-active' : 'status-inactive'; 
    document.getElementById('profStatusContainer').innerHTML = `<button class="status-badge ${c}" style="font-size:1rem; padding:8px 20px;" onclick="toggleDealerStatus('${dealer._id}', '${dealer.status}')">${dealer.status}</button>`;

    const fySet = new Set(); rawOrderData.forEach(o => { if(o.fy && o.fy !== 'Unknown') fySet.add(o.fy); });
    let tFYs = Array.from(fySet).sort().reverse();
    const profSelect = document.getElementById('profFySelector');
    if (profSelect) { profSelect.innerHTML = `<option value="ALL">🌎 All Time</option>` + tFYs.map(fy => `<option value="${fy}">${fy}</option>`).join(''); }

    updateDealerProfileStats();

    // The core, un-deletable system columns
    const baseCols = ['Name', 'Seg', 'Connect', 'Visit', 'Business', 'Payment', 'Response', 'G', 'Y', 'B', 'Person', 'Number', 'Email', 'Address', 'City', 'State', 'Remarks'];

    let formHtml = '';
    currentDealerColumns.forEach(col => {
        let val = String(dealer.data[col] || '').trim(); let colorClass = '';
        if(['G','Y','B'].includes(val.toUpperCase())) { if(val.toUpperCase() === 'G') colorClass = 'input-g'; if(val.toUpperCase() === 'Y') colorClass = 'input-y'; if(val.toUpperCase() === 'B') colorClass = 'input-b'; }
        
        let isCustom = !baseCols.includes(col);
        // 🚀 Add the Delete Button for custom fields!
        let deleteBtnHtml = isCustom ? `<button type="button" onclick="removeDealerField('${col}')" title="Delete this field" style="background: #fee2e2; color: #dc2626; border: 1px solid #fca5a5; border-radius: 4px; padding: 2px 6px; font-size: 10px; cursor: pointer; float: right; font-weight: bold; transition: 0.2s;" onmouseover="this.style.background='#fca5a5'" onmouseout="this.style.background='#fee2e2'">🗑️ Del</button>` : '';

        formHtml += `
        <div class="form-group ${col === 'Name' || col === 'Remarks' || col === 'Address' ? 'full' : 'third'}" id="fieldGroup_${col.replace(/\s+/g, '')}">
            <label>${col} ${deleteBtnHtml}</label>
            <input type="text" id="editProf_${col}" name="${col}" value="${escapeHtml(val)}" class="${colorClass}" oninput="colorCodeInput(this)">
        </div>`;
    });
    document.getElementById('dealerProfileFields').innerHTML = formHtml;

    document.getElementById('dealerProfileForm').onsubmit = async function(e) {
        e.preventDefault(); 
        let updatedData = {};
        
        // 🚀 CRITICAL FIX: Grab ALL text boxes dynamically (both global and local!)
        const inputs = document.querySelectorAll('#dealerProfileFields input[type="text"]');
        inputs.forEach(inputEl => {
            let col = inputEl.name;
            let inputVal = inputEl.value.trim(); 
            if (['g','y','b'].includes(inputVal.toLowerCase()) && inputVal.length === 1) inputVal = inputVal.toUpperCase(); 
            if (inputVal !== '') updatedData[col] = inputVal; 
        });
        
        await fetch(`${API_URL}/dealers/${dealer._id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({data: updatedData}) }); 
        showToast('Dealer Profile Saved Successfully!'); 
        fetchDealers(); 
    };

    document.getElementById('dealerListView').style.display = 'none'; document.getElementById('dealerDetailView').style.display = 'block';
}

// 🚀 BEAUTIFUL MODAL TRIGGERS
// 🚀 BEAUTIFUL MODAL TRIGGERS (Bulletproof Dropdown Fix)
function addCustomFieldToProfile() {
    document.getElementById('customFieldNameInput').value = ''; 
    
    // 1. Safely grab the exact name of the dealer you are currently looking at
    const dNameElement = document.getElementById('profDealerName');
    const dName = dNameElement ? dNameElement.innerText.trim() : 'this Dealer';
    
    // 2. FORCE-REBUILD the dropdown options so it guarantees the name appears!
    const scopeSelect = document.getElementById('customFieldScope');
    if (scopeSelect) {
        scopeSelect.innerHTML = `
            <option value="local">👤 Only for ${dName}</option>
            <option value="global">🌎 All Dealers (Global Database)</option>
        `;
    }
    
    // 3. Show the modal
    document.getElementById('customFieldModal').style.display = 'flex';
    setTimeout(() => document.getElementById('customFieldNameInput').focus(), 100);
}

function confirmAddCustomField() {
    const fieldName = document.getElementById('customFieldNameInput').value.trim();
    const scope = document.getElementById('customFieldScope').value;
    
    if (!fieldName) {
        showToast("⚠️ Field name cannot be empty!", "error");
        return;
    }

    const cleanName = fieldName;
    const container = document.getElementById('dealerProfileFields');
    
    // Ensure we don't duplicate boxes
    if (document.getElementById(`editProf_${cleanName}`)) {
        showToast("⚠️ This field already exists!", "error");
        return;
    }

    // If Global, add to the tracking array so it persists for everyone
    if (scope === 'global') {
        if (!currentDealerColumns.includes(cleanName)) currentDealerColumns.push(cleanName);
    }
    
    let deleteBtnHtml = `<button type="button" onclick="removeDealerField('${cleanName}')" title="Delete this field" style="background: #fee2e2; color: #dc2626; border: 1px solid #fca5a5; border-radius: 4px; padding: 2px 6px; font-size: 10px; cursor: pointer; float: right; font-weight: bold; transition: 0.2s;" onmouseover="this.style.background='#fca5a5'" onmouseout="this.style.background='#fee2e2'">🗑️ Del</button>`;
    
    // Build the new input box visually with a cool animation and highlighted colors
    const newFieldHtml = `
        <div class="form-group third" id="fieldGroup_${cleanName.replace(/\s+/g, '')}" style="animation: fadeIn 0.4s;">
            <label style="color: #0ea5e9;">${escapeHtml(cleanName)} ${scope === 'local' ? '<span style="font-size:9px; background:#e0f2fe; padding:2px 4px; border-radius:3px;">LOCAL</span>' : '<span style="font-size:9px; background:#f1f5f9; color:#64748b; padding:2px 4px; border-radius:3px;">GLOBAL</span>'} ${deleteBtnHtml}</label>
            <input type="text" id="editProf_${cleanName}" name="${cleanName}" value="" placeholder="Enter ${escapeHtml(cleanName)}..." style="border-color: #0ea5e9; border-width: 2px; background: #f0f9ff; box-shadow: 0 2px 4px rgba(14,165,233,0.1);">
        </div>
    `;
    
    // Inject it onto the screen instantly
    container.insertAdjacentHTML('beforeend', newFieldHtml);
    
    document.getElementById('customFieldModal').style.display = 'none';
    showToast(`✅ ${scope === 'global' ? 'Global' : 'Local'} field added. Click 'Save' to finalize.`);

    // Auto-focus the new box so you can start typing immediately
    setTimeout(() => {
        const el = document.getElementById(`editProf_${cleanName}`);
        if(el) el.focus();
    }, 100);
}

// 🚀 REMOVE FIELD FUNCTIONALITY
function removeDealerField(colName) {
    if(!confirm(`Are you sure you want to remove the "${colName}" field from this dealer?`)) return;
    
    // Remove the HTML Element from the screen
    const group = document.getElementById(`fieldGroup_${colName.replace(/\s+/g, '')}`);
    if(group) group.remove();
    
    showToast(`🗑️ ${colName} removed. Click 'Save Dealer Profile' to finalize!`);
}

window.addCustomFieldToProfile = addCustomFieldToProfile;
window.confirmAddCustomField = confirmAddCustomField;
window.removeDealerField = removeDealerField;

// Ensure the new function is accessible to the HTML button


function updateDealerProfileStats() {
    const dealer = currentDealersData.find(d => d._id === currentProfileDealerId);
    if(!dealer) return;
    let dName = (dealer.data && dealer.data.Name) ? String(dealer.data.Name).trim() : 'Unknown Dealer';
    let selFY = document.getElementById('profFySelector') ? document.getElementById('profFySelector').value : 'ALL';

    let dTarget = 0, dOrdQty = 0, dDespQty = 0, dSalesVal = 0; 
    let fyStats = {}; let productStats = {};

    if (dName) {
        rawTargetsData.forEach(t => { if (isNameMatch(t.dealerName, dName)) dTarget += (t.total || 0); });
        rawOrderData.forEach(o => { 
            if (isNameMatch(o.customerName, dName)) { 
                let fy = o.fy || 'Unknown'; if(!fyStats[fy]) fyStats[fy] = { orders: 0, sales: 0 }; fyStats[fy].orders += (o.orderQty || 0);
                if (selFY === 'ALL' || selFY === o.fy) {
                    dOrdQty += (o.orderQty || 0); dDespQty += (o.dispatchQty || 0); 
                    let pCode = o.partCode || 'Unknown'; if(!productStats[pCode]) productStats[pCode] = { desc: o.description || '', ordered: 0 }; productStats[pCode].ordered += (o.orderQty || 0);
                }
            } 
        });
        rawSalesData.forEach(s => { 
            if (isNameMatch(s.customerName, dName)) { 
                let fy = s.fy || 'Unknown'; if(!fyStats[fy]) fyStats[fy] = { orders: 0, sales: 0 }; fyStats[fy].sales += (s.value || 0);
                if (selFY === 'ALL' || selFY === s.fy) { dSalesVal += (s.value || 0); }
            } 
        });
    }

    let targetTitle = selFY === 'ALL' ? 'Total Target (All Time)' : `Total Target`;
    document.getElementById('profPerformanceGrid').innerHTML = `<div class="metric-card indigo"><div class="metric-title">${targetTitle}</div><div class="metric-value">₹${fmtNum(dTarget)}</div></div><div class="metric-card purple"><div class="metric-title">Orders Placed ${selFY !== 'ALL' ? `(${selFY})` : ''}</div><div class="metric-value">${fmtNum(dOrdQty)} Pcs</div></div><div class="metric-card green"><div class="metric-title">Dispatch Completed ${selFY !== 'ALL' ? `(${selFY})` : ''}</div><div class="metric-value">${fmtNum(dDespQty)} Pcs</div></div><div class="metric-card orange"><div class="metric-title">Sales Revenue ${selFY !== 'ALL' ? `(${selFY})` : ''}</div><div class="metric-value">₹${fmtNum(dSalesVal)}</div></div>`;

    let fyHtml = `<table style="width:100%; border:1px solid var(--border); border-collapse:collapse; font-size:0.85rem;"><thead style="background:#f1f5f9;"><tr><th style="padding:10px; border-bottom:1px solid var(--border);">Financial Year</th><th style="padding:10px; border-bottom:1px solid var(--border);">Orders Placed (Qty)</th><th style="padding:10px; border-bottom:1px solid var(--border);">Sales Revenue (₹)</th></tr></thead><tbody>`;
    Object.keys(fyStats).sort().reverse().forEach(fy => { fyHtml += `<tr><td style="padding:10px; border-bottom:1px solid var(--border); font-weight:bold; color:var(--sales-blue);">${fy}</td><td style="padding:10px; border-bottom:1px solid var(--border); font-weight:800;">${fmtNum(fyStats[fy].orders)} Pcs</td><td style="padding:10px; border-bottom:1px solid var(--border); color:#16a34a; font-weight:900;">₹${fmtNum(fyStats[fy].sales)}</td></tr>`; }); fyHtml += `</tbody></table>`;
    
    let prodHtml = `<div style="max-height:200px; overflow-y:auto; border:1px solid var(--border); border-radius:8px;"><table style="width:100%; border-collapse:collapse; font-size:0.85rem;"><thead style="background:#f1f5f9; position:sticky; top:0;"><tr><th style="padding:10px; border-bottom:1px solid var(--border);">Part Code</th><th style="padding:10px; border-bottom:1px solid var(--border);">Description</th><th style="padding:10px; border-bottom:1px solid var(--border);">Ordered ${selFY !== 'ALL' ? `(${selFY})` : ''}</th></tr></thead><tbody>`;
    let sortedProds = Object.keys(productStats).map(k => ({ code: k, ...productStats[k] })).sort((a,b) => b.ordered - a.ordered);
    sortedProds.forEach(p => { prodHtml += `<tr><td style="padding:10px; border-bottom:1px solid var(--border);"><span class="part-code">${p.code}</span></td><td style="padding:10px; border-bottom:1px solid var(--border); white-space:normal;">${p.desc}</td><td style="padding:10px; border-bottom:1px solid var(--border); font-weight:800; color:var(--order-purple);">${fmtNum(p.ordered)}</td></tr>`; }); prodHtml += `</tbody></table></div>`;
    
    if(document.getElementById('profExtendedAnalytics')) document.getElementById('profExtendedAnalytics').innerHTML = `<div class="glass-card" style="padding:1.5rem; margin-bottom:0;"><h4 style="margin:0 0 15px 0; color:#1e293b; font-weight:900;">📅 Year-Wise Breakdown (All Time)</h4>${fyHtml}</div><div class="glass-card" style="padding:1.5rem; margin-bottom:0;"><h4 style="margin:0 0 15px 0; color:#1e293b; font-weight:900;">📦 Products Ordered Overview</h4>${prodHtml}</div>`;
}

function closeDealerProfile() { document.getElementById('dealerDetailView').style.display = 'none'; document.getElementById('dealerListView').style.display = 'block'; }
async function toggleDealerStatus(id, curr) { const next = curr === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'; await fetch(`${API_URL}/dealers/${id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({status: next}) }); showToast('Status Updated'); fetchDealers(); if(document.getElementById('dealerDetailView').style.display === 'block') { setTimeout(() => openDealerProfile(id), 500); } }
function addColumn() { Swal.fire({ title: 'Add New Column', input: 'text', inputPlaceholder: 'Enter column name' }).then(async ({value: colName}) => { if(colName) { await fetch(`${API_URL}/dealers/columns/manage`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ category: currentDealerCategory, action: 'add', columnName: colName.trim(), user: currentUsername }) }); showToast('Column Added!'); fetchDealers(); } }); }
function deleteColumn() { Swal.fire({ title: 'Delete Column', input: 'text', inputPlaceholder: 'Enter exact column name to delete' }).then(async ({value: colName}) => { if(colName) { if(!confirm(`Are you sure you want to permanently delete the column "${colName}"?`)) return; await fetch(`${API_URL}/dealers/columns/manage`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ category: currentDealerCategory, action: 'delete', columnName: colName.trim(), user: currentUsername }) }); showToast('Column Deleted!'); fetchDealers(); } }); }

function exportDealersToExcel() { 
    if(currentDealersData.length === 0) return showToast("No data to export", "error"); 
    let dynHeaders = new Set(); currentDealersData.forEach(d => { if(d.data) Object.keys(d.data).forEach(k => { if(k && k!=='undefined' && !k.includes('__EMPTY')) dynHeaders.add(k); }); });
    let baseCols = ['Name', 'Seg', 'Connect', 'Visit', 'Business', 'Payment', 'Response', 'G', 'Y', 'B', 'Person', 'Number', 'Email', 'Address', 'City', 'State', 'Remarks'];
    let cols = []; baseCols.forEach(c => { let match = Array.from(dynHeaders).find(h => h.toLowerCase() === c.toLowerCase()); if (match) { cols.push(match); dynHeaders.delete(match); } }); Array.from(dynHeaders).forEach(c => cols.push(c)); 
    let headers = ['S.NO', 'STATUS', 'Name'].concat(cols.filter(c=>c!=='Name')); let csv = headers.join(",") + "\n"; 
    currentDealersData.forEach((d, i) => { let row = [i+1, d.status, d.data['Name']||''].concat(headers.slice(3).map(c => d.data[c]||'')); csv += row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",") + "\n"; }); 
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\uFEFF"+csv], {type:'text/csv;charset=utf-8;'})); a.download = currentDealerCategory.replace(/\s+/g,'_') + '_Export.csv'; a.click(); showToast('Export Started'); 
}

window.openDealerProfile = openDealerProfile; window.closeDealerProfile = closeDealerProfile; window.toggleDealerStatus = toggleDealerStatus; window.addColumn = addColumn; window.deleteColumn = deleteColumn; window.exportDealersToExcel = exportDealersToExcel; window.updateDealerProfileStats = updateDealerProfileStats;

// ==========================================
// 🚨 11. TARGETS LOGIC 🚨
// ==========================================
if(document.getElementById('targetSearch')) document.getElementById('targetSearch').addEventListener('input', () => { renderTargetsTable(); });
function editTargetCell(td, id, col) { if(td.querySelector('input')) return; const raw = td.getAttribute('data-raw'); td.innerHTML = `<input type="text" class="edit-input" style="width:100%; box-sizing:border-box;" value="${raw}" onkeydown="saveTargetCell(event,this,'${id}','${col}')" onblur="cancelTargetCell(this,'${raw}','${col}')">`; td.querySelector('input').focus(); }
function cancelTargetCell(inp, raw, col) { inp.parentElement.innerHTML = col.includes('q') || col === 'total' ? `₹${fmtNum(raw)}` : raw; }
async function saveTargetCell(e, inp, id, col) { if(e.key === 'Enter') { inp.onblur = null; let v = inp.value.trim(); await fetch(`${API_URL}/targets/${id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({[col]: v}) }); showToast('Target Updated'); fetchTargets(); } if(e.key === 'Escape') { inp.onblur = null; inp.parentElement.innerHTML = col.includes('q') || col === 'total' ? `₹${fmtNum(inp.getAttribute('value'))}` : inp.getAttribute('value'); } }

async function fetchTargets() {
    try {
        const tbody = document.getElementById('targetTableBody'); if (tbody) tbody.innerHTML = '<tr><td colspan="12" style="text-align:center; padding: 20px; font-weight:bold; color:#64748b;">Loading Target Data...</td></tr>';
        const [tRes, oRes] = await Promise.all([fetch(`${API_URL}/targets`), fetch(`${API_URL}/orders`)]); 
        const targetsObj = await tRes.json(); const ordersObj = await oRes.json();
        rawTargetsData = targetsObj.targets || []; targetOrdersData = (ordersObj.orders || []).map(o => ({ ...o, fy: getFY(o.date) }));
        const fySet = new Set(); targetOrdersData.forEach(o => { if(o.fy !== 'Unknown') fySet.add(o.fy); }); let tFYs = Array.from(fySet).sort().reverse(); if(tFYs.length === 0) tFYs = ['FY 2024-25', 'FY 2025-26'];
        const fySelect = document.getElementById('fySelectorTarget'); if (fySelect) { if (!activeTargetFY || !tFYs.includes(activeTargetFY)) activeTargetFY = tFYs[0]; fySelect.innerHTML = tFYs.map(fy => `<option value="${fy}" ${fy === activeTargetFY ? 'selected' : ''}>${fy}</option>`).join(''); }
        renderTargetsTable();
    } catch(e) { console.error(e); }
}

function renderTargetsTable() {
    const searchStr = document.getElementById('targetSearch') ? document.getElementById('targetSearch').value.toLowerCase() : '';
    let filteredData = rawTargetsData;
    if (searchStr) { filteredData = filteredData.filter(t => { return (t.dealerName && t.dealerName.toLowerCase().includes(searchStr)) || (t.territory && t.territory.toLowerCase().includes(searchStr)) || (t.discount && t.discount.toLowerCase().includes(searchStr)); }); }
    let currentFYOrders = targetOrdersData.filter(o => o.fy === activeTargetFY);

    if(document.getElementById('targetTableHead')) document.getElementById('targetTableHead').innerHTML = `<tr><th class="admin-only">Del</th><th>Dealer Name</th><th>Territory</th><th>Cr. Days</th><th>Discount</th><th>Total Target (₹)</th><th style="color:#10b981;">Achieved in ${activeTargetFY} (₹)</th><th>Q1</th><th>Q2</th><th>Q3</th><th>Q4</th><th>Remarks</th></tr>`;
    let html = '';
    filteredData.forEach(t => { 
        let achieved = 0; currentFYOrders.forEach(o => { if (o.customerName && t.dealerName && isNameMatch(o.customerName, t.dealerName)) { achieved += (o.schValue || 0); } });
        html += `<tr>
            <td style="text-align:center;" class="admin-only"><button class="btn-delete" onclick="deleteRecord('targets', '${t._id}')">X</button></td>
            <td class="editable-cell" style="font-weight:bold; color:#ff6b00;" onclick="editTargetCell(this, '${t._id}', 'dealerName')" data-raw="${escapeHtml(t.dealerName||'')}">${t.dealerName}</td>
            <td class="editable-cell" onclick="editTargetCell(this, '${t._id}', 'territory')" data-raw="${escapeHtml(t.territory||'')}">${t.territory||'-'}</td>
            <td class="editable-cell" onclick="editTargetCell(this, '${t._id}', 'creditDays')" data-raw="${t.creditDays||0}">${t.creditDays||0}</td>
            <td class="editable-cell" onclick="editTargetCell(this, '${t._id}', 'discount')" data-raw="${escapeHtml(t.discount||'')}">${t.discount||'-'}</td>
            <td class="editable-cell" style="font-weight:bold; font-size:1.1rem; color:#1e40af;" onclick="editTargetCell(this, '${t._id}', 'total')" data-raw="${t.total||0}">₹${fmtNum(t.total)}</td>
            <td style="font-weight:bold; font-size:1.1rem; color:#10b981;">₹${fmtNum(achieved)}</td>
            <td class="editable-cell" onclick="editTargetCell(this, '${t._id}', 'q1')" data-raw="${t.q1||0}">₹${fmtNum(t.q1)}</td>
            <td class="editable-cell" onclick="editTargetCell(this, '${t._id}', 'q2')" data-raw="${t.q2||0}">₹${fmtNum(t.q2)}</td>
            <td class="editable-cell" onclick="editTargetCell(this, '${t._id}', 'q3')" data-raw="${t.q3||0}">₹${fmtNum(t.q3)}</td>
            <td class="editable-cell" onclick="editTargetCell(this, '${t._id}', 'q4')" data-raw="${t.q4||0}">₹${fmtNum(t.q4)}</td>
            <td class="editable-cell" style="max-width: 250px; white-space: normal;" onclick="editTargetCell(this, '${t._id}', 'remarks')" data-raw="${escapeHtml(t.remarks||'')}">${t.remarks||'-'}</td>
        </tr>`; 
    });
    if(document.getElementById('targetTableBody')) document.getElementById('targetTableBody').innerHTML = html;
    applyRolePermissions();
}

window.editTargetCell = editTargetCell; window.cancelTargetCell = cancelTargetCell; window.saveTargetCell = saveTargetCell; window.fetchTargets = fetchTargets; window.renderTargetsTable = renderTargetsTable;

// ==========================================
// 🚨 12. SALES COMMAND CENTER LOGIC 🚨
// ==========================================
if(document.getElementById('salesSearch')) document.getElementById('salesSearch').addEventListener('input', () => { renderSalesTable(); });
if(document.getElementById('salesFromDate')) document.getElementById('salesFromDate').addEventListener('change', () => { renderSalesTable(); });
if(document.getElementById('salesToDate')) document.getElementById('salesToDate').addEventListener('change', () => { renderSalesTable(); });

async function fetchSales() {
    try {
        const tbody = document.getElementById('salesTableBody'); if (tbody) tbody.innerHTML = '<tr><td colspan="12" style="text-align:center; padding: 20px; font-weight:bold; color:#64748b;">Loading Sales Data...</td></tr>';
        const res = await fetch(`${API_URL}/sales`); const { sales } = await res.json();
        rawSalesData = sales.map(s => { updateMasterDictionary(s); return { ...s, fy: getFY(s.date) }; });
        
        const fySet = new Set(); rawSalesData.forEach(s => { if(s.fy !== 'Unknown') fySet.add(s.fy); }); let salesFYs = Array.from(fySet).sort().reverse();
        const fySelect = document.getElementById('fySelector');
        if (salesFYs.length > 0 && fySelect) { if (!activeSalesFY || !salesFYs.includes(activeSalesFY)) activeSalesFY = salesFYs[0]; fySelect.innerHTML = salesFYs.map(fy => `<option value="${fy}" ${fy === activeSalesFY ? 'selected' : ''}>${fy}</option>`).join(''); } 
        renderSalesTabs();

        // 🚀 THE FIX: Force the Daily Snapshot to auto-recalculate the moment Sales data arrives!
        if(typeof updateDailyReports === 'function') updateDailyReports();
    } catch(e) { console.error(e); }
}

function renderSalesTabs() {
    const months = new Set(); 
    rawSalesData.forEach(s => { 
        // 🚀 FIX: Keep building tabs even if ALL is selected
        if((activeSalesFY === 'ALL' || s.fy === activeSalesFY) && s.date) months.add(s.date.substring(0, 7)); 
    });
    
    let html = `<div class="excel-tab ${activeSalesMonth === 'ALL' ? 'active' : ''}" onclick="setMonth('sales', 'ALL')">🌎 Full Year</div>`;
    Array.from(months).sort().forEach(m => { 
        const dateObj = new Date(m + '-01'); 
        const monthName = `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][dateObj.getMonth()]}-${String(dateObj.getFullYear()).slice(-2)}`; 
        html += `<div class="excel-tab ${activeSalesMonth === m ? 'active' : ''}" onclick="setMonth('sales', '${m}')">📁 ${monthName}</div>`; 
    });
    
    if(document.getElementById('salesMonthTabs')) document.getElementById('salesMonthTabs').innerHTML = html;
    const delBtn = document.getElementById('deleteMonthBtn'); 
    if(delBtn) delBtn.style.display = (activeSalesMonth !== 'ALL') ? 'inline-block' : 'none';
    
    window.renderSalesTable(); // 🚀 Force UI render
}
window.salesCurrentPage = 1;
window.renderSalesTable = function() {
    const viewType = document.getElementById('salesViewFilter') ? document.getElementById('salesViewFilter').value : 'summary';
    
    // 🚀 BULLETPROOF FILTERING: Defaults to showing everything if variables are broken
    let filteredData = rawSalesData || [];
    if (window.activeSalesFY && window.activeSalesFY !== 'ALL') {
        filteredData = filteredData.filter(s => s.fy === window.activeSalesFY);
    }
    if (window.activeSalesMonth && window.activeSalesMonth !== 'ALL') {
        filteredData = filteredData.filter(s => s.date && s.date.startsWith(window.activeSalesMonth));
    }
    
    const searchStr = document.getElementById('salesSearch') ? document.getElementById('salesSearch').value.toUpperCase() : '';
    const fromDate = document.getElementById('salesFromDate') ? document.getElementById('salesFromDate').value : '';
    const toDate = document.getElementById('salesToDate') ? document.getElementById('salesToDate').value : '';

    if (fromDate) filteredData = filteredData.filter(s => s.date >= fromDate);
    if (toDate) filteredData = filteredData.filter(s => s.date <= toDate);
    if (searchStr) { 
        filteredData = filteredData.filter(s => `${s.partCode} ${s.description} ${s.customerName} ${s.date}`.toUpperCase().includes(searchStr)); 
    }

    let totalValue = 0, totalWeight = 0, html = ''; let monthlyRevAgg = {}, monthlyQtyAgg = {}; const partMap = {};
    filteredData.forEach(s => {
        totalValue += (s.value || 0); totalWeight += (s.totalWeight || 0);
        let m = s.date ? s.date.substring(0,7) : 'Unk'; monthlyRevAgg[m] = (monthlyRevAgg[m] || 0) + (s.value || 0); monthlyQtyAgg[m] = (monthlyQtyAgg[m] || 0) + (s.quantity || 0);
        const key = s.partCode || s.description; if(!partMap[key]) partMap[key] = { partCode: s.partCode, desc: s.description, wtPerPc: s.wtPerPc, qty:0, val:0, wt:0, months: new Set() };
        partMap[key].qty += (s.quantity || 0); partMap[key].val += (s.value || 0); partMap[key].wt += (s.totalWeight || 0); if(s.date) partMap[key].months.add(s.date.substring(0,7));
    });
    let sortedPartsByVal = Object.values(partMap).sort((a,b) => b.val - a.val);

    if(document.getElementById('salesTableHead')) {
        if (viewType === 'daily') {
            document.getElementById('salesTableHead').innerHTML = `<tr><th>Date</th><th>Customer</th><th>Part Code</th><th>Wt/Pc (g)</th><th>Quantity</th><th>Value (₹)</th><th class="admin-only">Del</th></tr>`;
            
            let pageSize = 100;
            let totalItems = filteredData.length;
            let totalPages = Math.ceil(totalItems / pageSize) || 1;
            if (window.salesCurrentPage > totalPages) window.salesCurrentPage = totalPages;
            
            let startIdx = (window.salesCurrentPage - 1) * pageSize;
            let endIdx = Math.min(startIdx + pageSize, totalItems);
            let visibleSales = filteredData.slice(startIdx, endIdx);

            visibleSales.forEach(s => { 
                html += `<tr><td style="font-weight:700;">${s.date}</td><td><strong style="color:#0ea5e9;">${s.customerName || 'Walk-in'}</strong></td><td><span class="part-code">${s.partCode || 'N/A'}</span></td><td>${fmtNum(s.wtPerPc)}</td><td>${fmtNum(s.quantity)}</td><td class="currency">${fmtMoney(s.value)}</td><td class="admin-only"><button class="btn-delete" onclick="deleteRecord('sales', '${s._id}')">X</button></td></tr>`; 
            });

            if (totalPages > 1) {
                let pDis = window.salesCurrentPage === 1 ? 'disabled style="opacity:0.5;"' : 'cursor:pointer; background:#64748b; color:white;"';
                let nDis = window.salesCurrentPage === totalPages ? 'disabled style="opacity:0.5;"' : 'cursor:pointer; background:#0ea5e9; color:white;"';
                html += `<tr><td colspan="7" style="text-align:center; padding:15px; background:#f8fafc;">
                    <button onclick="window.salesCurrentPage--; window.renderSalesTable();" style="padding:6px 15px; border:none; border-radius:4px; font-weight:bold; ${pDis}">⬅️ Prev</button>
                    <span style="font-weight:bold; margin: 0 15px;">Page ${window.salesCurrentPage} of ${totalPages}</span>
                    <button onclick="window.salesCurrentPage++; window.renderSalesTable();" style="padding:6px 15px; border:none; border-radius:4px; font-weight:bold; ${nDis}">Next ➡️</button>
                </td></tr>`;
            }
        } else {
            document.getElementById('salesTableHead').innerHTML = `<tr><th>Part Code</th><th>Description</th><th>Wt/Pc (g)</th><th>Total Qty Sold</th><th>Total Tonnage (KG)</th><th>Total Revenue (₹)</th></tr>`;
            sortedPartsByVal.forEach(data => { html += `<tr><td><span class="part-code">${data.partCode || 'N/A'}</span></td><td>${data.desc}</td><td>${fmtNum(data.wtPerPc)}</td><td>${fmtNum(data.qty)} Pcs</td><td style="font-weight:800; color:var(--sales-blue);">${fmtNum(data.wt)} KG</td><td class="currency" style="font-size:1rem;">${fmtMoney(data.val)}</td></tr>`; });
        }
        document.getElementById('salesTableBody').innerHTML = html || '<tr><td colspan="7" style="text-align:center; padding:20px; font-weight:bold; color:#64748b;">No Sales Data Found!</td></tr>';
        if(typeof applyRolePermissions === 'function') applyRolePermissions();
    }

    if(document.getElementById('totVal')) { document.getElementById('totVal').innerText = fmtMoney(totalValue); document.getElementById('totWt').innerText = fmtNum(totalWeight) + ' KG'; document.getElementById('avgReal').innerText = fmtMoney(totalWeight > 0 ? (totalValue / totalWeight) : 0) + ' / KG'; }
    if(sortedPartsByVal.length > 0) {
        if(document.getElementById('topProdVal')) document.getElementById('topProdVal').innerText = sortedPartsByVal[0].partCode || '-'; 
        let sortedByQty = [...sortedPartsByVal].sort((a,b) => b.qty - a.qty);
        if(document.getElementById('topProdQty')) document.getElementById('topProdQty').innerText = sortedByQty[0].partCode || '-';
    }

    if(typeof destroyChart === 'function') {
        destroyChart('monthlyRevChart'); destroyChart('monthlyQtyChart'); destroyChart('salesBarChart'); destroyChart('qtyBarChart');
        if(document.getElementById('monthlyRevChart') && document.getElementById('SalesDashboard').classList.contains('active')) {
            const top10Val = sortedPartsByVal.slice(0, 10); const top10Qty = [...sortedPartsByVal].sort((a,b) => b.qty - a.qty).slice(0, 10);
            const mKeys = Object.keys(monthlyRevAgg).sort(); const mLabels = mKeys.map(m => m.substring(5)); 
            chartInstances.monthlyRevChart = new Chart(document.getElementById('monthlyRevChart').getContext('2d'), { type: 'bar', data: { labels: mLabels, datasets: [{ label: 'Revenue', data: mKeys.map(m => monthlyRevAgg[m]), backgroundColor: '#ff6b00' }] }, options:{responsive:true, maintainAspectRatio:false} }); 
            chartInstances.monthlyQtyChart = new Chart(document.getElementById('monthlyQtyChart').getContext('2d'), { type: 'bar', data: { labels: mLabels, datasets: [{ label: 'Volume', data: mKeys.map(m => monthlyQtyAgg[m]), backgroundColor: '#8b5cf6' }] }, options:{responsive:true, maintainAspectRatio:false} }); 
            chartInstances.salesBarChart = new Chart(document.getElementById('salesBarChart').getContext('2d'), { type: 'bar', data: { labels: top10Val.map(d=>d.partCode), datasets: [{ label: 'Revenue', data: top10Val.map(d=>d.val), backgroundColor: '#2563eb' }] }, options:{responsive:true, maintainAspectRatio:false} }); 
            chartInstances.qtyBarChart = new Chart(document.getElementById('qtyBarChart').getContext('2d'), { type: 'bar', data: { labels: top10Qty.map(d=>d.partCode), datasets: [{ label: 'Volume', data: top10Qty.map(d=>d.qty), backgroundColor: '#10b981' }] }, options:{responsive:true, maintainAspectRatio:false} }); 
        }
    }

    let phtml = ''; let topPredictTable = [...sortedPartsByVal].sort((a,b) => b.qty - a.qty).slice(0, 50); 
    topPredictTable.forEach((p) => { let monthsActive = p.months.size || 1; let runRate = Math.round(p.qty / monthsActive); let recommendedBuild = Math.round(runRate * 1.5); let estValue = recommendedBuild * (p.qty > 0 ? (p.val / p.qty) : 0); phtml += `<tr><td><span class="part-code">${p.partCode || 'N/A'}</span></td><td>${p.desc}</td><td>${fmtNum(p.wtPerPc)}</td><td>${fmtNum(p.qty)}</td><td>${monthsActive}</td><td style="font-weight:700;">${fmtNum(runRate)} /mo</td><td style="background:#dcfce7; font-weight:900; color:#166534;">${fmtNum(recommendedBuild)}</td><td class="currency">${fmtMoney(estValue)}</td></tr>`; });
    if(document.getElementById('predictionsTableBody')) document.getElementById('predictionsTableBody').innerHTML = phtml;
};

window.fetchSales = async function() {
    try {
        const tbody = document.getElementById('salesTableBody'); 
        
        // 🚀 THE FIX: Only fetch from server if the RAM is completely empty!
        if (!rawSalesData || rawSalesData.length === 0) {
            if (tbody) tbody.innerHTML = '<tr><td colspan="12" style="text-align:center; padding: 20px; font-weight:bold; color:#64748b;">Loading Sales Data...</td></tr>';
            const res = await fetch(`${API_URL}/sales`); 
            const { sales } = await res.json();
            rawSalesData = sales.map(s => { 
                if(typeof updateMasterDictionary === 'function') updateMasterDictionary(s); 
                return { ...s, fy: typeof getFY === 'function' ? getFY(s.date) : 'Unknown' }; 
            });
        }
        
        const fySet = new Set(); rawSalesData.forEach(s => { if(s.fy && s.fy !== 'Unknown') fySet.add(s.fy); }); 
        let salesFYs = Array.from(fySet).sort().reverse();
        salesFYs.unshift('ALL');
        
        const fySelect = document.getElementById('fySelector');
        if (fySelect) { 
            if (!window.activeSalesFY || !salesFYs.includes(window.activeSalesFY)) window.activeSalesFY = 'ALL'; 
            fySelect.innerHTML = salesFYs.map(fy => `<option value="${fy}" ${fy === window.activeSalesFY ? 'selected' : ''}>${fy === 'ALL' ? '🌎 All Time' : fy}</option>`).join(''); 
        } 
        
        window.renderSalesTabs();
        if(typeof updateDailyReports === 'function') updateDailyReports();
    } catch(e) { console.error("Sales Fetch Error:", e); }
};

// ==========================================
// 🚨 13. ORDER COMPLIANCE & ACCOUNTS 🚨
// ==========================================
if(document.getElementById('orderSearch')) document.getElementById('orderSearch').addEventListener('input', () => { window.renderOrderTable(); });

async function fetchOrders() {
    try {
        const tbody = document.getElementById('orderTableBody'); 
        // Show loading ONLY if RAM is completely empty
        if (tbody && (!rawOrderData || rawOrderData.length === 0)) {
            tbody.innerHTML = '<tr><td colspan="27" style="text-align:center; padding: 20px; font-weight:bold; color:#007bff;">⏳ Syncing Accounts & Orders...</td></tr>';
        }

        // 🚀 THE FIX: Only hit the server if the data isn't already silently loaded!
        if (!rawOrderData || rawOrderData.length === 0) {
            const res = await fetch(`${API_URL}/orders`); 
            const oJson = await res.json();
            let orders = Array.isArray(oJson) ? oJson : (oJson.orders || []);
            
            rawOrderData = orders.map(o => { 
                if(typeof updateMasterDictionary === 'function') updateMasterDictionary(o); 
                
                const ms = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                // Auto-heal missing Order Month
                if (o.date && (!o.monthName || String(o.monthName).trim() === '')) {
                    let d = new Date(o.date);
                    if(!isNaN(d)) o.monthName = `${ms[d.getMonth()]}-${String(d.getFullYear()).slice(-2)}`;
                }
                // Auto-heal missing Despatch Month
                if (o.dispatchQty > 0 && (!o.despMonth || String(o.despMonth).trim() === '')) {
                    let d = new Date(o.updatedAt || o.date);
                    if(!isNaN(d)) o.despMonth = `${ms[d.getMonth()]}-${String(d.getFullYear()).slice(-2)}`;
                }

                return { ...o, fy: typeof getFY === 'function' ? getFY(o.date) : 'Unknown' }; 
            });
            targetOrdersData = rawOrderData; 
        }

        if(typeof populateCustomerDropdown === 'function') populateCustomerDropdown();

        const fySet = new Set(); rawOrderData.forEach(o => { if(o.fy && o.fy !== 'Unknown') fySet.add(o.fy); }); 
        let orderFYs = Array.from(fySet).sort().reverse();
        orderFYs.unshift('ALL');
        
        const fySelect = document.getElementById('fySelectorOrder');
        if (fySelect) { 
            if (!window.activeOrderFY || !orderFYs.includes(window.activeOrderFY)) window.activeOrderFY = 'ALL'; 
            fySelect.innerHTML = orderFYs.map(fy => `<option value="${fy}" ${fy === window.activeOrderFY ? 'selected' : ''}>${fy === 'ALL' ? '🌎 All Time' : fy}</option>`).join(''); 
        } 
        
        window.renderOrderTabs();
    } catch(e) { 
        console.error("fetchOrders error:", e); 
        const tbody = document.getElementById('orderTableBody'); 
        if (tbody) tbody.innerHTML = `<tr><td colspan="27" style="text-align:center; padding: 20px; font-weight:bold; color:red;">❌ Network Error: Could not load orders.</td></tr>`;
    }
}

window.renderOrderTabs = function() {
    const segmentFilter = document.getElementById('segmentFilterOrder') ? document.getElementById('segmentFilterOrder').value : 'ALL';
    const selectedFY = document.getElementById('fySelectorOrder') ? document.getElementById('fySelectorOrder').value : 'ALL';
    window.activeOrderFY = selectedFY; // Sync global
    
    let segData = rawOrderData || [];
    if (selectedFY !== 'ALL') {
        segData = segData.filter(o => o.fy === selectedFY);
    }
    if (segmentFilter !== 'ALL') {
        segData = segData.filter(o => o.segment === segmentFilter);
    }
    
    const months = new Set(); segData.forEach(o => { if(o.date) months.add(o.date.substring(0, 7)); });
    
    if(!window.activeOrderMonth) window.activeOrderMonth = 'ALL';
    let html = `<div class="excel-tab ${window.activeOrderMonth === 'ALL' ? 'active order' : ''}" onclick="setMonth('order', 'ALL')">🌎 Full Year</div>`;
    Array.from(months).sort().forEach(m => { html += `<div class="excel-tab ${window.activeOrderMonth === m ? 'active order' : ''}" onclick="setMonth('order', '${m}')">📁 ${m}</div>`; });
    
    const monthTabs = document.getElementById('orderMonthTabs');
    if(monthTabs) monthTabs.innerHTML = html;
    
    const delBtn = document.getElementById('deleteOrderMonthBtn'); 
    if(delBtn) delBtn.style.display = (window.activeOrderMonth !== 'ALL') ? 'inline-block' : 'none';
    
    window.renderOrderTable(); 
};

window.orderCurrentPage = 1;
window.renderOrderTable = function() {
    const viewType = document.getElementById('orderViewFilter') ? document.getElementById('orderViewFilter').value : 'summary';
    const segmentFilter = document.getElementById('segmentFilterOrder') ? document.getElementById('segmentFilterOrder').value : 'ALL';
    const selectedFY = document.getElementById('fySelectorOrder') ? document.getElementById('fySelectorOrder').value : 'ALL';
    
    let filteredData = rawOrderData || [];
    
    // Apply Filters
    if (selectedFY !== 'ALL') filteredData = filteredData.filter(o => o.fy === selectedFY);
    if (segmentFilter !== 'ALL') filteredData = filteredData.filter(o => o.segment === segmentFilter);
    if (window.activeOrderMonth && window.activeOrderMonth !== 'ALL') filteredData = filteredData.filter(o => o.date && o.date.startsWith(window.activeOrderMonth));

    const searchStr = document.getElementById('orderSearch') ? document.getElementById('orderSearch').value.toUpperCase() : '';
    if (searchStr) filteredData = filteredData.filter(o => `${o.bookingNumber} ${o.customerName} ${o.partCode} ${o.description} ${o.type} ${o.size} ${o.grade}`.toUpperCase().includes(searchStr));

    let totOrd = 0, totDesp = 0, totOrdVal = 0, totDespVal = 0, html = ''; let monthlyOrdAgg = {}, monthlyDespAgg = {}; const partMap = {}; const custMap = {};

    filteredData.forEach(o => {
        totOrd += (Number(o.orderQty) || 0); totDesp += (Number(o.dispatchQty) || 0); totOrdVal += (Number(o.schValue) || 0); totDespVal += (Number(o.dispatchValue) || 0);
        
        let m = o.date ? o.date.substring(0,7) : 'Unk'; 
        monthlyOrdAgg[m] = (monthlyOrdAgg[m] || 0) + (Number(o.orderQty) || 0); monthlyDespAgg[m] = (monthlyDespAgg[m] || 0) + (Number(o.dispatchQty) || 0);
        
        const key = o.partCode || o.description || 'Unknown';
        if(!partMap[key]) partMap[key] = { partCode: o.partCode, desc: o.description, type: o.type, size: o.size, af: o.af, pitch: o.pitch, length: o.length, grade: o.grade, rate: o.unitPrice, planQty:0, ordQty:0, despQty:0, ordVal:0, despVal:0, balQty:0, pendVal:0, wt: o.wtPerPc, ordWt:0, despWt:0 };
        
        partMap[key].planQty += (Number(o.plannedSaleQty) || 0); partMap[key].ordQty += (Number(o.orderQty) || 0); partMap[key].despQty += (Number(o.dispatchQty) || 0); partMap[key].ordVal += (Number(o.schValue) || 0); partMap[key].despVal += (Number(o.dispatchValue) || 0); partMap[key].balQty += (Number(o.balanceQty) || 0); partMap[key].pendVal += (Number(o.pendingDispatchValue) || 0); partMap[key].ordWt += (Number(o.orderWt) || 0); partMap[key].despWt += (Number(o.despWt) || 0);
        
        const custKey = o.customerName || 'Walk-in Customer'; 
        if(!custMap[custKey]) custMap[custKey] = { name: custKey, ordQty:0, ordVal:0 }; custMap[custKey].ordQty += (Number(o.orderQty) || 0); custMap[custKey].ordVal += (Number(o.schValue) || 0);
    });

    if(document.getElementById('totOrderQty')) { 
        document.getElementById('totOrderQty').innerText = fmtNum(totOrd) + ' Pcs'; 
        document.getElementById('totDespQty').innerText = fmtNum(totDesp) + ' Pcs'; 
        document.getElementById('totCompliance').innerText = totOrd > 0 ? ((totDesp / totOrd) * 100).toFixed(1) + '%' : '0%'; 
        if (document.getElementById('lostRevValue')) { 
            let totalLostRev = Math.max(0, totOrdVal - totDespVal); 
            document.getElementById('lostRevValue').innerText = fmtMoney(totalLostRev); 
        }
    }

    if(document.getElementById('orderTableHead')) {
        if (viewType === 'daily') {
            document.getElementById('orderTableHead').innerHTML = `<tr><th>Month</th><th>Bk Date</th><th>Bk No</th><th>Customer</th><th>Part Code</th><th>Type</th><th>Size</th><th>A/F</th><th>Pitch</th><th>Len</th><th>Grade</th><th>Wt/Pc</th><th>Plan Qty</th><th>Ord Qty</th><th style="color:#10b981;">Desp Qty</th><th>Bal Qty</th><th style="color:#2563eb;">Price/Pc</th><th>Sch Val</th><th>Desp Val</th><th>Paid (₹)</th><th>Due (₹)</th><th>Comp %</th><th>Desp Month</th><th>Desp Delay</th><th>Remarks</th><th>Print</th><th class="admin-only">Del</th></tr>`;
            
            let pageSize = 100;
            let totalItems = filteredData.length;
            let totalPages = Math.ceil(totalItems / pageSize) || 1;
            if (window.orderCurrentPage > totalPages) window.orderCurrentPage = totalPages;
            if (window.orderCurrentPage < 1) window.orderCurrentPage = 1;
            
            let startIdx = (window.orderCurrentPage - 1) * pageSize;
            let endIdx = Math.min(startIdx + pageSize, totalItems);
            let visibleOrders = filteredData.slice(startIdx, endIdx);

            visibleOrders.forEach(o => {
                let compColor = o.compliance >= 90 ? '#16a34a' : (o.compliance >= 70 ? '#ca8a04' : '#dc2626');
                let paid = o.paidAmount || 0; let due = (o.dispatchValue || 0) - paid;
                html += `<tr>
                    <td>${o.monthName || '-'}</td><td style="font-weight:700;">${o.bookingDate || '-'}</td><td class="editable-cell" style="font-weight:800; color:#4338ca;" onclick="editOrderBooking('${o._id}', '${o.bookingNumber}')">${o.bookingNumber || '-'} ✏️</td><td><strong style="color:#0ea5e9;">${o.customerName || 'Walk-in'}</strong></td>
                    <td><span class="part-code" style="background:#f3e8ff; color:#4338ca; border-color:#c7d2fe;">${o.partCode || 'N/A'}</span></td><td>${o.type || '-'}</td><td>${o.size || '-'}</td><td>${o.af || '-'}</td><td>${o.pitch || '-'}</td><td>${o.length || '-'}</td><td>${o.grade || '-'}</td>
                    <td class="editable-cell" style="color:#0f766e; font-weight:700;" onclick="editOrderWt('${o._id}', ${o.wtPerPc})">${fmtNum(o.wtPerPc)} ✏️</td><td>${fmtNum(o.plannedSaleQty)}</td><td style="font-weight:700;">${fmtNum(o.orderQty)}</td>
                    <td class="editable-cell" style="color:#10b981; font-weight:800;" onclick="updateDespatch('${o._id}', '${o.partCode}')">${fmtNum(o.dispatchQty)} 🚚</td>
                    <td style="font-weight:700; color:#dc2626;">${fmtNum(o.balanceQty)}</td><td class="editable-cell" style="color:var(--sales-blue); font-weight:700;" onclick="editOrderRate('${o._id}', ${o.unitPrice})">₹${fmtNum(o.unitPrice)} ✏️</td><td class="currency">${fmtMoney(o.schValue)}</td><td class="currency" style="color:#10b981;">${fmtMoney(o.dispatchValue)}</td>
                    <td class="editable-cell currency" style="color:#16a34a;" onclick="logPayment('${o._id}', '${o.bookingNumber}')">${fmtMoney(paid)} 💳</td><td class="currency" style="color:#dc2626;">${fmtMoney(due)}</td>
                    <td style="color:${compColor}; font-weight:900;">${(o.compliance || 0).toFixed(1)}%</td><td>${o.despMonth || '-'}</td><td>${o.despDelay || '-'}</td><td style="max-width: 200px; white-space: normal;">${o.remarks || '-'}</td>
                    <td><button class="btn-primary" style="width:auto; padding:6px; background:#475569;" onclick="printInvoice('${o.bookingNumber}', '${o.bookingDate}', '${o.customerName}', '${o.partCode}', '${o.description}', ${o.unitPrice}, ${o.dispatchQty}, ${o.dispatchValue})">📄</button></td>
                    <td class="admin-only"><button class="btn-delete" onclick="deleteRecord('orders', '${o._id}')">X</button></td>
                </tr>`;
            });

            if (totalPages > 1) {
                let pDis = window.orderCurrentPage === 1 ? 'disabled style="opacity:0.5;"' : 'cursor:pointer; background:#64748b; color:white;"';
                let nDis = window.orderCurrentPage === totalPages ? 'disabled style="opacity:0.5;"' : 'cursor:pointer; background:#0ea5e9; color:white;"';
                html += `<tr><td colspan="27" style="text-align:center; padding:15px; background:#f8fafc;">
                    <button onclick="window.orderCurrentPage--; window.renderOrderTable();" style="padding:6px 15px; border:none; border-radius:4px; font-weight:bold; ${pDis}">⬅️ Prev</button>
                    <span style="font-weight:bold; margin: 0 15px;">Page ${window.orderCurrentPage} of ${totalPages}</span>
                    <button onclick="window.orderCurrentPage++; window.renderOrderTable();" style="padding:6px 15px; border:none; border-radius:4px; font-weight:bold; ${nDis}">Next ➡️</button>
                </td></tr>`;
            }
        } else {
            document.getElementById('orderTableHead').innerHTML = `<tr><th>Part Code</th><th>Description</th><th>Type</th><th>Size</th><th>A/F</th><th>Pitch</th><th>Len</th><th>Grade</th><th>Wt/Pc</th><th>Plan Qty</th><th>Ord Qty</th><th style="color:#10b981;">Desp Qty</th><th>Bal Qty</th><th style="color:#2563eb;">Price/Pc</th><th>Sch Val</th><th>Desp Val</th><th>Pend Val</th><th>Comp %</th><th>Ord Wt</th><th>Desp Wt</th><th>Realn</th></tr>`;
            Object.values(partMap).sort((a,b) => b.ordQty - a.ordQty).forEach(data => {
                let comp = data.ordQty > 0 ? (data.despQty / data.ordQty) * 100 : 0; let compColor = comp >= 90 ? '#16a34a' : (comp >= 70 ? '#ca8a04' : '#dc2626'); let realn = data.wt > 0 ? data.rate / (data.wt / 1000) : 0;
                html += `<tr>
                    <td><span class="part-code" style="background:#f3e8ff; color:#4338ca; border-color:#c7d2fe;">${data.partCode || 'N/A'}</span></td><td style="white-space:normal; min-width:200px;">${data.desc}</td><td>${data.type || '-'}</td><td>${data.size || '-'}</td><td>${data.af || '-'}</td><td>${data.pitch || '-'}</td><td>${data.length || '-'}</td><td>${data.grade || '-'}</td>
                    <td>${fmtNum(data.wt)}</td><td>${fmtNum(data.planQty)}</td><td style="font-weight:700;">${fmtNum(data.ordQty)}</td><td style="font-weight:700; color:#10b981;">${fmtNum(data.despQty)}</td><td style="font-weight:700; color:#dc2626;">${fmtNum(data.balQty)}</td><td class="currency">${fmtNum(data.rate)}</td><td class="currency">${fmtMoney(data.ordVal)}</td>
                    <td class="currency" style="color:#10b981;">${fmtMoney(data.despVal)}</td><td class="currency" style="color:#dc2626;">${fmtMoney(data.pendVal)}</td><td style="color:${compColor}; font-weight:900;">${comp.toFixed(1)}%</td><td>${fmtNum(data.ordWt)}</td><td>${fmtNum(data.despWt)}</td><td style="font-weight:800; color:var(--accent-orange);">${fmtMoney(realn)}</td>
                </tr>`;
            });
        }
        document.getElementById('orderTableBody').innerHTML = html || '<tr><td colspan="27" style="text-align:center; padding:20px; font-weight:bold; color:#64748b;">No Orders Found!</td></tr>';
        if(typeof applyRolePermissions === 'function') applyRolePermissions();
    }

    if(typeof destroyChart === 'function') {
        destroyChart('orderTimelineChart'); destroyChart('topCustRevChart'); destroyChart('topCustVolChart');
        if(document.getElementById('orderTimelineChart') && document.getElementById('OrderDashboard').classList.contains('active')) {
            const mKeys = Object.keys(monthlyOrdAgg).sort(); 
            chartInstances.orderTimelineChart = new Chart(document.getElementById('orderTimelineChart').getContext('2d'), { type: 'bar', data: { labels: mKeys, datasets: [{ label: 'Ordered', data: mKeys.map(m => monthlyOrdAgg[m]), backgroundColor: '#8b5cf6' }, { label: 'Despatched', data: mKeys.map(m => monthlyDespAgg[m]), backgroundColor: '#10b981' }] }, options:{responsive:true, maintainAspectRatio:false} });
            const top10Rev = Object.values(custMap).sort((a,b) => b.ordVal - a.ordVal).slice(0, 10); const top10Vol = Object.values(custMap).sort((a,b) => b.ordQty - a.ordQty).slice(0, 10);
            chartInstances.topCustRevChart = new Chart(document.getElementById('topCustRevChart').getContext('2d'), { type: 'bar', data: { labels: top10Rev.map(c => c.name.substring(0,10)), datasets: [{ label: 'Revenue', data: top10Rev.map(c => c.ordVal), backgroundColor: '#8b5cf6' }] }, options: { indexAxis: 'y', responsive:true, maintainAspectRatio:false } });
            chartInstances.topCustVolChart = new Chart(document.getElementById('topCustVolChart').getContext('2d'), { type: 'bar', data: { labels: top10Vol.map(c => c.name.substring(0,10)), datasets: [{ label: 'Volume', data: top10Vol.map(c => c.ordQty), backgroundColor: '#3b82f6' }] }, options: { indexAxis: 'y', responsive:true, maintainAspectRatio:false } });
        }
    }
};

window.fetchOrders = fetchOrders; 
// Make sure it doesn't crash if the old manual edit functions aren't found
window.editOrderRate = window.editOrderRate || function(){}; 
window.updateDespatch = window.updateDespatch || function(){}; 
window.logPayment = window.logPayment || function(){}; 
window.editOrderBooking = window.editOrderBooking || function(){}; 
window.editOrderWt = window.editOrderWt || function(){}; 
window.printInvoice = window.printInvoice || function(){};

async function editOrderRate(id, currentRate) { const { value: pin } = await Swal.fire({ title: 'Security PIN Required', input: 'password', inputLabel: 'Enter PIN (Default: 1234)', showCancelButton: true }); if (pin !== '1234') { if (pin) Swal.fire('Access Denied', 'Incorrect PIN', 'error'); return; } const { value: newRate } = await Swal.fire({ title: 'Update Rate (₹)', input: 'number', inputValue: currentRate, inputAttributes: { step: '0.01' }, showCancelButton: true }); if (newRate) { await fetch(`${API_URL}/orders/${id}`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ unitPrice: newRate }) }); showToast('Rate updated!'); fetchOrders(); } }
async function updateDespatch(id, partCode) { 
    const { value: qty } = await Swal.fire({ title: `Log Daily Dispatch`, text: `How many items did you dispatch TODAY for ${partCode}?`, input: 'number', showCancelButton: true }); 
    if (qty && parseFloat(qty) > 0) { 
        const { value: dDate } = await Swal.fire({ title: 'Dispatch Date', input: 'date', inputValue: new Date().toISOString().substring(0,10), showCancelButton: true }); 
        if(dDate) { 
            await fetch(`${API_URL}/orders/${id}/dispatch`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ qtyToday: qty, date: dDate, user: currentUsername }) }); 
            showToast('Dispatch recorded & synced to Sales!'); 
            
            // 🚀 Force a complete backend sync so the Daily Snapshot updates instantly!
            await fetchOrders(); 
            await fetchSales(); 
        } 
    } 
}
window.updateDespatch = updateDespatch;
async function logPayment(id, bookingNo) { const { value: amount } = await Swal.fire({ title: 'Log Payment Received', text: `For Booking No: ${bookingNo}`, input: 'number', inputAttributes: { step: '0.01' }, showCancelButton: true }); if(amount && parseFloat(amount) > 0) { await fetch(`${API_URL}/orders/${id}/pay`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ amount, user: currentUsername }) }); showToast('Payment applied successfully!'); fetchOrders(); } }
async function editOrderBooking(id, currentNum) { const { value: newNum } = await Swal.fire({ title: 'Update Booking No', input: 'text', inputValue: currentNum, showCancelButton: true }); if (newNum) { await fetch(`${API_URL}/orders/${id}`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ bookingNumber: newNum }) }); showToast('Booking updated!'); fetchOrders(); } }
async function editOrderWt(id, currentWt) { const { value: newWt } = await Swal.fire({ title: 'Update Wt/Pc', input: 'number', inputValue: currentWt, inputAttributes: { step: '0.01' }, showCancelButton: true }); if (newWt) { await fetch(`${API_URL}/orders/${id}`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ wtPerPc: newWt }) }); showToast('Weight updated!'); fetchOrders(); } }

function printInvoice(bNo, date, cust, pCode, desc, rate, qty, val) {
    document.getElementById('invBkNo').innerText = bNo; document.getElementById('invDate').innerText = date; document.getElementById('invCustomer').innerText = cust;
    document.getElementById('invBody').innerHTML = `<tr><td style="padding:10px; border:1px solid #cbd5e1;">${pCode}</td><td style="padding:10px; border:1px solid #cbd5e1;">${desc}</td><td style="padding:10px; border:1px solid #cbd5e1;">${fmtMoney(rate)}</td><td style="padding:10px; border:1px solid #cbd5e1;">${fmtNum(qty)}</td><td style="padding:10px; border:1px solid #cbd5e1;">${fmtMoney(val)}</td></tr>`;
    document.getElementById('invTotal').innerText = fmtMoney(val);
    let element = document.getElementById('invoiceTemplate'); element.style.display = 'block';
    html2pdf().from(element).save(`Invoice_${bNo}.pdf`).then(() => { element.style.display = 'none'; });
}




// ==========================================
// 🚀 UPGRADED: FIFO DISPATCH & ZERO-LAG OPEN ORDERS
// ==========================================

window.openOrdersCache = []; // Stores the orders in RAM

window.getOpenOrders = function() {
    // Return all orders that have a pending balance, sorted Oldest -> Newest (FIFO)
    return rawOrderData
        .filter(o => (o.orderQty - (o.dispatchQty || 0)) > 0)
        .sort((a, b) => new Date(a.bookingDate || a.createdAt) - new Date(b.bookingDate || b.createdAt));
};

// 1. Instantly loads the tab and builds the Searchable Lists
window.renderOpenOrdersTab = function() {
    const openOrders = window.getOpenOrders();
    window.openOrdersCache = openOrders; // Save to RAM for instant searching
    
    // Build Searchable Customer Datalist instantly
    let custSet = new Set();
    openOrders.forEach(o => custSet.add(o.customerName));
    
    let custHtml = ''; // No default option needed for datalists
    Array.from(custSet).sort().forEach(c => custHtml += `<option value="${escapeHtml(c)}">`);
    if(document.getElementById('fifoCustomerList')) document.getElementById('fifoCustomerList').innerHTML = custHtml;
    
    if(document.getElementById('fifoDate')) document.getElementById('fifoDate').valueAsDate = new Date();
    
    window.updateFifoPartDropdown();
    
    // Draw the table (Capped at 100 rows to stop browser freezing!)
    window.drawOpenOrdersGrid(window.openOrdersCache);
};

// 2. Dynamically updates the Part Code Searchable List based on Customer
window.updateFifoPartDropdown = function() {
    const selectedCust = document.getElementById('fifoCustomer').value.trim();
    let openOrders = window.getOpenOrders();
    
    // If a customer is typed, only show part codes for that customer
    if (selectedCust) openOrders = openOrders.filter(o => o.customerName === selectedCust);
    
    let partSet = new Set();
    openOrders.forEach(o => partSet.add(o.partCode));
    
    let partHtml = '';
    Array.from(partSet).sort().forEach(p => partHtml += `<option value="${escapeHtml(p)}">`);
    
    const partList = document.getElementById('fifoPartList');
    if(partList) partList.innerHTML = partHtml;
    
    window.updateFifoPendingQty();
};

// 3. Calculates the total pending qty for the selected Part
window.updateFifoPendingQty = function() {
    const selectedCust = document.getElementById('fifoCustomer').value.trim();
    const selectedPart = document.getElementById('fifoPart').value.trim();
    
    let openOrders = window.getOpenOrders();
    if (selectedCust) openOrders = openOrders.filter(o => o.customerName === selectedCust);
    
    // Only calculate if a part code is fully typed/selected
    if (selectedPart) openOrders = openOrders.filter(o => o.partCode === selectedPart);
    else { document.getElementById('fifoPendingQty').value = "0"; return; }
    
    let totalPending = 0;
    openOrders.forEach(o => totalPending += (o.orderQty - (o.dispatchQty || 0)));
    
    document.getElementById('fifoPendingQty').value = totalPending;
};

// 2. 🚀 THE SPEED FIX: Only draw 100 items to the screen at a time!
// 1. ADD CHECKBOXES TO OPEN ORDERS GRID
window.drawOpenOrdersGrid = function(dataArray) {
    const tbody = document.getElementById('openOrderTableBody');
    if(!tbody) return;

    if (dataArray.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:20px; color:#64748b; font-weight:bold;">No Open Orders Found!</td></tr>';
        return;
    }

    let visibleData = dataArray.slice(0, 100);
    let html = '';

    visibleData.forEach(o => {
        let bal = o.orderQty - (o.dispatchQty || 0);
        // Add Checkbox in the first column!
        html += `<tr class="open-order-row">
            <td><input type="checkbox" class="pl-chk" value="${o._id}" style="width:18px; height:18px; cursor:pointer;"></td>
            <td style="font-weight:700;">${o.bookingDate || '-'}</td>
            <td style="color:#4338ca; font-weight:800;">${o.bookingNumber}</td>
            <td class="oo-cust">${o.customerName}</td>
            <td><span class="part-code oo-part" style="background:#f3e8ff; color:#4338ca;">${o.partCode}</span></td>
            <td>${o.description || '-'}</td>
            <td style="font-weight:bold;">${fmtNum(o.orderQty)}</td>
            <td style="color:#10b981; font-weight:bold;">${fmtNum(o.dispatchQty)}</td>
            <td style="color:#dc2626; font-weight:900;">${fmtNum(bal)}</td>
            <td class="currency">₹${fmtNum(o.unitPrice)}</td>
        </tr>`;
    });

    tbody.innerHTML = html;
};

// 1. Marketing creating the Pick List
window.generatePickListFromSelected = async function() {
    const checkboxes = document.querySelectorAll('.pl-chk:checked');
    if (checkboxes.length === 0) return showToast("⚠️ Select at least one order to send to the Store!", "error");

    const btn = event.currentTarget;
    let ogText = btn.innerHTML;
    btn.innerHTML = "⏳ Generating...";
    btn.disabled = true;

    // Generate a clean Pick List Number
    const plNo = `PL-${Date.now().toString().slice(-5)}`;
    let apiCalls = [];

    // Tag all selected orders with the PickList number
    checkboxes.forEach(chk => {
        // 🚀 THE FIX: Update RAM instantly so it works even before refresh
        let order = rawOrderData.find(o => o._id === chk.value);
        if (order) {
            order.pickListNo = plNo;
            order.pickListStatus = 'PENDING_PACKING';
        }

        apiCalls.push(
            fetch(`${API_URL}/orders/${chk.value}`, { 
                method: 'PUT', 
                headers: {'Content-Type': 'application/json'}, 
                body: JSON.stringify({ pickListNo: plNo, pickListStatus: 'PENDING_PACKING' }) 
            })
        );
    });

    try {
        await Promise.all(apiCalls);
        showToast(`✅ Pick List ${plNo} generated and sent to Store!`);
        // Refresh grids
        setTimeout(() => window.renderOpenOrdersTab(), 500);
    } catch(e) {
        showToast("❌ Error sending to store", "error");
    } finally {
        btn.innerHTML = ogText; btn.disabled = false;
    }
};

window.activePickListItems = [];

// ==========================================
// 🚀 UPGRADED: STORE COMMAND CENTER LOGIC
// ==========================================

// 1. Tab Router
window.switchInnerStoreTab = function(tabId) {
    document.querySelectorAll('.store-sub').forEach(btn => btn.classList.remove('active'));
    if(event && event.currentTarget) event.currentTarget.classList.add('active');
    
    document.querySelectorAll('#StoreDashboard .inner-tab').forEach(tab => tab.classList.remove('active'));
    const t = document.getElementById(`store-${tabId}`); 
    if(t) t.classList.add('active');

    // Instantly load data from RAM based on the tab selected
    if(tabId === 'pending') window.fetchStorePickLists(false);
    if(tabId === 'history') window.renderStoreHistory();
    if(tabId === 'inventory') window.syncStoreInventory(false);
};

// 2. Pending Pick Lists (Loads Instantly from RAM)
window.fetchStorePickLists = async function(forceSync = false) {
    const tbody = document.getElementById('storePickBody');
    
    // Draw instantly from existing RAM
    window.renderPickListsFromRAM();

    // Fetch from server ONLY if the user clicks "Force Sync" or if RAM is empty
    if (forceSync || !rawOrderData || rawOrderData.length === 0) {
        if(tbody && forceSync) tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; font-weight:bold; color:#64748b;">⏳ Syncing Live Orders...</td></tr>';
        
        try {
            const res = await fetch(`${API_URL}/orders`);
            if (res.ok) {
                const { orders } = await res.json();
                rawOrderData = orders.map(o => { 
                    if(typeof updateMasterDictionary === 'function') updateMasterDictionary(o); 
                    return { ...o, fy: typeof getFY === 'function' ? getFY(o.date) : 'Unknown' }; 
                });
                // Redraw instantly
                window.renderPickListsFromRAM();
                if (document.getElementById('store-history').classList.contains('active')) window.renderStoreHistory();
            }
        } catch(e) { console.error("Store Sync Error:", e); }
    }
};

window.renderPickListsFromRAM = function() {
    let pendingItems = rawOrderData.filter(o => o.pickListStatus === 'PENDING_PACKING');
    let plGroups = {};
    
    pendingItems.forEach(item => {
        if(!plGroups[item.pickListNo]) plGroups[item.pickListNo] = { date: item.bookingDate, customerSet: new Set(), items: [] };
        plGroups[item.pickListNo].items.push(item);
        plGroups[item.pickListNo].customerSet.add(item.customerName);
    });

    const tbody = document.getElementById('storePickBody');
    if(!tbody) return;

    let html = '';
    Object.keys(plGroups).forEach(plNo => {
        let group = plGroups[plNo];
        let custStr = Array.from(group.customerSet).join(', ');
        if(custStr.length > 30) custStr = custStr.substring(0,30) + '...';

        html += `<tr>
            <td style="font-weight:900; color:#dc2626;">${plNo}</td>
            <td style="font-weight:700;">${group.date || 'Today'}</td>
            <td style="color:#1e40af; font-weight:800;">${custStr}</td>
            <td style="font-weight:bold;">${group.items.length} Items</td>
            <td><button class="btn-primary" style="background:#eab308; color:#422006; width:auto; padding:8px 15px;" onclick="window.openPickListModal('${plNo}')">👁️ Open Pick List</button></td>
        </tr>`;
    });

    tbody.innerHTML = html || '<tr><td colspan="5" style="text-align:center; padding:20px; font-weight:bold; color:#64748b;">No Pending Pick Lists!</td></tr>';
};

// 3. Dispatch History Engine
window.renderStoreHistory = function() {
    const tbody = document.getElementById('storeHistoryBody');
    if(!tbody) return;
    
    // Find all orders that the Store has successfully PACKED
    let packedItems = rawOrderData.filter(o => o.pickListStatus === 'PACKED')
                                  .sort((a,b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
    
    let html = '';
    // Only draw the top 150 so Chrome doesn't freeze
    packedItems.slice(0, 150).forEach(o => { 
        let packDate = o.updatedAt ? new Date(o.updatedAt).toISOString().substring(0,10) : 'Recent';
        html += `<tr class="store-hist-row">
            <td style="font-weight:700;">${packDate}</td>
            <td style="font-weight:900; color:#dc2626;">${o.pickListNo || '-'}</td>
            <td style="color:#1e40af; font-weight:800;">${o.customerName}</td>
            <td><span class="part-code" style="background:#f3e8ff; color:#4338ca;">${o.partCode}</span></td>
            <td>${o.description || '-'}</td>
            <td style="font-weight:bold; color:#10b981; font-size:1.1rem;">${fmtNum(o.dispatchQty)}</td>
        </tr>`;
    });

    tbody.innerHTML = html || '<tr><td colspan=\"6\" style=\"text-align:center; padding:20px; font-weight:bold; color:#64748b;\">No Dispatch History Found!</td></tr>';
};

window.filterStoreHistory = function() {
    let filter = document.getElementById('storeHistorySearch').value.toUpperCase();
    let rows = document.querySelectorAll('.store-hist-row');
    rows.forEach(row => {
        row.style.display = row.innerText.toUpperCase().includes(filter) ? '' : 'none';
    });
};

// 4. Live FG Inventory Engine (Matches your Excel Image exactly)
window.storeInventoryRAM = [];

window.syncStoreInventory = async function(forceSync = false) {
    const tbody = document.getElementById('storeInventoryBody');
    if(forceSync && tbody) tbody.innerHTML = '<tr><td colspan="13" style="text-align:center; padding:20px; font-weight:bold; color:#64748b;">⏳ Syncing Live Inventory Database...</td></tr>';
    
    try {
        // 🚀 THE FIX: Pull directly from the actual Products Database!
        if(forceSync || window.storeInventoryRAM.length === 0) {
            const res = await fetch(`${API_URL}/products`);
            if (res.ok) {
                const products = await res.json();
                window.storeInventoryRAM = products || [];
            }
        }
    } catch(e) { 
        console.error("Inventory Fetch Error:", e); 
    }

    window.renderStoreInventory();
};
// 🚀 NEW: Bulletproof HTML Generator (Fixes NaN and zero-visibility issues)
window.generateStoreInvRowHtml = function(item, index) {
    let code = item.partNo || item.productCode || item.barcode || '-';
    let cleanCode = code.toUpperCase().trim();
    
    // 1. REVERSE-LOOKUP: Try to match by Description instead of Part Code
    let master = masterPartDictionary[cleanCode];
    if (!master) {
        let foundKey = Object.keys(masterPartDictionary).find(k => 
            (masterPartDictionary[k].desc || '').toUpperCase().trim() === cleanCode
        );
        if (foundKey) master = masterPartDictionary[foundKey];
    }
    master = master || {};

    // 2. SMART PARSER: Extract details from text if missing
    let exLen = '', exAF = '', exGrade = '';
    let dims = cleanCode.match(/(M\d+)\s*X\s*([\d.]+)\s*X\s*([\d.]+)/i);
    if(dims) { exLen = dims[3]; }
    if (cleanCode.includes('10.9')) exGrade = '10.9';
    else if (cleanCode.includes('8.8')) exGrade = '8.8';

    // Combine Database + Master Dict + Smart Parser
    let sector = item.sector || master.segment || (cleanCode.includes('AUTO') ? 'AUTO' : (cleanCode.includes('IND') ? 'IND' : '-'));
    let type = item.type || master.type || (cleanCode.includes('H/T') || cleanCode.includes('HT') || cleanCode.includes('HALF THREAD') ? 'H/T' : (cleanCode.includes('MS') ? 'MS' : (cleanCode.includes('FULL THREAD') ? 'F/T' : '-')));
    let grade = item.grade || master.grade || exGrade || '-';
    let length = item.length || master.length || exLen || '-';
    let af = item.af || master.af || exAF || '-';
    
    // 🚀 THE FIX: Force strict Number parsing to prevent "NaN" crashes
    let wtPc = parseFloat(item.weightPerPc) || parseFloat(item.chWt) || parseFloat(master.wt) || 0;
    let perBox = parseFloat(item.perBoxQty) || parseFloat(master.perBox) || 0;
    let stock = parseFloat(item.currentStock) || 0;
    
    let boxes = parseFloat(item.noOfBoxes) || (perBox > 0 ? Math.floor(stock / perBox) : 0);
    let totWt = parseFloat(item.totalWeight) || ((stock * wtPc) / 1000);
    
    let wip = parseFloat(item.wipStock) || 0;
    let readied = parseFloat(item.productionReadied) || 0;

    let stockColor = stock > 0 ? '#16a34a' : '#dc2626';
    
    // 🚀 THE FIX: Show actual "0"s instead of "-" so the Store knows it is empty!
    return `<tr class="store-inv-row" style="text-align: center; border-bottom: 1px solid #e2e8f0; background: white; transition: 0.2s;">
        <td style="padding: 10px; font-weight: bold; color: #64748b;">${index + 1}</td>
        <td style="padding: 10px; text-align: left; max-width: 250px; white-space: normal;"><span class="part-code" style="background:#ccfbf1; color:#0f766e; border: 1px solid #99f6e4;">${code}</span></td>
        <td style="padding: 10px; font-weight: 800; color: #6366f1;">${sector !== '-' ? sector : ''}</td>
        <td style="padding: 10px;">${type !== '-' ? type : ''}</td>
        <td style="padding: 10px; font-weight:bold;">${grade !== '-' ? grade : ''}</td>
        <td style="padding: 10px; font-weight: 600;">${length !== '-' ? length : ''}</td>
        <td style="padding: 10px; font-weight: 600;">${af !== '-' ? af : ''}</td>
        <td style="padding: 10px; color: #475569;">${wtPc > 0 ? wtPc : '0'}</td>
        <td style="padding: 10px; font-weight: bold; color: #0f766e; background: #f0fdfa;">${perBox > 0 ? fmtNum(perBox) : '0'}</td>
        <td style="padding: 10px; font-weight: 900; color: #d97706; background: #fefce8;">${fmtNum(boxes)}</td>
        <td style="padding: 10px; font-weight: bold; color: #2563eb; background: #eff6ff;">${totWt > 0 ? totWt.toFixed(2) : '0.00'}</td>
        <td style="padding: 10px; font-weight: bold; color: #d946ef; background: #faf5ff;">${fmtNum(wip)}</td>
        <td style="padding: 10px; font-weight: bold; color: #059669; background: #ecfdf5;">${fmtNum(readied)}</td>
        <td style="padding: 10px; font-weight: 900; color:${stockColor}; background: #fef2f2; font-size: 1.05rem;">${fmtNum(stock)}</td>
    </tr>`;
};
// ==========================================
// 🚀 STORE INVENTORY PAGINATION ENGINE
// ==========================================
window.storeInvCurrentPage = 1;
window.storeInvPageSize = 250; // Shows 250 items per page

window.renderStoreInventory = function() {
    const tbody = document.getElementById('storeInventoryBody');
    if(!tbody) return;

    let filter = document.getElementById('storeInvSearch') ? document.getElementById('storeInvSearch').value.toUpperCase() : '';
    
    // 1. Filter Data First
    let filtered = window.storeInventoryRAM.filter(item => {
        let code = (item.partNo || item.productCode || item.barcode || '').toUpperCase();
        return code.includes(filter);
    });

    // 2. Pagination Math
    let totalItems = filtered.length;
    let totalPages = Math.ceil(totalItems / window.storeInvPageSize) || 1;
    if (window.storeInvCurrentPage > totalPages) window.storeInvCurrentPage = totalPages;
    
    let startIdx = (window.storeInvCurrentPage - 1) * window.storeInvPageSize;
    let endIdx = Math.min(startIdx + window.storeInvPageSize, totalItems);
    
    let visibleData = filtered.slice(startIdx, endIdx);
    let html = '';

    // 3. Draw Rows
    visibleData.forEach((item, index) => {
        html += window.generateStoreInvRowHtml(item, startIdx + index);
    });
    
    // 4. Draw Next/Prev Buttons at the bottom!
    if (totalPages > 1) {
        let prevDisabled = window.storeInvCurrentPage === 1 ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : 'cursor:pointer; background:#64748b; color:white;"';
        let nextDisabled = window.storeInvCurrentPage === totalPages ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : 'cursor:pointer; background:#0ea5e9; color:white;"';
        
        html += `<tr><td colspan="14" style="text-align:center; padding:15px; background:#f8fafc; border-top: 2px solid #cbd5e1;">
            <button onclick="window.storeInvCurrentPage--; window.renderStoreInventory();" style="padding:8px 20px; margin-right:15px; border:none; border-radius:6px; font-weight:bold; ${prevDisabled}">⬅️ Previous Page</button>
            <span style="font-weight:900; color:#1e293b; font-size:1.1rem;">Page ${window.storeInvCurrentPage} of ${totalPages} <span style="font-size:0.85rem; color:#64748b;">(Showing ${startIdx + 1} - ${endIdx} of ${totalItems})</span></span>
            <button onclick="window.storeInvCurrentPage++; window.renderStoreInventory();" style="padding:8px 20px; margin-left:15px; border:none; border-radius:6px; font-weight:bold; ${nextDisabled}">Next Page ➡️</button>
        </td></tr>`;
    }
    
    tbody.innerHTML = html || '<tr><td colspan="14" style="text-align:center; padding:20px; font-weight:bold; color:#64748b;">No Inventory Data Found!</td></tr>';
};

// Reset to Page 1 whenever they type in the search box
window.filterStoreInventory = function() {
    window.storeInvCurrentPage = 1; 
    window.renderStoreInventory();
};
// 3. Open the Modal (Matches the Excel Format)
window.openPickListModal = async function(plNo) {
    document.getElementById('plModalDate').innerText = new Date().toISOString().substring(0, 10);
    document.getElementById('plModalNo').innerText = plNo;
    
    window.activePickListItems = rawOrderData.filter(o => o.pickListNo === plNo && o.pickListStatus === 'PENDING_PACKING');
    const tbody = document.getElementById('plModalBody');
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;">⏳ Syncing Live Stock...</td></tr>';
    document.getElementById('pickListModal').style.display = 'flex';

    // Fetch Live Stock to help the store boy!
    let liveStockMap = {};
    try {
        const res = await fetch(`${API_URL}/sync`);
        if (res.ok) {
            const data = await res.json();
            (data.state?.masterInventory || []).forEach(item => {
                liveStockMap[(item.partNo || item.code || '').toUpperCase()] = item.currentStock || 0;
            });
        }
    } catch(e) { }

    let html = '';
    window.activePickListItems.forEach((o, index) => {
        let reqQty = o.orderQty - (o.dispatchQty || 0);
        let stock = liveStockMap[(o.partCode || '').toUpperCase()] || 0;
        let stockColor = stock >= reqQty ? '#16a34a' : '#dc2626';

        html += `<tr style="background: white;">
            <td style="padding:10px; border-bottom: 1px solid var(--border); font-weight:bold;">${index + 1}</td>
            <td style="padding:10px; border-bottom: 1px solid var(--border); color:#1e40af; font-weight:800;">${o.customerName}</td>
            <td style="padding:10px; border-bottom: 1px solid var(--border);"><span class="part-code" style="background:#f3e8ff; color:#4338ca;">${o.partCode}</span></td>
            <td style="padding:10px; border-bottom: 1px solid var(--border);">${o.type || '-'}</td>
            <td style="padding:10px; border-bottom: 1px solid var(--border);">${o.size || '-'}</td>
            <td style="padding:10px; border-bottom: 1px solid var(--border);">${o.pitch || '-'}</td>
            <td style="padding:10px; border-bottom: 1px solid var(--border);">${o.length || '-'}</td>
            <td style="padding:10px; border-bottom: 1px solid var(--border);">${o.grade || '-'}</td>
            <td style="padding:10px; border-bottom: 1px solid var(--border); font-weight:900; color:#10b981; font-size:1.1rem;">${fmtNum(reqQty)}</td>
            <td style="padding:10px; border-bottom: 1px solid var(--border); font-weight:900; color:${stockColor};">${fmtNum(stock)}</td>
        </tr>`;
    });

    tbody.innerHTML = html;
};

// 4. Store clicks "Pack & Dispatch" -> Loops FIFO dispatch seamlessly
window.dispatchActivePickList = async function() {
    const btn = document.getElementById('plDispatchBtn');
    btn.innerHTML = "⏳ Packing..."; btn.disabled = true;

    const today = new Date().toISOString().substring(0, 10);

    try {
        // 🚀 THE FIX: Use a 'for...of' loop with 'await' inside.
        // This forces the database to process the Dispatch BEFORE updating the Status,
        // preventing the MongoDB VersionError crash!
        for (let order of window.activePickListItems) {
            let reqQty = order.orderQty - (order.dispatchQty || 0);
            
            // 1. Send the Dispatch Log to Accounts & WAIT for it to succeed
            await fetch(`${API_URL}/orders/${order._id}/dispatch`, { 
                method: 'POST', 
                headers: {'Content-Type': 'application/json'}, 
                body: JSON.stringify({ qtyToday: reqQty, date: today, user: currentUsername }) 
            });

            // 2. ONLY THEN clear the Pick List Status
            await fetch(`${API_URL}/orders/${order._id}`, { 
                method: 'PUT', 
                headers: {'Content-Type': 'application/json'}, 
                body: JSON.stringify({ pickListStatus: 'PACKED' }) 
            });
        }

        showToast("✅ Items Packed and Dispatched to Accounts!");
        document.getElementById('pickListModal').style.display = 'none';
        
        // Refresh globals and instantly update the Daily Report visually
        await fetchOrders(); 
        await fetchSales(); 
        if (typeof updateDailyReports === 'function') updateDailyReports();

        setTimeout(() => window.fetchStorePickLists(true), 1000); // Reload Store View
    } catch(e) {
        showToast("❌ Error packing items. Check connection.", "error");
        console.error(e);
    } finally {
        btn.innerHTML = "📦 Confirm Packed & Dispatch to Accounts"; 
        btn.disabled = false;
    }
};

// 3. 🚀 ZERO-LAG RAM FILTER (Replaces the slow HTML scraper)
window.filterOpenOrders = function() {
    let filter = document.getElementById('openOrderSearch').value.toUpperCase();
    
    // Filter the array directly in RAM (Takes 0 Milliseconds)
    let filteredOrders = window.openOrdersCache.filter(o => {
        let searchStr = `${o.bookingNumber} ${o.customerName} ${o.partCode} ${o.description}`.toUpperCase();
        return searchStr.includes(filter);
    });
    
    // Redraw the grid with the filtered results
    window.drawOpenOrdersGrid(filteredOrders);
};





window.executeFifoDispatch = async function() {
    const cust = document.getElementById('fifoCustomer').value;
    const part = document.getElementById('fifoPart').value;
    const dispatchDate = document.getElementById('fifoDate').value;
    let totalQtyToDispatch = parseFloat(document.getElementById('fifoDispatchQty').value);
    const maxQty = parseFloat(document.getElementById('fifoPendingQty').value);
    
    if(!part) return showToast("⚠️ Please select a Part Code!", "error");
    if(!totalQtyToDispatch || totalQtyToDispatch <= 0) return showToast("⚠️ Enter a valid Dispatch Qty!", "error");
    if(totalQtyToDispatch > maxQty) return showToast(`⚠️ You cannot dispatch more than the pending qty (${maxQty})!`, "error");

    const btn = document.getElementById('fifoSubmitBtn');
    const ogText = btn.innerHTML;
    btn.innerHTML = "⏳ Processing FIFO...";
    btn.disabled = true;

    // 1. Get exact matching orders, sorted Oldest First
    let targetOrders = window.getOpenOrders().filter(o => o.partCode === part);
    if (cust) targetOrders = targetOrders.filter(o => o.customerName === cust);

    // 2. The FIFO Distribution Engine
    let apiCalls = [];
    
    for (let order of targetOrders) {
        if (totalQtyToDispatch <= 0) break; // We ran out of items to dispatch!
        
        let orderBalance = order.orderQty - (order.dispatchQty || 0);
        let qtyForThisOrder = 0;
        
        if (totalQtyToDispatch >= orderBalance) {
            // Close out this entire order
            qtyForThisOrder = orderBalance;
            totalQtyToDispatch -= orderBalance;
        } else {
            // Partially close this order
            qtyForThisOrder = totalQtyToDispatch;
            totalQtyToDispatch = 0; 
        }
        
        // Push the update command to our API queue
        apiCalls.push(
            fetch(`${API_URL}/orders/${order._id}/dispatch`, { 
                method: 'POST', 
                headers: {'Content-Type': 'application/json'}, 
                body: JSON.stringify({ qtyToday: qtyForThisOrder, date: dispatchDate, user: currentUsername }) 
            })
        );
    }

    try {
        // Execute all updates simultaneously
        await Promise.all(apiCalls);
        showToast("✅ FIFO Dispatch Successful! Orders updated.", "success");
        
        document.getElementById('fifoDispatchQty').value = '';
        fetchOrders(); // Refresh the data globally
        fetchSales();  // Update sales metrics
        
        // Redraw this specific tab instantly
        setTimeout(() => { window.renderOpenOrdersTab(); }, 1000);
        
    } catch(e) {
        showToast("❌ Error processing FIFO dispatch", "error");
    } finally {
        btn.innerHTML = ogText;
        btn.disabled = false;
    }
};





// ==========================================
// 🚨 14. FACTORY FLOOR LOGIC 🚨
// ==========================================
if(document.getElementById('prodSearch')) document.getElementById('prodSearch').addEventListener('input', (e) => { renderProdTable(); });

async function fetchProduction() {
    try {
        // FIX 1: Changed to production-market
        const res = await fetch(`${API_URL}/production-market`); 
        
        // SAFETY NET: Stops the "Unexpected token <" error if 404 happens
        if (!res.ok) throw new Error(`Server Error: ${res.status}`); 

        const { production } = await res.json(); 
        rawProdData = production; 
        rawProdData.forEach(p => updateMasterDictionary(p)); 
        const mSet = new Set(); 
        rawProdData.forEach(p => { if(p.month) mSet.add(p.month); }); 
        let prodMonths = Array.from(mSet).sort().reverse();
        if (prodMonths.length > 0 && (!activeProdMonth || !prodMonths.includes(activeProdMonth))) activeProdMonth = prodMonths[0];
        renderProdTabs();
    } catch(e) { 
        console.error("Fetch Production Error:", e); 
        showToast("Error connecting to production database", "error");
    }
}

function renderProdTabs() {
    const mSet = new Set(); rawProdData.forEach(p => { if(p.month) mSet.add(p.month); }); let prodMonths = Array.from(mSet).sort().reverse();
    let html = ''; prodMonths.forEach(m => { html += `<div class="excel-tab ${activeProdMonth === m ? 'active prod' : ''}" onclick="setMonth('prod', '${m}')">🏭 ${m}</div>`; });
    if(document.getElementById('prodMonthTabs')) document.getElementById('prodMonthTabs').innerHTML = html;
    const delBtn = document.getElementById('deleteProdMonthBtn'); if (delBtn) delBtn.style.display = activeProdMonth ? 'inline-block' : 'none';
    renderProdTable();
}
// FIX 2: Change the fetch URL
async function updateProdActual(id, currentAct) { 
    const { value: newAct } = await Swal.fire({ title: 'Update Production', input: 'number', inputValue: currentAct, showCancelButton: true }); 
    if (newAct) { 
        await fetch(`${API_URL}/production-market/${id}`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ actualQty: newAct }) }); 
        showToast('Updated!'); fetchProduction(); 
    } 
}

// FIX 3: Change the fetch URL
async function updateProdStatus(id, currentStatus) { 
    const { value: newStatus } = await Swal.fire({ title: 'Update Status', input: 'text', inputValue: currentStatus, showCancelButton: true }); 
    if (newStatus) { 
        await fetch(`${API_URL}/production-market/${id}`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ status: newStatus.trim() }) }); 
        showToast('Updated!'); fetchProduction(); 
    } 
}

function renderProdTable() {
    let filteredData = rawProdData.filter(p => p.month === activeProdMonth);
    const searchStr = document.getElementById('prodSearch') ? document.getElementById('prodSearch').value.toLowerCase() : '';
    if(searchStr) { filteredData = filteredData.filter(p => (p.partCode && p.partCode.toLowerCase().includes(searchStr)) || (p.status && p.status.toLowerCase().includes(searchStr))); }
    
    let totPlan = 0, totAct = 0, totPend = 0, html = ''; let statusCounts = {};
    if(document.getElementById('prodTableHead')) {
        document.getElementById('prodTableHead').innerHTML = '<tr><th>Part Code</th><th>Planned Qty</th><th>Actual/Stock</th><th>Pending Qty</th><th>Status</th><th class="admin-only">Del</th></tr>';
        filteredData.forEach(p => { 
            totPlan += (p.plannedQty || 0); totAct += (p.actualQty || 0); totPend += (p.pendingQty || 0); 
            let stat = p.status || 'Pending'; statusCounts[stat] = (statusCounts[stat] || 0) + 1;
            html += `<tr><td><span class="part-code">${p.partCode || 'N/A'}</span></td><td style="font-weight:700;">${fmtNum(p.plannedQty)}</td><td class="editable-cell" style="color:#0f766e; font-weight:800;" onclick="updateProdActual('${p._id}', ${p.actualQty})">${fmtNum(p.actualQty)} 🔨</td><td style="color:#dc2626; font-weight:900;">${fmtNum(p.pendingQty)}</td><td class="editable-cell" style="font-weight:700;" onclick="updateProdStatus('${p._id}', '${p.status}')">${p.status} ✏️</td><td class="admin-only"><button class="btn-delete" onclick="deleteRecord('production', '${p._id}')">X</button></td></tr>`; 
        });
        document.getElementById('prodTableBody').innerHTML = html; 
        applyRolePermissions();
    }
    if(document.getElementById('totPlanQty')) { document.getElementById('totPlanQty').innerText = fmtNum(totPlan) + ' Pcs'; document.getElementById('totActQty').innerText = fmtNum(totAct) + ' Pcs'; document.getElementById('totPendQty').innerText = fmtNum(totPend) + ' Pcs'; }
    
    destroyChart('prodStatusChart'); destroyChart('prodBarChart');
    if(document.getElementById('prodStatusChart') && document.getElementById('ProductionDashboard').classList.contains('active')) {
        chartInstances.prodStatusChart = new Chart(document.getElementById('prodStatusChart').getContext('2d'), { type: 'doughnut', data: { labels: Object.keys(statusCounts), datasets: [{ data: Object.values(statusCounts), backgroundColor: ['#0f766e', '#f59e0b', '#ef4444', '#8b5cf6'] }] }, options:{responsive:true, maintainAspectRatio:false} });
        const top10 = [...filteredData].sort((a,b) => b.plannedQty - a.plannedQty).slice(0, 10); 
        chartInstances.prodBarChart = new Chart(document.getElementById('prodBarChart').getContext('2d'), { type: 'bar', data: { labels: top10.map(d => d.partCode), datasets: [{ label: 'Planned Qty', data: top10.map(d => d.plannedQty), backgroundColor: '#cbd5e1' }, { label: 'Actual Produced', data: top10.map(d => d.actualQty), backgroundColor: '#0f766e' }] }, options:{responsive:true, maintainAspectRatio:false} });
    }
}

window.fetchProduction = fetchProduction; window.renderProdTabs = renderProdTabs; window.renderProdTable = renderProdTable; window.updateProdActual = updateProdActual; window.updateProdStatus = updateProdStatus;

// ==========================================
// 🚨 15. PREMIUM FREIGHT LOGIC 🚨
// ==========================================
async function fetchFreight() {
    try {
        const res = await fetch(`${API_URL}/freight`); const { freight } = await res.json();
        let totPen = 0, totWt = 0, deptMap = {}, html = '';
        if(document.getElementById('freightTableHead')) {
            document.getElementById('freightTableHead').innerHTML = '<tr><th>Date</th><th>Customer</th><th>Part</th><th>Qty</th><th>Weight</th><th>Penalty Cost</th><th>Fault Dept</th><th class="admin-only">Del</th></tr>';
            freight.forEach(f => {
                totPen += f.diff||0; totWt += f.weight||0; let dept = f.primaryDept || 'Unknown'; deptMap[dept] = (deptMap[dept]||0) + (f.diff||0);
                html += `<tr><td>${f.date}</td><td style="font-weight:bold;">${f.customer}</td><td>${f.partDetails}</td><td>${fmtNum(f.qty)}</td><td>${f.weight}kg</td><td style="color:#e11d48; font-weight:bold;">₹${fmtNum(f.diff)}</td><td style="font-weight:bold;">${dept}</td><td class="admin-only"><button class="btn-delete" onclick="deleteRecord('freight', '${f._id}')">X</button></td></tr>`;
            });
            document.getElementById('freightTableBody').innerHTML = html;
            document.getElementById('totPenalty').innerText = fmtMoney(totPen); document.getElementById('totFreightWt').innerText = fmtNum(totWt) + ' KG';
            let topDept = Object.keys(deptMap).sort((a,b)=>deptMap[b]-deptMap[a])[0] || '-'; document.getElementById('topDept').innerText = topDept;
            
            destroyChart('freightDeptChart');
            if(document.getElementById('freightDeptChart') && document.getElementById('FreightDashboard').classList.contains('active')) {
                chartInstances.freightDeptChart = new Chart(document.getElementById('freightDeptChart').getContext('2d'), { type: 'doughnut', data: { labels: Object.keys(deptMap), datasets: [{ data: Object.values(deptMap), backgroundColor: ['#e11d48', '#f59e0b', '#8b5cf6', '#3b82f6', '#10b981'] }] }, options:{responsive:true, maintainAspectRatio:false}});
            }
            applyRolePermissions();
        }
    } catch(e) { console.error(e); }
}
window.fetchFreight = fetchFreight;
// ==========================================
// 🚨 16. MANUAL FORMS & UPLOADS 🚨
// ==========================================
function toggleManualForms() { 
    const typeSelect = document.getElementById('entryTypeSelector'); if(!typeSelect) return;
    const type = typeSelect.value; document.querySelectorAll('.form-grid').forEach(f => f.style.display = 'none');
    if(document.getElementById('manualDealerForm')) document.getElementById('manualDealerForm').style.display = 'none';
    if(type === 'dealer' && document.getElementById('manualDealerForm')) { document.getElementById('manualDealerForm').style.display = 'block'; loadDealerFields(); } 
    else if (type === 'target' && document.getElementById('manualTargetForm')) document.getElementById('manualTargetForm').style.display = 'grid'; 
    else if (type === 'order' && document.getElementById('manualOrderForm')) document.getElementById('manualOrderForm').style.display = 'grid'; 
    else if (type === 'prod' && document.getElementById('manualProdForm')) document.getElementById('manualProdForm').style.display = 'grid'; 
    else if (type === 'freight' && document.getElementById('manualFreightForm')) document.getElementById('manualFreightForm').style.display = 'grid'; 
}
window.toggleManualForms = toggleManualForms;

async function loadDealerFields() {
    const sheet = document.getElementById('targetSheetSelect').value; const res = await fetch(`${API_URL}/headers/${sheet}`); let headers = await res.json(); let html = '';
    headers.forEach(h => { if(h !== 'STATUS' && h !== 'Name') { html += `<div class="form-group"><label>${h}</label><input type="text" name="${h}" placeholder="Enter ${h}..."></div>`; } });
    document.getElementById('dynamicFormFields').innerHTML = `<div class="form-group full"><label>Dealer Name (Required)</label><input type="text" name="Name" required placeholder="Enter Dealer Name"></div>` + html; 
}
window.loadDealerFields = loadDealerFields;

if(document.getElementById('manualDealerForm')) {
    document.getElementById('manualDealerForm').addEventListener('submit', async (e) => { 
        e.preventDefault(); let data = { Name: document.getElementById('dName').value, Seg: document.getElementById('dSeg').value, Connect: document.getElementById('dConnect').value, Visit: document.getElementById('dVisit').value, Business: document.getElementById('dBusiness').value, Payment: document.getElementById('dPayment').value, Response: document.getElementById('dResponse').value, G: document.getElementById('dG').value, Y: document.getElementById('dY').value, B: document.getElementById('dB').value, Person: document.getElementById('dPerson').value, Number: document.getElementById('dNumber').value, Email: document.getElementById('dEmail').value, Address: document.getElementById('dAddress').value, City: document.getElementById('dCity').value, State: document.getElementById('dState').value, Remarks: document.getElementById('dRemarks').value }; Object.keys(data).forEach(k => { if(data[k] === '') delete data[k]; }); await fetch(`${API_URL}/dealers`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ sheetCategory: document.getElementById('targetSheetSelect').value, status: 'ACTIVE', data, user: currentUsername }) }); showToast('Dealer Added Successfully!'); e.target.reset(); fetchDealers();
    });
}
if(document.getElementById('manualTargetForm')) {
    document.getElementById('manualTargetForm').addEventListener('submit', async (e) => { e.preventDefault(); const payload = { dealerName: document.getElementById('tDealer').value, territory: document.getElementById('tTerritory').value, creditDays: document.getElementById('tCrDays').value, discount: document.getElementById('tDisc').value, cd: document.getElementById('tCD').value, td: document.getElementById('tTD').value, total: document.getElementById('tTotal').value, q1: document.getElementById('tQ1').value, q2: document.getElementById('tQ2').value, q3: document.getElementById('tQ3').value, q4: document.getElementById('tQ4').value, remarks: document.getElementById('tRem').value }; await fetch(`${API_URL}/targets`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ payload: payload, user: currentUsername }) }); showToast('Target Logged!'); e.target.reset(); fetchTargets(); });
}
if(document.getElementById('manualProdForm')) {
    document.getElementById('manualProdForm').addEventListener('submit', async (e) => { 
        e.preventDefault(); 
        const payload = { month: document.getElementById('pMonth').value, partCode: document.getElementById('pPartCode').value, description: document.getElementById('pDesc').value, plannedQty: document.getElementById('pPlanQty').value, actualQty: document.getElementById('pActQty').value, status: document.getElementById('pStatus').value }; 
        await fetch(`${API_URL}/production-market`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ payload: payload, user: currentUsername }) }); 
        showToast('Factory Record Logged!'); e.target.reset(); fetchProduction(); 
    });
}
if(document.getElementById('manualFreightForm')) {
    document.getElementById('manualFreightForm').addEventListener('submit', async (e) => { e.preventDefault(); const payload = { date: document.getElementById('fDate').value, customer: document.getElementById('fCustomer').value, partDetails: document.getElementById('fPart').value, qty: document.getElementById('fQty').value, weight: document.getElementById('fWt').value, actualCost: document.getElementById('fActCost').value, normalCost: document.getElementById('fNormCost').value, diff: document.getElementById('fActCost').value - document.getElementById('fNormCost').value, primaryDept: document.getElementById('fPriDept').value, secondaryDept: document.getElementById('fSecDept').value, remarks: document.getElementById('fRem').value }; await fetch(`${API_URL}/freight`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ payload: payload, user: currentUsername }) }); showToast('Freight Logged!'); e.target.reset(); fetchFreight(); });
}

function toggleWipeOptions() {
    const typeSelect = document.getElementById('uploadTypeSelector'); if (!typeSelect) return;
    const type = typeSelect.value; 
    const fyC = document.getElementById('fyBaseContainer'); const segC = document.getElementById('orderSegmentContainer'); const prodC = document.getElementById('prodMonthContainer');
    if(fyC) fyC.style.display = (type === 'order' || type === 'sale' || type === 'magic') ? 'block' : 'none';
    if(segC) segC.style.display = (type === 'order' || type === 'magic') ? 'block' : 'none';
    if(prodC) prodC.style.display = (type === 'order' || type === 'prod' || type === 'magic') ? 'block' : 'none';
}
window.toggleWipeOptions = toggleWipeOptions;

async function submitMagicUpload() {
    const type = document.getElementById('uploadTypeSelector') ? document.getElementById('uploadTypeSelector').value : 'magic'; 
    const fileInput = document.getElementById('excelFile'); if (!fileInput.files[0]) return showToast('Please select a file first!', 'error');
    const formData = new FormData(); formData.append('file', fileInput.files[0]); formData.append('wipeDatabase', document.getElementById('wipeDbSelect') ? document.getElementById('wipeDbSelect').value : 'false'); formData.append('user', currentUsername);
    if (type === 'order' || type === 'magic' || type === 'sale') { if(document.getElementById('fyBaseSelect')) formData.append('fyBase', document.getElementById('fyBaseSelect').value); if(document.getElementById('prodTargetMonth')) formData.append('targetMonth', document.getElementById('prodTargetMonth').value); if(document.getElementById('orderSegmentSelect')) formData.append('segment', document.getElementById('orderSegmentSelect').value); }
    if (type === 'prod') { if(document.getElementById('prodTargetMonth')) formData.append('targetMonth', document.getElementById('prodTargetMonth').value); }

    let endpoint = '/upload/magic'; const btn = document.getElementById('uploadBtn'); if(btn) btn.innerText = 'Processing...';
    try { 
        const res = await fetch(API_URL + endpoint, { method: 'POST', body: formData }); const result = await res.json();
        if (res.ok) { showToast(result.message || 'Upload Complete!'); setTimeout(() => { location.reload(); }, 1500); } else { showToast(result.error || 'Upload failed', 'error'); }
    } catch (err) { showToast('Error uploading file.', 'error'); }
    if(btn) btn.innerText = 'Process File';
}
window.submitMagicUpload = submitMagicUpload;


// ==========================================
// 🚀 UPGRADED: BULK ORDER GRID SYSTEM (VIRTUAL RAM CACHE)
// ==========================================
window.masterInventoryCache = [];
window.bulkCatalogCache = []; // Stores everything in RAM to prevent freezing

window.openBulkOrderModal = async function() {
    const tbody = document.getElementById('bulkPartsTableBody');
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:30px; font-size:1.2rem;">⏳ Syncing Live Inventory & Catalog...</td></tr>';
    document.getElementById('bulkOrderModal').style.display = 'flex';
    document.getElementById('bulkPartSearch').value = '';

    try {
        const res = await fetch(`${API_URL}/sync`);
        if (res.ok) {
            const data = await res.json();
            if (data.state && data.state.masterInventory) {
                window.masterInventoryCache = data.state.masterInventory;
            }
        }
    } catch(e) { console.warn("Failed to fetch live inventory", e); }

    let combinedParts = { ...masterPartDictionary };
    window.masterInventoryCache.forEach(item => {
        let code = item.partNo || item.code;
        if(code) {
            code = code.toUpperCase();
            if(!combinedParts[code]) combinedParts[code] = {};
            combinedParts[code].desc = item.description || combinedParts[code].desc || '';
            combinedParts[code].stock = item.currentStock || 0;
            combinedParts[code].type = item.type || combinedParts[code].type || '';
            combinedParts[code].size = item.size || combinedParts[code].size || '';
            combinedParts[code].af = item.af || combinedParts[code].af || '';
            combinedParts[code].pitch = item.pitch || combinedParts[code].pitch || '';
            combinedParts[code].length = item.length || combinedParts[code].length || '';
            combinedParts[code].grade = item.grade || combinedParts[code].grade || '';
            combinedParts[code].wt = item.wtPerPc || item.chWt || combinedParts[code].wt || 0;
        }
    });

    let partCodes = Object.keys(combinedParts).sort();
    if(partCodes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:30px; color:#dc2626; font-weight:bold;">⚠️ No parts found in Catalog or Inventory!</td></tr>';
        return;
    }

    // 🚀 BLAZING FAST: Cache the entire catalog into a flat array in RAM!
    window.bulkCatalogCache = partCodes.map(code => {
        let p = combinedParts[code];
        return {
            code: code,
            desc: p.desc || '-',
            stock: p.stock || 0,
            rate: p.rate || 0,
            qty: '', // Stores the typed quantity
            searchStr: `${code} ${p.desc || '-'}`.toUpperCase()
        };
    });

    // Draw the first 150 items instantly
    window.renderBulkGrid(window.bulkCatalogCache);
};

// 🚀 NEW: Draws the table purely from RAM (Stops Browser Freezing)
window.renderBulkGrid = function(dataArray) {
    // Only render top 150 items so the HTML drawing doesn't lag
    let visibleData = dataArray.slice(0, 150);
    let html = '';
    
    visibleData.forEach(p => {
        let stockColor = p.stock > 0 ? '#16a34a' : '#dc2626'; 
        
        html += `
        <tr class="bulk-part-row" style="background: white; transition: 0.2s;">
            <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;"><span style="background:#e0f2fe; color:#0369a1; padding:4px 8px; border-radius:4px; font-weight:900;" class="bulk-code">${p.code}</span></td>
            <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-size: 0.9rem; color:#475569;" class="bulk-desc">${p.desc}</td>
            <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-weight: 900; color: ${stockColor}; text-align: center; font-size: 1.1rem;">${fmtNum(p.stock)}</td>
            <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">
                <input type="number" step="0.01" class="prod-input bulk-rate" value="${p.rate}" onchange="updateBulkItemRate('${p.code}', this.value)" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-weight:bold; outline:none;">
            </td>
            <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; background: #f0fdf4;">
                <input type="number" class="prod-input bulk-qty" value="${p.qty}" placeholder="0" oninput="updateBulkItemQty('${p.code}', this.value)" style="width: 100%; padding: 8px; border: 2px solid #10b981; border-radius: 4px; font-weight: 900; color: #047857; text-align:center; outline:none;" onfocus="this.style.background='#dcfce7'" onblur="this.style.background='white'">
            </td>
        </tr>`;
    });
    
    // Add warning if items were hidden
    if (dataArray.length > 150) {
        html += `<tr><td colspan="5" style="text-align:center; padding:15px; color:#64748b; font-weight:bold; background:#f8fafc;">+ ${dataArray.length - 150} items hidden for speed. Keep typing in the search box to find them!</td></tr>`;
    }
    
    document.getElementById('bulkPartsTableBody').innerHTML = html;
};

// Instantly saves the quantity you type directly into RAM
window.updateBulkItemQty = function(code, val) {
    let item = window.bulkCatalogCache.find(p => p.code === code);
    if(item) item.qty = val;
};

// Instantly saves the rate you type directly into RAM
window.updateBulkItemRate = function(code, val) {
    let item = window.bulkCatalogCache.find(p => p.code === code);
    if(item) item.rate = val;
};

// 🚀 ZERO-LAG RAM FILTER (Replaces the slow HTML scraper)
window.filterBulkParts = function() {
    let filter = document.getElementById('bulkPartSearch').value.toUpperCase();
    
    // Filter the array directly in RAM (0 Milliseconds)
    let filteredParts = window.bulkCatalogCache.filter(p => p.searchStr.includes(filter));
    
    // Redraw the grid with the filtered array
    window.renderBulkGrid(filteredParts);
};

// Process directly from the RAM Cache
window.processBulkAdd = async function() {
    // Look at RAM to find anything the user typed a quantity for
    let itemsToProcess = window.bulkCatalogCache.filter(p => parseFloat(p.qty) > 0);
    let addedCount = 0;

    if(itemsToProcess.length === 0) return showToast("⚠️ Enter quantities for at least one item!", "error");

    const btn = document.getElementById('processBulkBtn');
    let ogText = btn.innerHTML;
    btn.innerHTML = "⏳ Adding to Cart...";
    btn.disabled = true;

    let combinedParts = { ...masterPartDictionary };
    (window.masterInventoryCache || []).forEach(item => {
        let code = (item.partNo || item.code || '').toUpperCase();
        if(code) {
            if(!combinedParts[code]) combinedParts[code] = {};
            combinedParts[code].desc = item.description || combinedParts[code].desc || '';
            combinedParts[code].stock = item.currentStock || 0;
            combinedParts[code].type = item.type || combinedParts[code].type || '';
            combinedParts[code].size = item.size || combinedParts[code].size || '';
            combinedParts[code].af = item.af || combinedParts[code].af || '';
            combinedParts[code].pitch = item.pitch || combinedParts[code].pitch || '';
            combinedParts[code].length = item.length || combinedParts[code].length || '';
            combinedParts[code].grade = item.grade || combinedParts[code].grade || '';
            combinedParts[code].wt = item.wtPerPc || item.chWt || combinedParts[code].wt || 0;
        }
    });

    for(let item of itemsToProcess) {
        let p = combinedParts[item.code] || {};
        let curStock = p.stock || 0;
        let qty = parseFloat(item.qty);
        let rate = parseFloat(item.rate) || 0;
        
        let shortage = qty - curStock;
        shortage = shortage > 0 ? shortage : 0;

        let existingItem = currentOrderCart.find(i => i.partCode.toUpperCase() === item.code);
        if(existingItem) {
            existingItem.orderQty += qty;
            let newShortage = existingItem.orderQty - curStock;
            existingItem.shortage = newShortage > 0 ? newShortage : 0;
        } else {
            currentOrderCart.push({ 
                partCode: item.code, description: p.desc || '', 
                type: p.type || '', size: p.size || '', af: p.af || '', pitch: p.pitch || '', length: p.length || '', grade: p.grade || '', 
                wtPerPc: parseFloat(p.wt) || 0, unitPrice: rate, orderQty: qty, dispatchQty: 0, shortage: shortage 
            });
        }
        addedCount++;
    }

    window.renderOrderCart();
    document.getElementById('bulkOrderModal').style.display = 'none';
    btn.innerHTML = ogText; btn.disabled = false;
    showToast(`✅ Boom! ${addedCount} items added to cart.`);
    
    // Wipe the RAM quantities clean for the next time you open the menu
    window.bulkCatalogCache.forEach(p => p.qty = '');
};


// ==========================================
// 🚀 UPGRADED: ORDER ENTRY & CART LOGIC
// ==========================================
window.addOrderItem = function() {
    const partCode = document.getElementById('oPartCode').value.trim().toUpperCase(); 
    const desc = document.getElementById('oDesc').value; 
    const ordQty = parseFloat(document.getElementById('oOrdQty').value) || 0; 
    const despQty = parseFloat(document.getElementById('oDespQty').value) || 0; 
    const rate = parseFloat(document.getElementById('oRate').value) || 0;
    
    if(!partCode || ordQty <= 0) return showToast("Part Code and Order Qty are required!", "error");

    const curStock = parseFloat(document.getElementById('oCurrentStock').value) || 0;
    const wtPerPc = parseFloat(document.getElementById('oWtPerPc').value) || 0;
    
    let existingItem = currentOrderCart.find(item => item.partCode.toUpperCase() === partCode);
    
    if (existingItem) {
        existingItem.orderQty += ordQty;
        existingItem.dispatchQty += despQty;
        let newShortage = existingItem.orderQty - curStock;
        existingItem.shortage = newShortage > 0 ? newShortage : 0;
        showToast(`🔄 Combined! ${partCode} total quantity is now ${existingItem.orderQty}`);
    } else {
        let shortage = ordQty - curStock;
        shortage = shortage > 0 ? shortage : 0;
        currentOrderCart.push({ 
            partCode, description: desc, type: document.getElementById('oType').value, size: document.getElementById('oSize').value, 
            af: document.getElementById('oAF').value, pitch: document.getElementById('oPitch').value, length: document.getElementById('oLength').value, 
            grade: document.getElementById('oGrade').value, wtPerPc: wtPerPc, unitPrice: rate, orderQty: ordQty, dispatchQty: despQty, shortage: shortage
        });
        showToast(`✅ Added ${partCode} to cart!`);
    }
    
    window.renderOrderCart(); 
    ['oPartCode','oType','oSize','oAF','oPitch','oLength','oGrade','oDesc','oWtPerPc','oRate','oOrdQty', 'oCurrentStock', 'oWOReq', 'oRMReq'].forEach(id => {
        if(document.getElementById(id)) document.getElementById(id).value = '';
    }); 
    document.getElementById('oDespQty').value = '0';
};

window.renderOrderCart = function() {
    const tbody = document.getElementById('orderItemsCart'); if(!tbody) return; tbody.innerHTML = '';
    currentOrderCart.forEach((item, index) => { tbody.innerHTML += `<tr><td><b>${item.partCode}</b></td><td>${item.description}</td><td>${fmtNum(item.orderQty)}</td><td style="color:#10b981; font-weight:bold;">${fmtNum(item.dispatchQty)}</td><td>₹${item.unitPrice}</td><td><button type="button" class="btn-delete" onclick="window.removeOrderItem(${index})">X</button></td></tr>`; });
};

window.removeOrderItem = function(index) { currentOrderCart.splice(index, 1); window.renderOrderCart(); };

window.submitEntireOrder = async function() {
    if(currentOrderCart.length === 0) return showToast("Add at least one item to the booking list!", "error");
    
    const dateVal = document.getElementById('oDate').value; 
    const targetMonth = dateVal + '-01'; 
    const segment = document.getElementById('oSegment').value; 
    const bookingDate = document.getElementById('oBookingDate').value; 
    const bookingNumber = document.getElementById('oBookingNo').value; 
    const customerName = document.getElementById('oCustomer').value;
    
    if(!dateVal || !bookingDate || !customerName || !bookingNumber) return showToast("Please fill all Header info!", "error");
    
    const payload = currentOrderCart.map(item => ({ date: targetMonth, segment, bookingNumber, bookingDate, customerName, ...item }));
    
    try {
        await fetch(`${API_URL}/orders`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ payload: payload, user: currentUsername }) }); 
        
        for (let item of currentOrderCart) {
            if (item.shortage > 0) {
                let rmRequired = (item.shortage * item.wtPerPc) / 1000; 
                let hash = 0; for(let i=0; i<customerName.length; i++) hash += customerName.charCodeAt(i);
                let custId = (hash % 900) + 100;
                let parts = dateVal.split('-');
                let fyStr = parseInt(parts[1]) >= 4 ? String(parts[0]).slice(-2) + String(parseInt(parts[0])+1).slice(-2) : String(parseInt(parts[0])-1).slice(-2) + String(parts[0]).slice(-2);
                let seq = String(Math.floor(1 + Math.random() * 999)).padStart(3, '0');
                let customWONumber = `WO${custId}${fyStr}${parts[1]}${seq}`; 
                
                await fetch(`${API_URL}/work-orders`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        woNumber: customWONumber, partNo: item.partCode, partName: item.description, targetQty: item.shortage,
                        type: item.type, size: item.size, pitch: item.pitch, length: item.length, gr: item.grade, af: item.af, chWt: item.wtPerPc, rmKg: rmRequired.toFixed(2),
                        status: 'REQUESTED', remarks: `Sales Auto-Request | Order: ${bookingNumber} | Cust: ${customerName}`, createdBy: currentUsername
                    })
                });
            }
        }
        showToast('✅ Order Logged & Production Alerts Sent!');
        currentOrderCart = []; window.renderOrderCart(); 
        if(typeof window.generateBookingNumber === 'function') window.generateBookingNumber();
        fetchOrders(); fetchSales();
    } catch(e) { showToast('Error saving order', 'error'); }
};

window.autoFillTimeout = window.autoFillTimeout || null;

window.globalAutoFill = async function(partCode) {
    clearTimeout(window.autoFillTimeout);
    if(!partCode || partCode.length < 2) return; 
    
    if (masterPartDictionary && masterPartDictionary[partCode.toUpperCase()]) {
        let p = masterPartDictionary[partCode.toUpperCase()];
        document.getElementById('oType').value = p.type || ''; document.getElementById('oSize').value = p.size || ''; document.getElementById('oAF').value = p.af || '';
        document.getElementById('oPitch').value = p.pitch || ''; document.getElementById('oLength').value = p.length || ''; document.getElementById('oGrade').value = p.grade || '';
        document.getElementById('oWtPerPc').value = p.wt || 0; document.getElementById('oRate').value = p.rate || 0;
        window.buildOrderDesc();
    }

    window.autoFillTimeout = setTimeout(async () => {
        try {
            const res = await fetch(`${API_URL}/product/${encodeURIComponent(partCode)}`);
            if (res.ok) {
                const prod = await res.json();
                document.getElementById('oCurrentStock').value = prod.currentStock || 0;
            } else { document.getElementById('oCurrentStock').value = 0; }
            window.calculateShortage();
        } catch(e) {}
    }, 400); 
};

window.buildOrderDesc = function() {
    let type = document.getElementById('oType').value; let size = document.getElementById('oSize').value;
    let pitch = document.getElementById('oPitch').value; let len = document.getElementById('oLength').value; let grade = document.getElementById('oGrade').value;
    document.getElementById('oDesc').value = `${type} ${size} x ${pitch} x ${len} ${grade}`.trim();
};

window.generateBookingNumber = function() {
    const cust = document.getElementById('oCustomer').value; let date = document.getElementById('oDate').value;
    if (!date) { date = new Date().toISOString().substring(0,7); document.getElementById('oDate').value = date; }
    if (cust) {
        let hash = 0; for(let i=0; i<cust.length; i++) { hash += cust.charCodeAt(i); }
        let custId = (hash % 900) + 100; 
        let parts = date.split('-'); let year = parseInt(parts[0]); let monthNum = parseInt(parts[1]);
        let fyStr = monthNum >= 4 ? String(year).slice(-2) + String(year+1).slice(-2) : String(year-1).slice(-2) + String(year).slice(-2);
        let mmStr = String(monthNum).padStart(2, '0');
        let seq = String(Math.floor(1 + Math.random() * 999)).padStart(3, '0');
        document.getElementById('oBookingNo').value = `${custId}${fyStr}${mmStr}${seq}`;
    } else { document.getElementById('oBookingNo').value = ''; }
};

window.calculateShortage = function() {
    let ordQty = parseFloat(document.getElementById('oOrdQty').value) || 0;
    let curStock = parseFloat(document.getElementById('oCurrentStock').value) || 0;
    let wtPerPc = parseFloat(document.getElementById('oWtPerPc').value) || 0;
    let shortage = ordQty - curStock; shortage = shortage > 0 ? shortage : 0;
    document.getElementById('oWOReq').value = shortage;
    let rmReq = (shortage * wtPerPc) / 1000;
    if(document.getElementById('oRMReq')) document.getElementById('oRMReq').value = rmReq.toFixed(2);
};

window.loadCustomers = async function() {
    try {
        const tbody = document.querySelector('#crmTable tbody');
        const thead = document.querySelector('#crmTable thead tr');
        const soSelect = document.getElementById('soCustomer');
        
        // 🚀 THE FIX: Read from RAM, only fetch if empty
        if (!window.allCustomers || window.allCustomers.length === 0) {
            if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">⏳ Loading Customers...</td></tr>';
            const res = await fetch(`${API_URL}/customers`);
            let rawData = await res.json();
            window.allCustomers = Array.isArray(rawData) ? rawData : (rawData.data || []);
        }

        let customers = window.allCustomers || [];

        if (soSelect) soSelect.innerHTML = '<option value="">- Select Customer -</option>';
        if (thead && !thead.innerHTML.includes('Promotions')) thead.innerHTML += `<th>Promotions</th>`;

        if (customers.length === 0) {
            if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 20px;">No customers found.</td></tr>';
            return;
        }

        let rowsHtml = '';
        customers.forEach(c => {
            rowsHtml += `<tr>
                <td><strong>${c.name || 'Unknown'}</strong></td>
                <td><strong>${c.sector || '-'}</strong><br><span style="font-size:11px; color:#666;">Zone: ${c.zone || '-'}</span></td>
                <td>📞 ${c.phone || '-'} <br> ✉️ ${c.email || '-'}</td>
                <td>${c.area || '-'}, ${c.state || '-'}<br><span style="font-size:11px; color:#666;">PIN: ${c.pinCode || '-'}</span></td>
                <td><span style="background:#17a2b8; color:white; padding:3px 6px; border-radius:3px; font-size:11px; font-weight:bold;">${c.transportMode || 'N/A'}</span></td>
                <td><button style="background:#007bff; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">Add Note</button></td>
                <td style="display: flex; flex-direction: column; gap: 5px; min-width: 130px;">
                    <button onclick="openIndividualPromo('banner', '${c._id}', '${c.name}', '${c.phone}')" style="background:#e83e8c; color:white; border:none; padding:5px; border-radius:4px; cursor:pointer; font-weight:bold; font-size: 11px;">🖼️ Send Banner</button>
                    <button onclick="openIndividualPromo('offer', '${c._id}', '${c.name}', '${c.phone}')" style="background:#ff9800; color:white; border:none; padding:5px; border-radius:4px; cursor:pointer; font-weight:bold; font-size: 11px;">🎁 Send Offer</button>
                    <button onclick="openIndividualPromo('discount', '${c._id}', '${c.name}', '${c.phone}')" style="background:#28a745; color:white; border:none; padding:5px; border-radius:4px; cursor:pointer; font-weight:bold; font-size: 11px;">📄 Send Discount</button>
                </td>
            </tr>`;
            if (soSelect) soSelect.innerHTML += `<option value="${c._id}">${c.name}</option>`;
        });
        if (tbody) tbody.innerHTML = rowsHtml;
    } catch (err) {
        const tbody = document.querySelector('#crmTable tbody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:red; padding: 20px;">Failed to load customers. Check server.</td></tr>';
    }
};

window.loadSalesOrders = async function() {
    try {
        const tbody = document.querySelector('#salesOrderTable tbody');
        
        // 🚀 THE FIX: Fetch from memory to prevent freezing!
        if (!window.allSalesOrders || window.allSalesOrders.length === 0) {
            if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">⏳ Loading Orders...</td></tr>';
            const res = await fetch(`${API_URL}/sales-orders`);
            let rawData = await res.json();
            window.allSalesOrders = Array.isArray(rawData) ? rawData : (rawData.data || []);
        }
        
        let orders = window.allSalesOrders || [];

        if (orders.length === 0) {
            if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 20px;">No sales orders found.</td></tr>';
            return;
        }

        let rowsHtml = '';
        // 🚀 SPEED FIX: Render top 100 rows instantly so the browser doesn't crash
        orders.slice(0, 100).forEach(o => { 
            const items = o.items || [];
            let itemsHtml = items.map(i => `<div style="margin-bottom: 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px;"><strong>${i.quantity || 0}x ${i.productCode || 'Unknown'}</strong><br><span style="font-size:11px; color:#555;">Sec: ${i.sector || '-'} | Gr: ${i.grade || '-'} | L: ${i.length || '-'}mm | A/F: ${i.af || '-'}</span></div>`).join('');
            let scrollableItemsHtml = `<div style="max-height: 130px; overflow-y: auto; padding: 5px; border: 1px solid #eee; border-radius: 4px; background: #fcfcfc;">${itemsHtml || 'No items'}</div>`;
            let statusColor = o.status === 'QUOTATION' ? '#6c757d' : (o.status === 'CONFIRMED' ? '#007bff' : (o.status === 'DISPATCHED' ? '#ff9800' : '#28a745'));

            let actionButtons = '';
            if (o.status === 'QUOTATION') actionButtons += `<button onclick="updateOrderStatus('${o._id}', 'CONFIRMED')" style="background:#007bff; color:white; border:none; padding:6px; border-radius:4px; cursor:pointer; width:100%; margin-bottom:5px;">✅ Confirm & Email</button>`;
            if (o.status === 'CONFIRMED') actionButtons += `<button onclick="updateOrderStatus('${o._id}', 'DISPATCHED')" style="background:#ff9800; color:white; border:none; padding:6px; border-radius:4px; cursor:pointer; width:100%; margin-bottom:5px;">📦 Dispatch</button>`;
            if (o.status === 'DISPATCHED') actionButtons += `<button onclick="updateOrderStatus('${o._id}', 'SHIPPED')" style="background:#17a2b8; color:white; border:none; padding:6px; border-radius:4px; cursor:pointer; width:100%; margin-bottom:5px;">🚚 Ship (Add Link)</button>`;
            if (o.status === 'SHIPPED') actionButtons += `<button onclick="updateOrderStatus('${o._id}', 'DELIVERED')" style="background:#28a745; color:white; border:none; padding:6px; border-radius:4px; cursor:pointer; width:100%; margin-bottom:5px;">🏁 Mark Delivered</button>`;
            if (o.status !== 'QUOTATION' && o.status !== 'CANCELLED') actionButtons += `<button onclick="downloadInvoice('${o._id}')" style="background:#dc3545; color:white; border:none; padding:6px; border-radius:4px; cursor:pointer; width:100%; font-weight:bold;">📄 Download Invoice</button>`;

            const grandTotal = o.grandTotal || 0;

            rowsHtml += `<tr>
                <td><strong>${o.orderNo || 'N/A'}</strong><br><span style="font-size:10px; color:#888;">${o.orderDate ? new Date(o.orderDate).toLocaleDateString() : '-'}</span></td>
                <td><strong>${o.customerName || 'Walk-in'}</strong></td>
                <td style="min-width: 200px;">${scrollableItemsHtml}</td>
                <td><strong>₹${grandTotal.toLocaleString()}</strong></td>
                <td><span style="background:${statusColor}; color:white; padding:4px 8px; border-radius:4px; font-weight:bold; font-size:11px;">${o.status || 'PENDING'}</span></td>
                <td style="min-width: 150px;">${actionButtons}</td>
                <td style="min-width: 100px;">
                    <button onclick="sendManualNotification('${o._id}', 'whatsapp')" style="background:#25D366; color:white; border:none; padding:6px; border-radius:4px; cursor:pointer; width:100%; margin-bottom:5px; font-weight:bold;">💬 WhatsApp</button>
                    <button onclick="sendManualNotification('${o._id}', 'email')" style="background:#e83e8c; color:white; border:none; padding:6px; border-radius:4px; cursor:pointer; width:100%; font-weight:bold;">📧 Email</button>
                </td>
            </tr>`;
        });
        
        if (orders.length > 100) {
            rowsHtml += `<tr><td colspan="7" style="text-align:center; padding:15px; background:#f8fafc; color:#64748b; font-weight:bold; border-top: 2px dashed #ccc;">+ ${orders.length - 100} older orders hidden for speed.</td></tr>`;
        }
        
        if (tbody) tbody.innerHTML = rowsHtml;
    } catch (err) {
        const tbody = document.querySelector('#salesOrderTable tbody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:red; padding: 20px;">Failed to load orders. Check console.</td></tr>';
    }
};