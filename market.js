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
        else { return alert("Invalid Credentials!"); }
        
        localStorage.setItem('userRole', currentUserRole); localStorage.setItem('username', currentUsername);
        document.getElementById('loginOverlay').style.display = 'none';
        applyRolePermissions(); bootSystem();
    });
}

function logout() { localStorage.removeItem('userRole'); localStorage.removeItem('username'); location.reload(); }
function applyRolePermissions() {
    if(document.getElementById('userRoleBadge')) document.getElementById('userRoleBadge').innerText = `LOGGED IN AS: ${currentUserRole}`;
    if (currentUserRole === 'MARKETER') {
        document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
        document.querySelectorAll('.btn-delete').forEach(el => el.style.display = 'none');
        if(document.getElementById('BulkImportNav')) document.getElementById('BulkImportNav').style.display = 'none';
    }
}

function bootSystem() {
    fetchDealers();
    fetchTargets();
    fetchSales();
    fetchOrders();
    fetchProduction();
    fetchFreight();
    fetchVisits();
    fetchExpenses();
    if(currentUserRole === 'ADMIN') fetchAuditLogs();
    
    setTimeout(() => { 
        checkPaymentOverdue();
        updateNotificationCenter(); 
        updateDailyReports(); 
    }, 1500);
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

// ==========================================
// 🚨 4. UI NAVIGATION & TABS 🚨
// ==========================================
function switchTab(tabId, type) {
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    if(event && event.currentTarget) event.currentTarget.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    const t = document.getElementById(tabId); if(t) t.classList.add('active');

    if (type === 'dealer') { closeDealerProfile(); fetchDealers(); }
    else if (type === 'target') { fetchTargets(); }
    else if (type === 'sales') { fetchSales(); }
    else if (type === 'order') { fetchOrders(); }
    else if (type === 'production') { fetchProduction(); }
    else if (type === 'freight') { fetchFreight(); }
    else if (type === 'visits') { fetchVisits(); setTimeout(()=> { renderCalendar(); }, 200); }
    else if (type === 'expense') { fetchExpenses(); }
    else if (type === 'audit') { fetchAuditLogs(); }
    else if (type === 'reports') { updateDailyReports(); }
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

function changeFY(module) {
    if (module === 'sales') { activeSalesFY = document.getElementById('fySelector').value; activeSalesMonth = 'ALL'; renderSalesTabs(); }
    else if (module === 'order') { activeOrderFY = document.getElementById('fySelectorOrder').value; activeOrderMonth = 'ALL'; renderOrderTabs(); }
    else if (module === 'targets') { activeTargetFY = document.getElementById('fySelectorTarget').value; renderTargetsTable(); }
}

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

async function fetchDealers() {
    try {
        const wrapper = document.getElementById('dealerGridWrapper');
        if (wrapper) wrapper.innerHTML = '<div style="padding:20px; font-weight:bold; color:#64748b;">Loading Directory...</div>';

        const [dRes, oRes, sRes, tRes] = await Promise.all([ fetch(`${API_URL}/dealers/${currentDealerCategory}?search=${encodeURIComponent(currentDealerSearch)}`), fetch(`${API_URL}/orders`), fetch(`${API_URL}/sales`), fetch(`${API_URL}/targets`) ]);
        const { dealers } = await dRes.json(); rawOrderData = (await oRes.json()).orders || []; rawSalesData = (await sRes.json()).sales || []; rawTargetsData = (await tRes.json()).targets || [];

        let aCount = dealers.filter(d => d.status === 'ACTIVE').length; let iCount = dealers.filter(d => d.status === 'INACTIVE').length;
        if(document.getElementById('countActive')) document.getElementById('countActive').innerText = aCount; if(document.getElementById('countInactive')) document.getElementById('countInactive').innerText = iCount;

        dealers.sort((a, b) => { let nameA = (a.data && a.data.Name) ? String(a.data.Name).toUpperCase() : ''; let nameB = (b.data && b.data.Name) ? String(b.data.Name).toUpperCase() : ''; return nameA.localeCompare(nameB); });
        currentDealersData = dealers; populateCustomerDropdown();
        
        let dynHeaders = new Set(); dealers.forEach(d => { if(d.data) Object.keys(d.data).forEach(k => { if(k && k!=='undefined' && !k.includes('__EMPTY')) dynHeaders.add(k); }); });
        let baseCols = ['Name', 'Seg', 'Connect', 'Visit', 'Business', 'Payment', 'Response', 'G', 'Y', 'B', 'Person', 'Number', 'Email', 'Address', 'City', 'State', 'Remarks'];
        currentDealerColumns = []; baseCols.forEach(c => { let match = Array.from(dynHeaders).find(h => h.toLowerCase() === c.toLowerCase()); if (match) { currentDealerColumns.push(match); dynHeaders.delete(match); } }); Array.from(dynHeaders).forEach(c => currentDealerColumns.push(c)); 
        
        let html = '<div class="dealer-grid">';
        dealers.forEach((d) => { 
            let c = d.status === 'ACTIVE' ? 'status-active' : 'status-inactive'; const isInactive = d.status === 'INACTIVE'; const cardBg = isInactive ? 'background:#fee2e2; border-color:#fca5a5;' : '';
            let dName = (d.data && d.data.Name) ? String(d.data.Name) : 'Unknown Dealer'; let location = [d.data.City, d.data.State].filter(Boolean).join(', ') || 'No Location Provided';
            let gybHtml = '';
            ['G', 'Y', 'B'].forEach(key => { let v = String(d.data[key] || '').toUpperCase(); if(v === 'G') gybHtml += '<span class="color-block block-g" style="width:22px;height:22px;font-size:0.75rem;margin-right:6px;display:inline-flex;">G</span>'; if(v === 'Y') gybHtml += '<span class="color-block block-y" style="width:22px;height:22px;font-size:0.75rem;margin-right:6px;display:inline-flex;">Y</span>'; if(v === 'B') gybHtml += '<span class="color-block block-b" style="width:22px;height:22px;font-size:0.75rem;margin-right:6px;display:inline-flex;">B</span>'; });

            html += `<div class="dealer-card" style="${cardBg}" onclick="openDealerProfile('${d._id}')">
                <button class="status-badge ${c}">${d.status}</button>
                <div><h3 style="${isInactive ? 'color:#991b1b;' : ''}">${escapeHtml(dName)}</h3><p class="location" style="${isInactive ? 'color:#b91c1c;' : ''}">📍 ${escapeHtml(location)}</p><div style="margin-top:10px;">${gybHtml}</div></div>
                <button class="btn-delete admin-only" onclick="event.stopPropagation(); deleteRecord('dealers', '${d._id}')">Delete</button>
            </div>`;
        });
        html += '</div>';
        if(document.getElementById('dealerGridWrapper')) document.getElementById('dealerGridWrapper').innerHTML = html;
        applyRolePermissions();
    } catch (err) { console.error(err); }
}

function openDealerProfile(id) {
    currentProfileDealerId = id;
    const dealer = currentDealersData.find(d => d._id === id); if(!dealer) return;
    let dName = (dealer.data && dealer.data.Name) ? String(dealer.data.Name).trim() : 'Unknown Dealer'; document.getElementById('profDealerName').innerText = dName;
    let c = dealer.status === 'ACTIVE' ? 'status-active' : 'status-inactive'; document.getElementById('profStatusContainer').innerHTML = `<button class="status-badge ${c}" style="font-size:1rem; padding:8px 20px;" onclick="toggleDealerStatus('${dealer._id}', '${dealer.status}')">${dealer.status}</button>`;

    const fySet = new Set(); rawOrderData.forEach(o => { if(o.fy && o.fy !== 'Unknown') fySet.add(o.fy); });
    let tFYs = Array.from(fySet).sort().reverse();
    const profSelect = document.getElementById('profFySelector');
    if (profSelect) { profSelect.innerHTML = `<option value="ALL">🌎 All Time</option>` + tFYs.map(fy => `<option value="${fy}">${fy}</option>`).join(''); }

    updateDealerProfileStats();

    let formHtml = '';
    currentDealerColumns.forEach(col => {
        let val = String(dealer.data[col] || '').trim(); let colorClass = '';
        if(['G','Y','B'].includes(val.toUpperCase())) { if(val.toUpperCase() === 'G') colorClass = 'input-g'; if(val.toUpperCase() === 'Y') colorClass = 'input-y'; if(val.toUpperCase() === 'B') colorClass = 'input-b'; }
        formHtml += `<div class="form-group ${col === 'Name' || col === 'Remarks' || col === 'Address' ? 'full' : 'third'}"><label>${col}</label><input type="text" id="editProf_${col}" name="${col}" value="${escapeHtml(val)}" class="${colorClass}" oninput="colorCodeInput(this)"></div>`;
    });
    document.getElementById('dealerProfileFields').innerHTML = formHtml;

    document.getElementById('dealerProfileForm').onsubmit = async function(e) {
        e.preventDefault(); let updatedData = {};
        currentDealerColumns.forEach(col => { let inputVal = document.getElementById(`editProf_${col}`).value.trim(); if (['g','y','b'].includes(inputVal.toLowerCase()) && inputVal.length === 1) inputVal = inputVal.toUpperCase(); if (inputVal !== '') updatedData[col] = inputVal; });
        await fetch(`${API_URL}/dealers/${dealer._id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({data: updatedData}) }); showToast('Dealer Profile Saved Successfully!'); fetchDealers(); 
    };

    document.getElementById('dealerListView').style.display = 'none'; document.getElementById('dealerDetailView').style.display = 'block';
}

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
    } catch(e) { console.error(e); }
}

function renderSalesTabs() {
    const months = new Set(); rawSalesData.forEach(s => { if(s.fy === activeSalesFY && s.date) months.add(s.date.substring(0, 7)); });
    let html = `<div class="excel-tab ${activeSalesMonth === 'ALL' ? 'active' : ''}" onclick="setMonth('sales', 'ALL')">🌎 Full Year</div>`;
    Array.from(months).sort().forEach(m => { const dateObj = new Date(m + '-01'); const monthName = `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][dateObj.getMonth()]}-${String(dateObj.getFullYear()).slice(-2)}`; html += `<div class="excel-tab ${activeSalesMonth === m ? 'active' : ''}" onclick="setMonth('sales', '${m}')">📁 ${monthName}</div>`; });
    if(document.getElementById('salesMonthTabs')) document.getElementById('salesMonthTabs').innerHTML = html;
    const delBtn = document.getElementById('deleteMonthBtn'); if(delBtn) delBtn.style.display = (activeSalesMonth !== 'ALL') ? 'inline-block' : 'none';
    renderSalesTable();
}

function renderSalesTable() {
    const viewType = document.getElementById('salesViewFilter') ? document.getElementById('salesViewFilter').value : 'summary';
    let filteredData = rawSalesData.filter(s => s.fy === activeSalesFY); if (activeSalesMonth !== 'ALL') { filteredData = filteredData.filter(s => s.date && s.date.startsWith(activeSalesMonth)); }
    
    const searchStr = document.getElementById('salesSearch') ? document.getElementById('salesSearch').value.toLowerCase() : '';
    const fromDate = document.getElementById('salesFromDate') ? document.getElementById('salesFromDate').value : '';
    const toDate = document.getElementById('salesToDate') ? document.getElementById('salesToDate').value : '';

    if (fromDate) filteredData = filteredData.filter(s => s.date >= fromDate);
    if (toDate) filteredData = filteredData.filter(s => s.date <= toDate);
    if (searchStr) { filteredData = filteredData.filter(s => { return (s.partCode && s.partCode.toLowerCase().includes(searchStr)) || (s.description && s.description.toLowerCase().includes(searchStr)) || (s.customerName && s.customerName.toLowerCase().includes(searchStr)) || (s.date && s.date.toLowerCase().includes(searchStr)); }); }

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
            filteredData.forEach(s => { html += `<tr><td style="font-weight:700;">${s.date}</td><td>${s.customerName || '-'}</td><td><span class="part-code">${s.partCode || 'N/A'}</span></td><td>${fmtNum(s.wtPerPc)}</td><td>${fmtNum(s.quantity)}</td><td class="currency">${fmtMoney(s.value)}</td><td class="admin-only"><button class="btn-delete" onclick="deleteRecord('sales', '${s._id}')">X</button></td></tr>`; });
        } else {
            document.getElementById('salesTableHead').innerHTML = `<tr><th>Part Code</th><th>Description</th><th>Wt/Pc (g)</th><th>Total Qty Sold</th><th>Total Tonnage (KG)</th><th>Total Revenue (₹)</th></tr>`;
            sortedPartsByVal.forEach(data => { html += `<tr><td><span class="part-code">${data.partCode || 'N/A'}</span></td><td>${data.desc}</td><td>${fmtNum(data.wtPerPc)}</td><td>${fmtNum(data.qty)} Pcs</td><td style="font-weight:800; color:var(--sales-blue);">${fmtNum(data.wt)} KG</td><td class="currency" style="font-size:1rem;">${fmtMoney(data.val)}</td></tr>`; });
        }
        document.getElementById('salesTableBody').innerHTML = html;
        applyRolePermissions();
    }
    if(document.getElementById('totVal')) { document.getElementById('totVal').innerText = fmtMoney(totalValue); document.getElementById('totWt').innerText = fmtNum(totalWeight) + ' KG'; document.getElementById('avgReal').innerText = fmtMoney(totalWeight > 0 ? (totalValue / totalWeight) : 0) + ' / KG'; }
    if(sortedPartsByVal.length > 0) {
        if(document.getElementById('topProdVal')) document.getElementById('topProdVal').innerText = sortedPartsByVal[0].partCode || '-'; 
        let sortedByQty = [...sortedPartsByVal].sort((a,b) => b.qty - a.qty);
        if(document.getElementById('topProdQty')) document.getElementById('topProdQty').innerText = sortedByQty[0].partCode || '-';
    }

    destroyChart('monthlyRevChart'); destroyChart('monthlyQtyChart'); destroyChart('salesBarChart'); destroyChart('qtyBarChart');
    const top10Val = sortedPartsByVal.slice(0, 10); const top10Qty = [...sortedPartsByVal].sort((a,b) => b.qty - a.qty).slice(0, 10);
    const mKeys = Object.keys(monthlyRevAgg).sort(); const mLabels = mKeys.map(m => m.substring(5)); 
    if(document.getElementById('monthlyRevChart') && document.getElementById('SalesDashboard').classList.contains('active')) {
        chartInstances.monthlyRevChart = new Chart(document.getElementById('monthlyRevChart').getContext('2d'), { type: 'bar', data: { labels: mLabels, datasets: [{ label: 'Revenue', data: mKeys.map(m => monthlyRevAgg[m]), backgroundColor: '#ff6b00' }] }, options:{responsive:true, maintainAspectRatio:false} }); 
        chartInstances.monthlyQtyChart = new Chart(document.getElementById('monthlyQtyChart').getContext('2d'), { type: 'bar', data: { labels: mLabels, datasets: [{ label: 'Volume', data: mKeys.map(m => monthlyQtyAgg[m]), backgroundColor: '#8b5cf6' }] }, options:{responsive:true, maintainAspectRatio:false} }); 
        chartInstances.salesBarChart = new Chart(document.getElementById('salesBarChart').getContext('2d'), { type: 'bar', data: { labels: top10Val.map(d=>d.partCode), datasets: [{ label: 'Revenue', data: top10Val.map(d=>d.val), backgroundColor: '#2563eb' }] }, options:{responsive:true, maintainAspectRatio:false} }); 
        chartInstances.qtyBarChart = new Chart(document.getElementById('qtyBarChart').getContext('2d'), { type: 'bar', data: { labels: top10Qty.map(d=>d.partCode), datasets: [{ label: 'Volume', data: top10Qty.map(d=>d.qty), backgroundColor: '#10b981' }] }, options:{responsive:true, maintainAspectRatio:false} }); 
    }

    let phtml = ''; let topPredictTable = [...sortedPartsByVal].sort((a,b) => b.qty - a.qty).slice(0, 50); 
    topPredictTable.forEach((p) => { let monthsActive = p.months.size || 1; let runRate = Math.round(p.qty / monthsActive); let recommendedBuild = Math.round(runRate * 1.5); let estValue = recommendedBuild * (p.qty > 0 ? (p.val / p.qty) : 0); phtml += `<tr><td><span class="part-code">${p.partCode || 'N/A'}</span></td><td>${p.desc}</td><td>${fmtNum(p.wtPerPc)}</td><td>${fmtNum(p.qty)}</td><td>${monthsActive}</td><td style="font-weight:700;">${fmtNum(runRate)} /mo</td><td style="background:#dcfce7; font-weight:900; color:#166534;">${fmtNum(recommendedBuild)}</td><td class="currency">${fmtMoney(estValue)}</td></tr>`; });
    if(document.getElementById('predictionsTableBody')) document.getElementById('predictionsTableBody').innerHTML = phtml;
}

window.fetchSales = fetchSales; window.renderSalesTabs = renderSalesTabs; window.renderSalesTable = renderSalesTable;

// ==========================================
// 🚨 13. ORDER COMPLIANCE & ACCOUNTS 🚨
// ==========================================
if(document.getElementById('orderSearch')) document.getElementById('orderSearch').addEventListener('input', () => { renderOrderTable(); });

async function fetchOrders() {
    try {
        const tbody = document.getElementById('orderTableBody'); if (tbody) tbody.innerHTML = '<tr><td colspan="12" style="text-align:center; padding: 20px; font-weight:bold; color:#64748b;">Loading Order Data...</td></tr>';
        const res = await fetch(`${API_URL}/orders`); const { orders } = await res.json();
        rawOrderData = orders.map(o => { updateMasterDictionary(o); return { ...o, fy: getFY(o.date) }; });
        targetOrdersData = rawOrderData; 
        populateCustomerDropdown();

        const fySet = new Set(); rawOrderData.forEach(o => { if(o.fy !== 'Unknown') fySet.add(o.fy); }); let orderFYs = Array.from(fySet).sort().reverse();
        const fySelect = document.getElementById('fySelectorOrder');
        if (orderFYs.length > 0 && fySelect) { if (!activeOrderFY || !orderFYs.includes(activeOrderFY)) activeOrderFY = orderFYs[0]; fySelect.innerHTML = orderFYs.map(fy => `<option value="${fy}" ${fy === activeOrderFY ? 'selected' : ''}>${fy}</option>`).join(''); } 
        renderOrderTabs();
    } catch(e) { console.error(e); }
}

function renderOrderTabs() {
    const segmentFilter = document.getElementById('segmentFilterOrder') ? document.getElementById('segmentFilterOrder').value : 'ALL';
    let segData = rawOrderData.filter(o => o.fy === activeOrderFY); if (segmentFilter !== 'ALL') segData = segData.filter(o => o.segment === segmentFilter);
    const months = new Set(); segData.forEach(o => { if(o.date) months.add(o.date.substring(0, 7)); });
    let html = `<div class="excel-tab ${activeOrderMonth === 'ALL' ? 'active order' : ''}" onclick="setMonth('order', 'ALL')">🌎 Full Year</div>`;
    Array.from(months).sort().forEach(m => { html += `<div class="excel-tab ${activeOrderMonth === m ? 'active order' : ''}" onclick="setMonth('order', '${m}')">📁 ${m}</div>`; });
    if(document.getElementById('orderMonthTabs')) document.getElementById('orderMonthTabs').innerHTML = html;
    const delBtn = document.getElementById('deleteOrderMonthBtn'); if(delBtn) delBtn.style.display = (activeOrderMonth !== 'ALL') ? 'inline-block' : 'none';
    renderOrderTable(segData);
}

async function editOrderRate(id, currentRate) { const { value: pin } = await Swal.fire({ title: 'Security PIN Required', input: 'password', inputLabel: 'Enter PIN (Default: 1234)', showCancelButton: true }); if (pin !== '1234') { if (pin) Swal.fire('Access Denied', 'Incorrect PIN', 'error'); return; } const { value: newRate } = await Swal.fire({ title: 'Update Rate (₹)', input: 'number', inputValue: currentRate, inputAttributes: { step: '0.01' }, showCancelButton: true }); if (newRate) { await fetch(`${API_URL}/orders/${id}`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ unitPrice: newRate }) }); showToast('Rate updated!'); fetchOrders(); } }
async function updateDespatch(id, partCode) { const { value: qty } = await Swal.fire({ title: `Log Daily Dispatch`, text: `How many items did you dispatch TODAY for ${partCode}?`, input: 'number', showCancelButton: true }); if (qty && parseFloat(qty) > 0) { const { value: dDate } = await Swal.fire({ title: 'Dispatch Date', input: 'date', inputValue: new Date().toISOString().substring(0,10), showCancelButton: true }); if(dDate) { await fetch(`${API_URL}/orders/${id}/dispatch`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ qtyToday: qty, date: dDate, user: currentUsername }) }); showToast('Dispatch recorded & synced to Sales!'); fetchOrders(); fetchSales(); } } }
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

function renderOrderTable(segData) {
    if (!segData) {
        const segmentFilter = document.getElementById('segmentFilterOrder') ? document.getElementById('segmentFilterOrder').value : 'ALL';
        segData = rawOrderData.filter(o => o.fy === activeOrderFY);
        if (segmentFilter !== 'ALL') segData = segData.filter(o => o.segment === segmentFilter);
    }
    const viewType = document.getElementById('orderViewFilter') ? document.getElementById('orderViewFilter').value : 'summary';
    let filteredData = segData; 
    if (activeOrderMonth !== 'ALL') { filteredData = filteredData.filter(o => o.date && o.date.startsWith(activeOrderMonth)); }

    const searchStr = document.getElementById('orderSearch') ? document.getElementById('orderSearch').value.toLowerCase() : '';
    if (searchStr) {
        filteredData = filteredData.filter(o => {
            return (o.monthName && o.monthName.toLowerCase().includes(searchStr)) || (o.bookingDate && o.bookingDate.toLowerCase().includes(searchStr)) || (o.bookingNumber && String(o.bookingNumber).toLowerCase().includes(searchStr)) || (o.customerName && o.customerName.toLowerCase().includes(searchStr)) || (o.partCode && o.partCode.toLowerCase().includes(searchStr)) || (o.description && o.description.toLowerCase().includes(searchStr)) || (o.type && o.type.toLowerCase().includes(searchStr)) || (o.size && o.size.toLowerCase().includes(searchStr)) || (o.af && o.af.toLowerCase().includes(searchStr)) || (o.pitch && String(o.pitch).toLowerCase().includes(searchStr)) || (o.length && String(o.length).toLowerCase().includes(searchStr)) || (o.grade && o.grade.toLowerCase().includes(searchStr));
        });
    }

    let totOrd = 0, totDesp = 0, totOrdVal = 0, totDespVal = 0, html = ''; let monthlyOrdAgg = {}, monthlyDespAgg = {}; const partMap = {}; const custMap = {};

    filteredData.forEach(o => {
        totOrd += (o.orderQty || 0); totDesp += (o.dispatchQty || 0); totOrdVal += (o.schValue || 0); totDespVal += (o.dispatchValue || 0);
        let m = o.date ? o.date.substring(0,7) : 'Unk'; monthlyOrdAgg[m] = (monthlyOrdAgg[m] || 0) + (o.orderQty || 0); monthlyDespAgg[m] = (monthlyDespAgg[m] || 0) + (o.dispatchQty || 0);
        const key = o.partCode || o.description || 'Unknown';
        if(!partMap[key]) partMap[key] = { partCode: o.partCode, desc: o.description, type: o.type, size: o.size, af: o.af, pitch: o.pitch, length: o.length, grade: o.grade, rate: o.unitPrice, planQty:0, ordQty:0, despQty:0, ordVal:0, despVal:0, balQty:0, pendVal:0, wt: o.wtPerPc, ordWt:0, despWt:0 };
        partMap[key].planQty += (o.plannedSaleQty || 0); partMap[key].ordQty += (o.orderQty || 0); partMap[key].despQty += (o.dispatchQty || 0); partMap[key].ordVal += (o.schValue || 0); partMap[key].despVal += (o.dispatchValue || 0); partMap[key].balQty += (o.balanceQty || 0); partMap[key].pendVal += (o.pendingDispatchValue || 0); partMap[key].ordWt += (o.orderWt || 0); partMap[key].despWt += (o.despWt || 0);
        const custKey = o.customerName || 'Unknown Customer'; if(!custMap[custKey]) custMap[custKey] = { name: custKey, ordQty:0, ordVal:0 }; custMap[custKey].ordQty += (o.orderQty || 0); custMap[custKey].ordVal += (o.schValue || 0);
    });

    if(document.getElementById('orderTableHead')) {
        if (viewType === 'daily') {
            document.getElementById('orderTableHead').innerHTML = `<tr><th>Month</th><th>Bk Date</th><th>Bk No</th><th>Customer</th><th>Part Code</th><th>Type</th><th>Size</th><th>A/F</th><th>Pitch</th><th>Len</th><th>Grade</th><th>Wt/Pc</th><th>Plan Qty</th><th>Ord Qty</th><th style="color:#10b981;">Desp Qty</th><th>Bal Qty</th><th style="color:#2563eb;">Price/Pc</th><th>Sch Val</th><th>Desp Val</th><th>Paid (₹)</th><th>Due (₹)</th><th>Comp %</th><th>Desp Month</th><th>Desp Delay</th><th>Remarks</th><th>Print</th><th class="admin-only">Del</th></tr>`;
            filteredData.forEach(o => {
                let compColor = o.compliance >= 90 ? '#16a34a' : (o.compliance >= 70 ? '#ca8a04' : '#dc2626');
                let paid = o.paidAmount || 0; let due = (o.dispatchValue || 0) - paid;
                html += `<tr>
                    <td>${o.monthName || '-'}</td><td style="font-weight:700;">${o.bookingDate || '-'}</td><td class="editable-cell" style="font-weight:800; color:#4338ca;" onclick="editOrderBooking('${o._id}', '${o.bookingNumber}')">${o.bookingNumber || '-'} ✏️</td><td>${o.customerName || '-'}</td>
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
        document.getElementById('orderTableBody').innerHTML = html;
        applyRolePermissions();
    }

    if(document.getElementById('totOrderQty')) { 
        document.getElementById('totOrderQty').innerText = fmtNum(totOrd) + ' Pcs'; 
        document.getElementById('totDespQty').innerText = fmtNum(totDesp) + ' Pcs'; 
        document.getElementById('totCompliance').innerText = totOrd > 0 ? ((totDesp / totOrd) * 100).toFixed(1) + '%' : '0%'; 
        if (document.getElementById('lostRevValue')) { let totalLostRev = Math.max(0, totOrdVal - totDespVal); document.getElementById('lostRevValue').innerText = fmtMoney(totalLostRev); }
    }

    destroyChart('orderTimelineChart'); destroyChart('topCustRevChart'); destroyChart('topCustVolChart');
    if(document.getElementById('orderTimelineChart') && document.getElementById('OrderDashboard').classList.contains('active')) {
        const mKeys = Object.keys(monthlyOrdAgg).sort(); 
        chartInstances.orderTimelineChart = new Chart(document.getElementById('orderTimelineChart').getContext('2d'), { type: 'bar', data: { labels: mKeys, datasets: [{ label: 'Ordered', data: mKeys.map(m => monthlyOrdAgg[m]), backgroundColor: '#8b5cf6' }, { label: 'Despatched', data: mKeys.map(m => monthlyDespAgg[m]), backgroundColor: '#10b981' }] }, options:{responsive:true, maintainAspectRatio:false} });
        const top10Rev = Object.values(custMap).sort((a,b) => b.ordVal - a.ordVal).slice(0, 10); const top10Vol = Object.values(custMap).sort((a,b) => b.ordQty - a.ordQty).slice(0, 10);
        chartInstances.topCustRevChart = new Chart(document.getElementById('topCustRevChart').getContext('2d'), { type: 'bar', data: { labels: top10Rev.map(c => c.name.substring(0,10)), datasets: [{ label: 'Revenue', data: top10Rev.map(c => c.ordVal), backgroundColor: '#8b5cf6' }] }, options: { indexAxis: 'y', responsive:true, maintainAspectRatio:false } });
        chartInstances.topCustVolChart = new Chart(document.getElementById('topCustVolChart').getContext('2d'), { type: 'bar', data: { labels: top10Vol.map(c => c.name.substring(0,10)), datasets: [{ label: 'Volume', data: top10Vol.map(c => c.ordQty), backgroundColor: '#3b82f6' }] }, options: { indexAxis: 'y', responsive:true, maintainAspectRatio:false } });
    }
}

window.fetchOrders = fetchOrders; window.renderOrderTabs = renderOrderTabs; window.renderOrderTable = renderOrderTable;
window.editOrderRate = editOrderRate; window.updateDespatch = updateDespatch; window.logPayment = logPayment; window.editOrderBooking = editOrderBooking; window.editOrderWt = editOrderWt; window.printInvoice = printInvoice;

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

function addOrderItem() {
            const partCode = document.getElementById('oPartCode').value; 
            const desc = document.getElementById('oDesc').value; 
            const ordQty = parseFloat(document.getElementById('oOrdQty').value) || 0; 
            const despQty = parseFloat(document.getElementById('oDespQty').value) || 0; 
            const rate = parseFloat(document.getElementById('oRate').value) || 0;
            const shortage = parseFloat(document.getElementById('oWOReq').value) || 0; // Grab shortage
            
            if(!partCode || ordQty <= 0) return showToast("Part Code and Order Qty are required!", "error");
            
            currentOrderCart.push({ 
                partCode, description: desc, type: document.getElementById('oType').value, size: document.getElementById('oSize').value, 
                af: document.getElementById('oAF').value, pitch: document.getElementById('oPitch').value, length: document.getElementById('oLength').value, 
                grade: document.getElementById('oGrade').value, wtPerPc: parseFloat(document.getElementById('oWtPerPc').value) || 0, 
                unitPrice: rate, orderQty: ordQty, dispatchQty: despQty, shortage: shortage // Save shortage
            });
            
            renderOrderCart(); 
            ['oPartCode','oType','oSize','oAF','oPitch','oLength','oGrade','oDesc','oWtPerPc','oRate','oOrdQty', 'oCurrentStock', 'oWOReq'].forEach(id => {
                if(document.getElementById(id)) document.getElementById(id).value = ''
            }); 
            document.getElementById('oDespQty').value = '0';
        }
window.addOrderItem = addOrderItem;

function renderOrderCart() {
    const tbody = document.getElementById('orderItemsCart'); if(!tbody) return; tbody.innerHTML = '';
    currentOrderCart.forEach((item, index) => { tbody.innerHTML += `<tr><td><b>${item.partCode}</b></td><td>${item.description}</td><td>${fmtNum(item.orderQty)}</td><td style="color:#10b981; font-weight:bold;">${fmtNum(item.dispatchQty)}</td><td>₹${item.unitPrice}</td><td><button type="button" class="btn-delete" onclick="removeOrderItem(${index})">X</button></td></tr>`; });
}
window.renderOrderCart = renderOrderCart;

function removeOrderItem(index) { currentOrderCart.splice(index, 1); renderOrderCart(); }
window.removeOrderItem = removeOrderItem;

async function submitEntireOrder() {
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
                // 1. Save the Sales Order
                await fetch(`${API_URL}/orders`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ payload: payload, user: currentUsername }) }); 
                
                // 2. ⚡ TIGHT INTEGRATION: Generate WO Requests for any shortages ⚡
                for (let item of currentOrderCart) {
                    if (item.shortage > 0) {
                        let rmRequired = (item.shortage * item.wtPerPc) / 1000; // Auto-calc RM KG
                        
                        await fetch(`${API_URL}/work-orders`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                woNumber: `WO-REQ-${Date.now().toString().slice(-5)}`,
                                partNo: item.partCode,
                                partName: item.description,
                                targetQty: item.shortage,
                                type: item.type, size: item.size, pitch: item.pitch, length: item.length, gr: item.grade, af: item.af,
                                chWt: item.wtPerPc,
                                rmKg: rmRequired,
                                status: 'REQUESTED', // Flags it for PPC review!
                                remarks: `Sales Auto-Request | Order: ${bookingNumber} | Cust: ${customerName} | RM Needed: ${((item.shortage * item.wtPerPc) / 1000).toFixed(2)} Kg`,
                                createdBy: currentUsername
                            })
                        });
                    }
                }

                showToast('✅ Order Logged & Production Alerts Sent!');
                currentOrderCart = []; renderOrderCart(); 
                if(typeof generateBookingNumber === 'function') generateBookingNumber();
                fetchOrders(); fetchSales();
            } catch(e) { 
                showToast('Error saving order', 'error'); 
            }
        }
window.submitEntireOrder = submitEntireOrder;

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
        
        // FIX 5: Change to production-market
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

// 1. Fetch live stock when Part Code is entered
        window.globalAutoFill = async function(partCode) {
            if(!partCode) return;
            try {
                // Check if part exists in our memory dictionary first
                if (masterPartDictionary && masterPartDictionary[partCode.toUpperCase()]) {
                    let p = masterPartDictionary[partCode.toUpperCase()];
                    document.getElementById('oType').value = p.type || '';
                    document.getElementById('oSize').value = p.size || '';
                    document.getElementById('oAF').value = p.af || '';
                    document.getElementById('oPitch').value = p.pitch || '';
                    document.getElementById('oLength').value = p.length || '';
                    document.getElementById('oGrade').value = p.grade || '';
                    document.getElementById('oWtPerPc').value = p.wt || 0;
                    document.getElementById('oRate').value = p.rate || 0;
                    window.buildOrderDesc();
                }

                // Fetch live stock from Inventory API
                const res = await fetch(`${API_URL}/product/${encodeURIComponent(partCode)}`);
                if (res.ok) {
                    const prod = await res.json();
                    document.getElementById('oCurrentStock').value = prod.currentStock || 0;
                } else {
                    document.getElementById('oCurrentStock').value = 0;
                }
                window.calculateShortage();
            } catch(e) {}
        }

        // 2. Build Description string
        window.buildOrderDesc = function() {
            let type = document.getElementById('oType').value;
            let size = document.getElementById('oSize').value;
            let pitch = document.getElementById('oPitch').value;
            let len = document.getElementById('oLength').value;
            let grade = document.getElementById('oGrade').value;
            document.getElementById('oDesc').value = `${type} ${size} x ${pitch} x ${len} ${grade}`.trim();
        }

        // 2b. MISSING FUNCTION: Auto-Generate Booking ID
        // 2b. Auto-Generate Booking ID (FIXED)
        // 1. Auto-Generate Booking ID in Strict Excel Format (e.g. 211242504001)
        window.generateBookingNumber = function() {
            const cust = document.getElementById('oCustomer').value;
            let date = document.getElementById('oDate').value;
            
            // Auto-fill date if user forgot, so the ID ALWAYS generates
            if (!date) {
                date = new Date().toISOString().substring(0,7);
                document.getElementById('oDate').value = date;
            }

            if (cust) {
                // Generate a robust 3-digit ID from the customer name (e.g., 211)
                let hash = 0;
                for(let i=0; i<cust.length; i++) { hash += cust.charCodeAt(i); }
                let custId = (hash % 900) + 100; 
                
                // Extract FY and Month (2425 + 04)
                let parts = date.split('-');
                let year = parseInt(parts[0]);
                let monthNum = parseInt(parts[1]);
                let fyStr = monthNum >= 4 ? String(year).slice(-2) + String(year+1).slice(-2) : String(year-1).slice(-2) + String(year).slice(-2);
                let mmStr = String(monthNum).padStart(2, '0');
                
                // Generate sequence (001)
                let seq = String(Math.floor(1 + Math.random() * 999)).padStart(3, '0');
                
                // Matches exact Excel format: 211242504001
                document.getElementById('oBookingNo').value = `${custId}${fyStr}${mmStr}${seq}`;
            } else {
                document.getElementById('oBookingNo').value = '';
            }
        };

        // 2. Submit Order and generate matching WO IDs
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
                // Save the Sales Order
                await fetch(`${API_URL}/orders`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ payload: payload, user: currentUsername }) }); 
                
                // TIGHT INTEGRATION: Generate WO Requests with matching format
                for (let item of currentOrderCart) {
                    if (item.shortage > 0) {
                        let rmRequired = (item.shortage * item.wtPerPc) / 1000; 
                        
                        // Extract variables to match formatting
                        let hash = 0; for(let i=0; i<customerName.length; i++) hash += customerName.charCodeAt(i);
                        let custId = (hash % 900) + 100;
                        let parts = dateVal.split('-');
                        let fyStr = parseInt(parts[1]) >= 4 ? String(parts[0]).slice(-2) + String(parseInt(parts[0])+1).slice(-2) : String(parseInt(parts[0])-1).slice(-2) + String(parts[0]).slice(-2);
                        let seq = String(Math.floor(1 + Math.random() * 999)).padStart(3, '0');
                        
                        let customWONumber = `WO${custId}${fyStr}${parts[1]}${seq}`; // Example: WO211242504001
                        
                        await fetch(`${API_URL}/work-orders`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                woNumber: customWONumber,
                                partNo: item.partCode,
                                partName: item.description,
                                targetQty: item.shortage,
                                type: item.type, size: item.size, pitch: item.pitch, length: item.length, gr: item.grade, af: item.af,
                                chWt: item.wtPerPc,
                                rmKg: rmRequired.toFixed(2),
                                status: 'REQUESTED', 
                                remarks: `Sales Auto-Request | Order: ${bookingNumber} | Cust: ${customerName}`,
                                createdBy: currentUsername
                            })
                        });
                    }
                }

                showToast('✅ Order Logged & Production Alerts Sent!');
                currentOrderCart = []; renderOrderCart(); 
                if(typeof generateBookingNumber === 'function') generateBookingNumber();
                fetchOrders(); fetchSales();
            } catch(e) { 
                showToast('Error saving order', 'error'); 
            }
        };

        // 3. Auto-Calculate Production Shortage & RAW MATERIAL REQUIRED
        window.calculateShortage = function() {
            let ordQty = parseFloat(document.getElementById('oOrdQty').value) || 0;
            let curStock = parseFloat(document.getElementById('oCurrentStock').value) || 0;
            let wtPerPc = parseFloat(document.getElementById('oWtPerPc').value) || 0;
            
            let shortage = ordQty - curStock;
            shortage = shortage > 0 ? shortage : 0;
            
            document.getElementById('oWOReq').value = shortage;

            // NEW: Calculate Raw Material (Kg) instantly
            let rmReq = (shortage * wtPerPc) / 1000;
            if(document.getElementById('oRMReq')) {
                document.getElementById('oRMReq').value = rmReq.toFixed(2);
            }
        };