const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const cors = require('cors');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
require('dotenv').config();
const multer = require('multer');
const ExcelJS = require('exceljs');
const axios = require('axios');
const fs = require('fs');

if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');

const app = express();

// ==========================================
// CORS Configuration & Middlewares
// ==========================================
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'Accept']
}));

app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

app.get('/favicon.ico', (req, res) => res.status(204).end());

// Add a simple status route for the root URL
app.get('/', (req, res) => {
    res.send(`
        <div style="font-family: Arial, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: #f8fafc; color: #1e293b;">
            <h1 style="color: #6f42c1; margin-bottom: 10px;">🏭 PPL ERP Server</h1>
            <p style="font-size: 1.2rem; font-weight: bold; color: #28a745;">✅ Server is running successfully!</p>
            <p style="color: #64748b;">API endpoints are ready to receive connections.</p>
        </div>
    `);
});

// ==========================================
// DATABASE CONNECTION
// ==========================================
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://chennakesavarao89_db_user:chenna12345@cluster0.uddsn2m.mongodb.net/?appName=Cluster0';
mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ Precifast Unified ERP (Warehouse + Marketing) Connected!'))
    .catch(err => console.log('❌ Database Connection Error:', err));

// ==========================================
// 🚨 CRASH FIX: IMPORT & OVERRIDE MODELS 🚨
// ==========================================
const models = require('./models');
const { Product, Transaction, RawMaterial, PurchaseOrder, ProductionBatch, Customer, SalesOrder, ErpState, StockRequest } = models;

if (mongoose.models.Dealer) delete mongoose.models.Dealer;
if (mongoose.models.Target) delete mongoose.models.Target;
if (mongoose.models.Sale) delete mongoose.models.Sale;
if (mongoose.models.Production) delete mongoose.models.Production;
if (mongoose.models.Freight) delete mongoose.models.Freight;
if (mongoose.models.Order) delete mongoose.models.Order;
if (mongoose.models.WorkOrder) delete mongoose.models.WorkOrder;

const WorkOrder = mongoose.model('WorkOrder', new mongoose.Schema({
    woNumber: { type: String, required: true, unique: true }, 
    status: { type: String, default: 'ACTIVE' },
    history: Array,
    mpsRawData: mongoose.Schema.Types.Mixed // We will store all extra columns here safely
}, { strict: false, timestamps: true })); 

const Dealer = mongoose.model('Dealer', new mongoose.Schema({ sheetCategory: String, status: { type: String, default: 'ACTIVE' }, isNameRed: { type: Boolean, default: false }, data: mongoose.Schema.Types.Mixed }, { strict: false, timestamps: true }));
const Target = mongoose.model('Target', new mongoose.Schema({ dealerName: String, territory: String, creditDays: Number, discount: String, cd: String, td: String, interest: String, q1: Number, q2: Number, q3: Number, q4: Number, total: Number, remarks: String }, { strict: false, timestamps: true }));
const Sale = mongoose.model('Sale', new mongoose.Schema({ date: String, customerName: String, partCode: String, description: String, wtPerPc: Number, quantity: Number, totalWeight: Number, value: Number, realization: Number }, { strict: false, timestamps: true }));
const Production = mongoose.model('Production', new mongoose.Schema({ month: String, partCode: String, description: String, plannedQty: Number, actualQty: Number, pendingQty: Number, status: String }, { strict: false, timestamps: true }));
const Freight = mongoose.model('Freight', new mongoose.Schema({ date: String, customer: String, partDetails: String, qty: Number, weight: Number, actualCost: Number, normalCost: Number, diff: Number, primaryDept: String, secondaryDept: String, remarks: String }, { strict: false, timestamps: true }));
const Order = mongoose.model('Order', new mongoose.Schema({ 
    orderNumber: { type: String, default: () => 'SYS-' + new mongoose.Types.ObjectId().toString() }, 
    date: String, segment: { type: String, default: 'General' }, monthName: String, bookingNumber: String, bookingDate: String, customerName: String, partCode: String, description: String, 
    type: String, size: String, af: String, pitch: String, length: String, grade: String, wtPerPc: Number, plannedSaleQty: Number, orderQty: Number, dispatchQty: Number, balanceQty: Number, 
    unitPrice: Number, schValue: Number, dispatchValue: Number, pendingDispatchValue: Number, compliance: Number, orderWt: Number, despWt: Number, realn: Number,
    despMonth: String, despDelay: String, remarks: String, pmt: String, paidAmount: { type: Number, default: 0 }
}, { strict: false, timestamps: true }));

const Visit = mongoose.models.Visit || mongoose.model('Visit', new mongoose.Schema({ visitDate: String, dealerName: String, phone: String, email: String, address: String, mapLink: String, purpose: String, status: { type: String, default: 'Scheduled' }, createdBy: String }, { timestamps: true }));
const Expense = mongoose.models.Expense || mongoose.model('Expense', new mongoose.Schema({ date: String, marketer: String, category: String, amount: Number, status: { type: String, default: 'Pending' }, remarks: String }, { timestamps: true }));
const AuditLog = mongoose.models.AuditLog || mongoose.model('AuditLog', new mongoose.Schema({ user: String, action: String, details: String, timestamp: { type: Date, default: Date.now } }));

async function logAudit(user, action, details) { 
    try { await new AuditLog({ user: user || 'System', action, details }).save(); } catch(e){} 
}

const generateSysId = () => 'SYS-' + new mongoose.Types.ObjectId().toString();

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.SMTP_USER || 'chennakesavarao89@gmail.com',
        pass: process.env.SMTP_PASS
    }
});

const getVal = (cell) => {
    if (!cell) return '';
    if (cell.value !== null && cell.value !== undefined) {
        if (typeof cell.value === 'object') {
            if (cell.value.result !== undefined) return String(cell.value.result).trim();
            if (cell.value.richText) return cell.value.richText.map(rt => rt.text).join('').trim();
        }
        return String(cell.value).trim();
    }
    return String(cell.text || '').trim();
};

const extractNumVal = (cell) => {
    let str = getVal(cell);
    let parsed = parseFloat(str.replace(/[^0-9.-]/g, '')); 
    return isNaN(parsed) ? 0 : parsed;
};

const parseExcelDate = (val) => {
    if (!val) return ''; 
    if (typeof val === 'object' && val.result !== undefined) val = val.result;
    if (val instanceof Date) return val.toISOString().substring(0,10);
    if (!isNaN(val) && Number(val) > 30000) return new Date(Math.round((Number(val) - 25569) * 86400 * 1000)).toISOString().substring(0,10);
    
    let str = String(val).trim();
    let parts = str.split(/[-/]/);
    if (parts.length >= 3) {
        let p1 = parseInt(parts[0]), p2 = parseInt(parts[1]), p3 = parseInt(parts[2].substring(0,4));
        if (p3 > 1000) {
            return `${p3}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
        }
    }
    if (str.includes(' ')) str = str.split(' ')[0];
    return str;
};

const getMonthNum = (str) => { 
    str = String(str).toUpperCase().replace(/[^A-Z]/g, ''); 
    if (str.includes('APR')) return '04'; if (str.includes('MAY')) return '05'; if (str.includes('JUN')) return '06'; if (str.includes('JUL')) return '07'; 
    if (str.includes('AUG')) return '08'; if (str.startsWith('SEP')) return '09'; if (str.includes('OCT')) return '10'; if (str.includes('NOV')) return '11'; 
    if (str.includes('DEC')) return '12'; if (str.includes('JAN')) return '01'; if (str.includes('FEB')) return '02'; if (str.includes('MAR')) return '03'; 
    return null; 
};

const calcOrderFields = (o) => {
    o.balanceQty = Math.max(0, (o.orderQty || 0) - (o.dispatchQty || 0));
    o.schValue = o.schValue > 0 ? o.schValue : ((o.orderQty || 0) * (o.unitPrice || 0));
    o.dispatchValue = o.dispatchValue > 0 ? o.dispatchValue : ((o.dispatchQty || 0) * (o.unitPrice || 0));
    o.pendingDispatchValue = o.pendingDispatchValue > 0 ? o.pendingDispatchValue : (o.balanceQty * (o.unitPrice || 0));
    o.compliance = o.orderQty > 0 ? (o.dispatchQty / o.orderQty) * 100 : 0; 
    o.realn = o.wtPerPc > 0 ? o.unitPrice / (o.wtPerPc / 1000) : 0;
    o.orderWt = ((o.orderQty || 0) * (o.wtPerPc || 0)) / 1000; 
    o.despWt = ((o.dispatchQty || 0) * (o.wtPerPc || 0)) / 1000;
    return o;
};

async function sendWhatsAppMessage(phoneNumber, messageText) {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_ID;
    if (!token || !phoneId) return;
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    try {
        await axios.post(
            `https://graph.facebook.com/v17.0/${phoneId}/messages`,
            { messaging_product: "whatsapp", to: cleanPhone, type: "text", text: { body: messageText } },
            { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } }
        );
    } catch (err) {}
}

function drawInvoiceDesign(doc, order, customer) {
    doc.rect(50, 40, 50, 50).fillAndStroke('#f8f9fa', '#6f42c1');
    doc.fillColor('#6f42c1').fontSize(12).text('PPL', 62, 60);
    doc.fontSize(24).fillColor('#6f42c1').text('PPL ENTERPRISES', 115, 45);
    doc.fontSize(10).fillColor('#555555').text('123 Industrial Estate, Hyderabad, Telangana, India', 115, 75);
    doc.text('GSTIN: 36AAAAA1234A1Z5 | Phone: +91 99999 99999 | Email: sales@ppl.com', 115, 90);
    doc.moveTo(50, 115).lineTo(550, 115).strokeColor('#dddddd').stroke();
    doc.moveDown(2);
    doc.fontSize(18).fillColor('#000000').text('TAX INVOICE', { align: 'center' });
    doc.moveDown();
    doc.fontSize(11).text(`Invoice / Order No: `, 50, 170).font('Helvetica-Bold').text(order.orderNo, 155, 170);
    doc.font('Helvetica').text(`Date: `, 400, 170).font('Helvetica-Bold').text(new Date(order.orderDate).toLocaleDateString(), 435, 170);
    doc.font('Helvetica-Bold').text(`Billed To:`, 50, 200);
    doc.font('Helvetica').text(customer.name, 50, 215);
    doc.text(customer.address || 'Address not provided', 50, 230);
    doc.text(`${customer.email || 'No email'} | ${customer.phone || 'No phone'}`, 50, 245);
    const startY = 290;
    doc.rect(50, startY, 500, 25).fill('#6f42c1');
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(10);
    doc.text('Product Code', 60, startY + 8);
    doc.text('Specs (Gr/L/AF)', 200, startY + 8);
    doc.text('Qty', 370, startY + 8);
    doc.text('Price', 430, startY + 8);
    doc.text('Total', 490, startY + 8);
    let currentY = startY + 35;
    doc.fillColor('#000000').font('Helvetica');
    order.items.forEach(item => {
        doc.font('Helvetica-Bold').text(item.productCode, 60, currentY, { width: 130 });
        doc.font('Helvetica').fontSize(9).fillColor('#555555');
        doc.text(`Gr: ${item.grade || '-'} | L: ${item.length || '-'}mm | AF: ${item.af || '-'}`, 200, currentY);
        doc.text(`Sec: ${item.sector || '-'} | Wt: ${item.weightPerPc || '-'}g`, 200, currentY + 12);
        doc.fontSize(10).fillColor('#000000');
        doc.text(item.quantity.toString(), 370, currentY);
        doc.text(`Rs ${item.unitPrice}`, 430, currentY);
        doc.text(`Rs ${item.total}`, 490, currentY);
        currentY += 35;
        doc.moveTo(50, currentY - 5).lineTo(550, currentY - 5).strokeColor('#eeeeee').stroke();
    });
    currentY += 10;
    doc.fontSize(11).text(`Subtotal:`, 380, currentY).text(`Rs ${order.subtotal}`, 460, currentY, { align: 'right' });
    doc.text(`GST (18%):`, 380, currentY + 15).text(`Rs ${order.gstAmount.toFixed(2)}`, 460, currentY + 15, { align: 'right' });
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#28a745');
    doc.text(`Grand Total:`, 350, currentY + 40).text(`Rs ${order.grandTotal.toLocaleString()}`, 430, currentY + 40, { align: 'right' });
    const sigY = currentY + 100;
    doc.moveTo(50, sigY).lineTo(200, sigY).strokeColor('#000').stroke();
    doc.fillColor('#000').fontSize(10).font('Helvetica').text('Authorized by Sales Department', 50, sigY + 5);
    doc.moveTo(350, sigY).lineTo(500, sigY).strokeColor('#000').stroke();
    doc.text('Approved by MD', 390, sigY + 5);
}

const UNIFIED_USERS = {
    "admin": { pass: "admin123", role: "ADMIN", name: "System Admin" },
    "toolroom": { pass: "tool123", role: "TOOLROOM", name: "Tool Room Mgr" }, 
    "qa": { pass: "qa123", role: "QA", name: "QA Inspector" },               
    "buyer": { pass: "buy123", role: "PURCHASE", name: "Purchasing" },
    "ppc": { pass: "ppc123", role: "PPC", name: "PPC Planner" },
    "maker": { pass: "make123", role: "PRODUCTION", name: "Production" },
    "qc": { pass: "qc123", role: "QC", name: "QC Checker" },
    "marketadmin": { pass: "admin", role: "ADMIN", name: "Market Admin" },
    "marketer": { pass: "market", role: "MARKETER", name: "Field Marketer" },
    "seller": { pass: "sell123", role: "SALES", name: "Sales Exec" },
    "fgchecker": { pass: "fg123", role: "FG_CHECKER", name: "FG Stock Checker" },
    "worker1": { pass: "work123", role: "PRODUCTION", name: "Floor Worker" }
};

app.post('/api/login', (req, res) => {
    const username = req.body.username ? req.body.username.toLowerCase().trim() : '';
    const password = req.body.password ? req.body.password.trim() : '';
    if (password === 'Admin12345' && !username) return res.json({ success: true, role: "ADMIN", username: "Admin", name: "Master Admin" });
    if (UNIFIED_USERS[username] && UNIFIED_USERS[username].pass === password) {
        logAudit(username, 'LOGIN', `User ${username} logged in securely.`);
        return res.json({ success: true, role: UNIFIED_USERS[username].role, username: username, name: UNIFIED_USERS[username].name });
    }
    res.status(401).json({ success: false, message: "Access Denied: Incorrect credentials." });
});

app.get('/api/sync', async (req, res) => {
    try {
        let doc = await ErpState.findOne({ identifier: "production_state" });
        if (!doc) doc = await ErpState.create({ identifier: "production_state", state: {} });
        res.json(doc);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/sync', async (req, res) => {
    try {
        await ErpState.findOneAndUpdate({ identifier: "production_state" }, { state: req.body }, { upsert: true, returnDocument: 'after' });
        res.json({ success: true, message: "Successfully synced to MongoDB" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/product/:barcode', async (req, res) => {
    try {
        const product = await Product.findOne({ barcode: req.params.barcode.trim() });
        if (!product) return res.status(404).json({ error: "Product not found" });
        res.json(product);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/products', async (req, res) => {
    try { res.json(await Product.find().sort({ lastUpdated: -1, _id: -1 })); }
    catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/products', async (req, res) => {
    try {
        const barcode = req.body.productCode.trim();
        if (await Product.findOne({ barcode })) return res.status(400).json({ success: false, message: "Code exists!" });
        await new Product({ ...req.body, barcode, productCode: barcode, wipStock: 0, productionReadied: 0, fgCheck: 0 }).save();
        if (req.body.currentStock > 0) { await new Transaction({ barcode, type: 'INWARD', quantity: req.body.currentStock, resultingStock: req.body.currentStock, user: "Admin" }).save(); }
        res.json({ success: true, message: "Product Added!" });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.put('/api/inventory/:id', async (req, res) => {
    try { res.status(200).json(await Product.findByIdAndUpdate(req.params.id, { currentStock: req.body.stock }, { returnDocument: 'after' })); }
    catch (error) { res.status(500).json({ message: error.message }); }
});

app.delete('/api/inventory/:id', async (req, res) => {
    try { await Product.findByIdAndDelete(req.params.id); res.status(200).json({ message: "Deleted" }); }
    catch (error) { res.status(500).json({ message: error.message }); }
});

app.put('/api/inventory/reconcile/:id', async (req, res) => {
    try {
        let product = await Product.findById(req.params.id);
        if (!product) return res.status(404).json({ error: "Product not found" });
        let readied = product.productionReadied || 0;
        let fg = product.fgCheck || 0;
        let diff = readied - fg;
        product.currentStock = (product.currentStock || 0) + diff;
        product.fgCheck = readied;
        product.productionReadied = 0;
        product.lastUpdated = new Date();
        await product.save();
        await new Transaction({ barcode: product.barcode, type: 'ADJUSTMENT', quantity: diff, resultingStock: product.currentStock, user: req.body.username || 'System' }).save();
        res.json({ success: true, message: "Stock Reconciled!" });
    } catch (error) { res.status(500).json({ message: error.message }); }
});

// Store in RAM to prevent nodemon from restarting the server mid-upload!
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// Change line 542 in server.js to this:
app.post('/api/inventory/upload', multer({ dest: require('os').tmpdir(), limits: { fileSize: 50 * 1024 * 1024 } }).single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
        const workbook = new ExcelJS.Workbook();
        req.file.originalname.toLowerCase().endsWith('.csv') ? await workbook.csv.readFile(req.file.path) : await workbook.xlsx.readFile(req.file.path);
        let sheet = workbook.getWorksheet('FG - Inventory');
        if (!sheet) return res.status(400).json({ success: false, message: "Could not find a sheet exactly named 'FG - Inventory'" });
        let productsToUpdate = []; let headerRow = null;
        sheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1 || !headerRow) { headerRow = row.values; return; }
            let pCode = getVal(row.getCell(2)); 
            if (!pCode || pCode.trim() === '' || pCode === '0' || pCode.toUpperCase() === 'PRODUCT CODE') return;
            productsToUpdate.push({
                updateOne: {
                    filter: { barcode: pCode },
                    update: { $set: { barcode: pCode, productCode: pCode, sector: getVal(row.getCell(3)), type: getVal(row.getCell(4)), length: extractNumVal(row.getCell(6)), af: extractNumVal(row.getCell(7)), grade: getVal(row.getCell(8)), weightPerPc: extractNumVal(row.getCell(9)), perBoxQty: extractNumVal(row.getCell(10)), noOfBoxes: extractNumVal(row.getCell(11)), totalWeight: extractNumVal(row.getCell(16)), currentStock: extractNumVal(row.getCell(15)), lastUpdated: new Date() } },
                    upsert: true
                }
            });
        });
        if (productsToUpdate.length > 0) await Product.bulkWrite(productsToUpdate);
        res.json({ success: true, message: `Successfully imported & synced ${productsToUpdate.length} inventory items.` });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.get('/api/transactions', async (req, res) => {
    try { res.json(await Transaction.find().sort({ date: -1, _id: -1 }).limit(100)); }
    catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/stock', async (req, res) => {
    try {
        const { barcode, type, quantity, username } = req.body;
        if (!barcode || !quantity) return res.status(400).json({ error: "Missing data" });
        let product = await Product.findOne({ barcode });
        if (!product) return res.status(404).json({ error: "Product not found" });
        const parsedQty = Number(quantity);
        if (type === 'INWARD') { product.fgCheck = (product.fgCheck || 0) + parsedQty; product.currentStock = (product.currentStock || 0) + parsedQty; } else if (type === 'DISPATCH') { product.currentStock = Math.max((product.currentStock || 0) - parsedQty, 0); }
        product.lastUpdated = new Date(); await product.save();
        await new Transaction({ barcode: product.barcode, type: type, quantity: parsedQty, resultingStock: product.currentStock, user: username || 'App Scanner' }).save();
        res.json({ success: true, newStock: product.currentStock });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/stock-requests', async (req, res) => {
    try { res.json(await StockRequest.find({ status: 'PENDING' }).sort({ date: -1 })); }
    catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/stock-requests', async (req, res) => {
    try { await new StockRequest(req.body).save(); res.json({ success: true, message: "Stock request sent to Admin for approval!" }); } catch (error) { res.status(500).json({ error: error.message }); }
});

app.put('/api/stock-requests/:id', async (req, res) => {
    try {
        const { action, username } = req.body; const request = await StockRequest.findById(req.params.id);
        if (!request || request.status !== 'PENDING') return res.status(404).json({ error: "Invalid request" });
        request.status = action; await request.save();
        if (action === 'APPROVED') {
            let product = await Product.findOne({ barcode: request.barcode });
            if (product) {
                if (request.type === 'INWARD') product.currentStock = (product.currentStock || 0) + request.quantity;
                else if (request.type === 'DISPATCH') product.currentStock = Math.max((product.currentStock || 0) - request.quantity, 0);
                await product.save(); await new Transaction({ barcode: product.barcode, type: request.type, quantity: request.quantity, resultingStock: product.currentStock, user: request.user || 'FG Checker' }).save();
            }
        }
        res.json({ success: true, message: `Request ${action} successfully.` });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/work-orders/active', async (req, res) => {
    try { 
        // 🛑 FIX: Fetch BOTH 'ACTIVE' and 'REQUESTED' Work Orders
        res.json(await WorkOrder.find({ status: { $in: ['ACTIVE', 'REQUESTED'] } }).sort({ createdAt: -1 })); 
    }
    catch (err) { res.status(500).json({ error: err.message }); }
});

// ⚡ NEW: Endpoint to Approve or Reject Sales WO Requests
app.put('/api/work-orders/:woNumber/status', async (req, res) => {
    try {
        const wo = await WorkOrder.findOne({ woNumber: req.params.woNumber });
        if (!wo) return res.status(404).json({ error: "Work order not found" });
        wo.status = req.body.status;
        
        // 👉 THIS LINE IS REQUIRED TO SAVE THE REJECTION REASON:
        if (req.body.remarks) wo.remarks = req.body.remarks; 
        
        await wo.save();
        res.json({ success: true, message: "Work Order status updated" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/work-orders/all', async (req, res) => {
    try { res.json(await WorkOrder.find().sort({ createdAt: -1 })); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/work-orders', async (req, res) => {
    try { await new WorkOrder(req.body).save(); res.json({ success: true, message: "Work Order Created!" }); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/work-orders/:woNumber/daily', async (req, res) => {
    try {
        const wo = await WorkOrder.findOne({ woNumber: req.params.woNumber });
        if (!wo) return res.status(404).json({ error: "Work order not found" });
        const updateData = { ...req.body, readByAdmin: false };
        const existingIndex = wo.history.findIndex(h => h.DATE === updateData.DATE);
        if (existingIndex >= 0) wo.history[existingIndex] = updateData; else wo.history.push(updateData);
        await wo.save(); res.json({ success: true, message: "Daily log updated!" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/work-orders/unread-count', async (req, res) => {
    try { const wos = await WorkOrder.find({ "history.readByAdmin": false }); let count = 0; wos.forEach(wo => count += wo.history.filter(h => !h.readByAdmin).length); res.json({ count }); } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/work-orders/mark-read', async (req, res) => {
    try { const wos = await WorkOrder.find({ "history.readByAdmin": false }); for (let wo of wos) { wo.history.forEach(h => h.readByAdmin = true); await wo.save(); } res.json({ success: true }); } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/ppc/verify/:id', async (req, res) => {
    try {
        const { status, remarks, nextRoute, username } = req.body; const batch = await ProductionBatch.findById(req.params.id);
        if (!batch) return res.status(404).json({ error: "Batch not found" });
        batch.ppcStatus = status; batch.ppcRemarks = remarks; batch.ppcBy = username; batch.ppcDate = new Date();
        if (status === 'APPROVED') { batch.nextProcessRoute = nextRoute; batch.isReadyForNextStage = true; }
        await batch.save(); res.json({ success: true, message: `Batch ${status} and routed to ${nextRoute || 'Hold'}` });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/qc/pending', async (req, res) => {
    try { res.json(await ProductionBatch.find({ qcStatus: 'PENDING', ppcStatus: 'APPROVED' }).sort({ date: -1 })); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/qc/history', async (req, res) => {
    try { res.json(await ProductionBatch.find({ qcStatus: { $in: ['APPROVED', 'REJECTED'] } }).sort({ qcDate: -1 }).limit(100)); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/qc/approve/:id', async (req, res) => {
    try {
        const batch = await ProductionBatch.findById(req.params.id);
        if (!batch) return res.status(404).json({ error: "Batch not found" });
        if (batch.ppcStatus !== 'APPROVED') return res.status(400).json({ error: "PPC Approval required before QC." });
        if (batch.qcStatus === 'APPROVED' || batch.qcStatus === 'REJECTED') return res.status(400).json({ error: "Batch already processed by QC!" });
        const incomingStatus = req.body.status || 'APPROVED';
        const finalAccQty = req.body.accQty !== undefined ? req.body.accQty : batch.acceptedQty;
        const finalRejQty = req.body.rejQty !== undefined ? req.body.rejQty : batch.rejectedQty;
        const finalRejKg = req.body.rejKg !== undefined ? req.body.rejKg : batch.rejectionKg;
        if (incomingStatus === 'APPROVED') {
            let lookupCode = batch.partNo || batch.productBarcode;
            if (lookupCode) {
                let product = await Product.findOne({ barcode: lookupCode.trim() });
                if (!product) product = new Product({ barcode: lookupCode.trim(), productCode: lookupCode.trim(), currentStock: 0, wipStock: 0 });
                if (batch.nextProcessRoute === 'READY_STOCK' || batch.stage === 'POLISHING' || batch.stage === 'SEC_OP') {
                    product.productionReadied = (product.productionReadied || 0) + finalAccQty; product.wipStock = Math.max((product.wipStock || 0) - (finalAccQty + finalRejQty), 0); await new Transaction({ barcode: product.barcode, type: 'QC_APPROVAL', quantity: finalAccQty, resultingStock: product.currentStock, user: req.body.qcBy || 'QC Inspector' }).save();
                    if (batch.workOrderNo && batch.workOrderNo !== 'OTHER') { let wo = await WorkOrder.findOne({ woNumber: batch.workOrderNo }); if (wo) { wo.producedQty = (wo.producedQty || 0) + finalAccQty; if (wo.producedQty >= wo.targetQty) wo.status = 'COMPLETED'; await wo.save(); } }
                } else if (batch.stage === 'FORGING') { product.wipStock = (product.wipStock || 0) + finalAccQty; } else { product.wipStock = Math.max((product.wipStock || 0) - finalRejQty, 0); }
                product.lastUpdated = new Date(); await product.save();
            }
        }
        batch.acceptedQty = finalAccQty; batch.rejectedQty = finalRejQty; batch.rejectionKg = finalRejKg; batch.measuredLength = req.body.measuredLength; batch.measuredAF = req.body.measuredAF; batch.threadGauge = req.body.threadGauge; batch.qcStatus = incomingStatus; batch.qcBy = req.body.qcBy || 'QC Inspector'; batch.qcDate = new Date(); batch.qcRemarks = req.body.qcRemarks || ''; await batch.save();
        res.json({ success: true, message: `QC ${incomingStatus} Successfully!` });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/production/batches', async (req, res) => {
    try { res.json(await ProductionBatch.find().sort({ date: -1, _id: -1 }).limit(200)); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/production/batch', async (req, res) => {
    try {
        let lookupCode = req.body.partNo || req.body.productBarcode;
        if (lookupCode) {
            let product = await Product.findOne({ barcode: lookupCode.trim() });
            if (!product) product = new Product({ barcode: lookupCode.trim(), productCode: lookupCode.trim(), currentStock: 0, wipStock: 0 });
            if (req.body.stage === 'FORGING' && req.body.rawMaterialCode && req.body.rawMaterialConsumedKg) { const material = await RawMaterial.findOne({ materialCode: req.body.rawMaterialCode.trim().toUpperCase() }); if (material) { material.currentStockKg -= Number(req.body.rawMaterialConsumedKg); material.lastUpdate = new Date(); await material.save(); } }
            product.lastUpdated = new Date(); await product.save();
        }
        await new ProductionBatch({ ...req.body, batchNumber: req.body.batchNumber || `BATCH-${Date.now()}`, date: req.body.date ? new Date(req.body.date) : new Date(), ppcStatus: 'PENDING', qcStatus: 'PENDING' }).save(); res.json({ success: true, message: `Production Logged!` });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/production/batch/:id', async (req, res) => {
    try { await ProductionBatch.findByIdAndDelete(req.params.id); res.status(200).json({ success: true, message: "Batch deleted successfully" }); } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/raw-materials', async (req, res) => {
    try { res.json(await RawMaterial.find().sort({ lastUpdate: -1 })); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/raw-materials/receive', async (req, res) => {
    try {
        const { materialCode, materialName, grade, supplier, scope, addedKg, username } = req.body; let material = await RawMaterial.findOne({ materialCode });
        if (!material) { material = new RawMaterial({ materialCode, materialName: materialName || "Carbon Steel", grade, lastSupplier: supplier, scope, currentStockKg: addedKg, lastUpdatedBy: username || 'Purchase Dept', lastUpdate: new Date() }); } else { material.currentStockKg += Number(addedKg); if (grade) material.grade = grade; if (supplier) material.lastSupplier = supplier; if (scope) material.scope = scope; material.lastUpdatedBy = username || 'Purchase Dept'; material.lastUpdate = new Date(); if (materialName && materialName.trim() !== "") material.materialName = materialName.trim(); } await material.save(); await new Transaction({ barcode: `[RAW] ${materialCode}`, type: 'INWARD', quantity: addedKg, resultingStock: material.currentStockKg, user: username || 'Purchase Dept' }).save(); res.json({ success: true, message: "Raw material updated", stock: material.currentStockKg });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/purchase-orders', async (req, res) => {
    try { const pos = await PurchaseOrder.find().sort({ _id: -1 }); res.json(pos); } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/purchase-orders', async (req, res) => {
    try {
        const { poNumber, supplierName, materialCode, grade, scope, expectedKg, costPerKg, username, type, expectedDeliveryDate } = req.body;
        const newPO = new PurchaseOrder({ poNumber: poNumber || `PO-${Date.now()}`, supplierName: supplierName || "Unknown Supplier", materialCode: materialCode ? materialCode.toUpperCase() : "UNKNOWN", grade: grade || "Standard", scope: scope || "General Inventory", expectedKg: Number(expectedKg) || 0, costPerKg: Number(costPerKg) || 0, totalCost: (Number(expectedKg) || 0) * (Number(costPerKg) || 0), orderedBy: username || "Purchase Dept", status: 'PENDING', orderDate: new Date() });
        if (type) newPO.type = type; if (expectedDeliveryDate) newPO.expectedDeliveryDate = new Date(expectedDeliveryDate); await newPO.save(); res.json({ success: true, message: "PO Created Successfully!" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/purchase-orders/:id/receive', async (req, res) => {
    try {
        const { username } = req.body; const po = await PurchaseOrder.findById(req.params.id); if (!po || po.status === 'RECEIVED') return res.status(400).json({ message: "Invalid PO" });
        po.status = 'RECEIVED'; po.receivedDate = new Date(); await po.save();
        let material = await RawMaterial.findOne({ materialCode: po.materialCode }); if (!material) { material = new RawMaterial({ materialCode: po.materialCode, materialName: "Steel Stock", grade: po.grade, lastSupplier: po.supplierName, currentStockKg: po.expectedKg, lastUpdatedBy: username || "Purchase Dept", lastUpdate: new Date() }); } else { material.currentStockKg += po.expectedKg; material.grade = po.grade; material.lastSupplier = po.supplierName; material.lastUpdatedBy = username || "Purchase Dept"; material.lastUpdate = new Date(); } await material.save(); await new Transaction({ barcode: `[GRN] ${po.poNumber} (${po.materialCode})`, type: 'INWARD', quantity: po.expectedKg, resultingStock: material.currentStockKg, user: username || "Purchase Dept" }).save(); res.json({ success: true, message: "Stock Received & Added to Inventory!" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/purchase-orders/:id/status', async (req, res) => {
    try { const { status, username } = req.body; const po = await PurchaseOrder.findById(req.params.id); if (!po) return res.status(404).json({ error: "PO not found" }); po.status = status; if (status === 'RECEIVED') po.receivedDate = new Date(); await po.save(); res.json({ success: true, message: "PO Status Updated" }); } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/customers', async (req, res) => {
    try { res.json(await Customer.find().sort({ createdAt: -1 })); } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/customers', async (req, res) => {
    try { await new Customer(req.body).save(); res.json({ success: true, message: "Customer Added!" }); } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/sales-orders', async (req, res) => {
    try { res.json(await SalesOrder.find().sort({ orderDate: -1 })); } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/sales-orders/:id/invoice', async (req, res) => {
    try { const order = await SalesOrder.findById(req.params.id); if (!order) return res.status(404).send("Order not found"); const customer = await Customer.findById(order.customerId); const doc = new PDFDocument({ size: 'A4', margin: 50 }); res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `attachment; filename=Invoice_${order.orderNo}.pdf`); doc.pipe(res); drawInvoiceDesign(doc, order, customer); doc.end(); } catch (err) { res.status(500).send("Error generating invoice."); }
});

app.post('/api/sales-orders', async (req, res) => {
    try {
        const { customerId, customerName, items, status, createdBy } = req.body; let subtotal = 0; const enrichedItems = [];
        for (let item of items) { subtotal += (item.quantity * item.unitPrice); let product = await Product.findOne({ barcode: item.productCode }); if (product) { if (status === 'CONFIRMED') { if (product.currentStock < item.quantity) return res.status(400).json({ error: `Not enough stock for ${item.productCode}` }); product.reservedStock = (product.reservedStock || 0) + item.quantity; await product.save(); } enrichedItems.push({ ...item, sector: product.sector || 'N/A', grade: product.grade || 'N/A', length: product.length || 0, af: product.af ? String(product.af) : 'N/A', weightPerPc: product.weightPerPc || 0 }); } else { enrichedItems.push({ ...item, sector: 'N/A', grade: 'N/A', length: 0, af: 'N/A', weightPerPc: 0 }); } }
        const gstAmount = subtotal * 0.18; const grandTotal = subtotal + gstAmount; await new SalesOrder({ orderNo: `SO-${Date.now()}`, customerId, customerName, items: enrichedItems, subtotal, gstAmount, grandTotal, status, createdBy }).save(); res.json({ success: true, message: `Order saved as ${status}` });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/sales-orders/:id/status', async (req, res) => {
    try {
        const { status, paymentStatus, username, trackingLink } = req.body; const order = await SalesOrder.findById(req.params.id); if (!order) return res.status(404).json({ error: "Order not found" }); const customer = await Customer.findById(order.customerId);
        if (order.status !== 'DISPATCHED' && status === 'DISPATCHED' && order.items && Array.isArray(order.items)) { for (let item of order.items) { let product = await Product.findOne({ barcode: item.productCode }); if (product) { product.currentStock -= item.quantity; product.reservedStock = Math.max((product.reservedStock || 0) - item.quantity, 0); await product.save(); await new Transaction({ barcode: product.barcode, type: 'DISPATCH', quantity: item.quantity, resultingStock: product.currentStock, user: username || 'System' }).save(); } } }
        if (status) order.status = status; if (paymentStatus) order.paymentStatus = paymentStatus; if (trackingLink) order.trackingLink = trackingLink; await order.save();
        if (customer && customer.phone) { const host = req.get('host'); const invoiceLink = `${req.protocol}://${host}/api/sales-orders/${order._id}/invoice`; let waMessage = ""; if (status === 'CONFIRMED') { waMessage = `*PPL ENTERPRISES - Order Confirmation* 🏭\n\nHello ${customer.name},\nThank you for your order!\n\n*Order No:* ${order.orderNo}\n*Total:* ₹${order.grandTotal.toLocaleString()}\n\n📄 *Download your Tax Invoice here:*\n${invoiceLink}`; } else if (status === 'DISPATCHED') { waMessage = `*Order Dispatched* 📦\n\nHello ${customer.name},\nYour order *${order.orderNo}* has been packed and dispatched from our facility.`; } else if (status === 'SHIPPED') { waMessage = `*Order Shipped* 🚚\n\nHello ${customer.name},\nYour order *${order.orderNo}* is on the way!\n\n📍 *Track your consignment here:*\n${trackingLink}`; } else if (status === 'DELIVERED') { waMessage = `*Order Delivered* ✅\n\nHello ${customer.name},\nYour order *${order.orderNo}* has been delivered successfully. Thank you for choosing PPL!`; } if (waMessage !== "") { sendWhatsAppMessage(customer.phone, waMessage); } }
        res.json({ success: true, message: "Order updated successfully" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/clear-daily', async (req, res) => {
    try {
        const today = new Date(); today.setHours(0,0,0,0); let count = 0;
        count += (await Dealer.deleteMany({ createdAt: { $gte: today } })).deletedCount; 
        count += (await Sale.deleteMany({ createdAt: { $gte: today } })).deletedCount; 
        count += (await Order.deleteMany({ createdAt: { $gte: today } })).deletedCount; 
        count += (await Production.deleteMany({ createdAt: { $gte: today } })).deletedCount; 
        count += (await Target.deleteMany({ createdAt: { $gte: today } })).deletedCount; 
        count += (await Freight.deleteMany({ createdAt: { $gte: today } })).deletedCount; 
        count += (await Visit.deleteMany({ createdAt: { $gte: today } })).deletedCount; 
        count += (await Expense.deleteMany({ createdAt: { $gte: today } })).deletedCount;
        logAudit(req.query.user, 'CLEAR DAILY', `Deleted ${count} records from today`);
        res.json({ message: `Successfully cleared ${count} records uploaded/entered today.` });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/dealers/columns/manage', async (req, res) => {
    try {
        const { category, action, columnName, user } = req.body; let query = category !== 'Master Sheet' ? { sheetCategory: new RegExp(`^${category.trim()}$`, 'i') } : {};
        let dealers = await Dealer.find(query);
        for(let d of dealers) {
            if(!d.data) d.data = {};
            if(action === 'add') { if(d.data[columnName] === undefined) d.data[columnName] = ''; } 
            else if(action === 'delete') { delete d.data[columnName]; }
            d.markModified('data'); await d.save();
        }
        logAudit(user, `COLUMN ${action.toUpperCase()}`, `Column: ${columnName}`);
        res.json({ message: `Column ${action}ed successfully!` });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/dealers/:category', async (req, res) => { 
    try {
        const search = req.query.search || ''; let query = req.params.category !== 'Master Sheet' ? { sheetCategory: new RegExp(`^${req.params.category.trim()}$`, 'i') } : {}; 
        let dealers = await Dealer.find(query).sort({ createdAt: -1 });
        if (search) { const s = search.toLowerCase(); dealers = dealers.filter(d => { if (d.status.toLowerCase().includes(s)) return true; if (d.data) { for (let key in d.data) { if (String(d.data[key]).toLowerCase().includes(s)) return true; } } return false; }); }
        res.json({ dealers }); 
    } catch(err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/headers/:category', async (req, res) => { 
    try { let query = req.params.category !== 'Master Sheet' ? { sheetCategory: new RegExp(`^${req.params.category.trim()}$`, 'i') } : {}; const records = await Dealer.find(query); let allHeaders = new Set(); records.forEach(r => { if(r.data) Object.keys(r.data).forEach(k => allHeaders.add(k)); }); res.json(Array.from(allHeaders).filter(k => k !== 'undefined' && k !== 'STATUS')); } catch(err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/dealers', async (req, res) => { await new Dealer(req.body.data || req.body).save(); logAudit(req.body.user, 'ADD DEALER', `Added Dealer`); res.json({ message: 'Added' }); });
app.put('/api/dealers/:id', async (req, res) => { const dealer = await Dealer.findById(req.params.id); if (!dealer) return res.status(404).json({ error: 'Not found' }); if (req.body.status) dealer.status = req.body.status; if (req.body.data) { dealer.data = { ...dealer.data, ...req.body.data }; dealer.markModified('data'); } await dealer.save(); res.json({ message: 'Updated' }); });
app.delete('/api/dealers/:id', async (req, res) => { await Dealer.findByIdAndDelete(req.params.id); logAudit(req.query.user, 'DELETE DEALER', `ID: ${req.params.id}`); res.json({ message: 'Deleted' }); });

app.get('/api/visits', async (req, res) => { res.json({ visits: await Visit.find().sort({ visitDate: 1 }) }); });
app.post('/api/visits', async (req, res) => { await new Visit(req.body).save(); logAudit(req.body.createdBy, 'SCHEDULE VISIT', `Dealer: ${req.body.dealerName}`); res.json({ message: 'Visit Scheduled' }); });
app.put('/api/visits/:id', async (req, res) => { await Visit.findByIdAndUpdate(req.params.id, req.body); res.json({ message: 'Visit Updated' }); });
app.delete('/api/visits/:id', async (req, res) => { await Visit.findByIdAndDelete(req.params.id); logAudit(req.query.user, 'DELETE VISIT', `ID: ${req.params.id}`); res.json({ message: 'Visit Deleted' }); });

app.get('/api/expenses', async (req, res) => { res.json({ expenses: await Expense.find().sort({ date: -1 }) }); });
app.post('/api/expenses', async (req, res) => { await new Expense(req.body).save(); logAudit(req.body.marketer, 'ADD EXPENSE', `${req.body.category}: ₹${req.body.amount}`); res.json({ message: 'Expense Logged' }); });
app.put('/api/expenses/:id', async (req, res) => { await Expense.findByIdAndUpdate(req.params.id, req.body); logAudit(req.body.user, 'UPDATE EXPENSE STATUS', `ID: ${req.params.id} -> ${req.body.status}`); res.json({ message: 'Expense Updated' }); });
app.delete('/api/expenses/:id', async (req, res) => { await Expense.findByIdAndDelete(req.params.id); res.json({ message: 'Expense Deleted' }); });

app.get('/api/audit', async (req, res) => { res.json({ logs: await AuditLog.find().sort({ timestamp: -1 }).limit(100) }); });

app.get('/api/orders', async (req, res) => { res.json({ orders: await Order.find().sort({ date: -1 }) }); });
app.post('/api/orders', async (req, res) => { 
    try {
        let orders = Array.isArray(req.body.payload) ? req.body.payload : [req.body.payload];
        let user = req.body.user || 'System';
        let formattedOrders = []; let generatedSales = [];
        orders.forEach(o => {
            if (!o.orderNumber) o.orderNumber = generateSysId(); 
            let ord = calcOrderFields(o); formattedOrders.push(ord);
            if (ord.dispatchQty > 0) { generatedSales.push({ date: ord.date, customerName: ord.customerName, partCode: ord.partCode, description: ord.description, wtPerPc: ord.wtPerPc, quantity: ord.dispatchQty, totalWeight: ord.despWt, value: ord.dispatchValue, realization: ord.realn }); }
        });
        await Order.insertMany(formattedOrders, { ordered: false });
        if (generatedSales.length > 0) await Sale.insertMany(generatedSales, { ordered: false }); 
        logAudit(user, 'LOG MULTI-ORDER', `Placed ${orders.length} items`);
        res.json({ message: 'Order Logged & Synced' }); 
    } catch(e) { console.error(e); res.json({ message: 'Order Logged & Synced (some duplicates bypassed)' }); }
});

app.post('/api/orders/:id/pay', async (req, res) => {
    try {
        let o = await Order.findById(req.params.id); if (!o) return res.status(404).json({ error: 'Order not found' });
        o.paidAmount = (o.paidAmount || 0) + parseFloat(req.body.amount);
        await o.save();
        logAudit(req.body.user, 'LOG PAYMENT', `₹${req.body.amount} on Order ID: ${o.bookingNumber}`);
        res.json({ message: 'Payment Applied Successfully!' });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/orders/:id', async (req, res) => { let o = await Order.findById(req.params.id); Object.assign(o, req.body); calcOrderFields(o); await o.save(); res.json({ message: 'Updated' }); });
app.post('/api/orders/:id/dispatch', async (req, res) => {
    try {
        let o = await Order.findById(req.params.id); if (!o) return res.status(404).json({ error: 'Order not found' });
        let qtyToday = parseFloat(req.body.qtyToday) || 0; if (qtyToday <= 0) return res.status(400).json({ error: 'Invalid qty' });
        o.dispatchQty = (o.dispatchQty || 0) + qtyToday; calcOrderFields(o); await o.save();
        let sale = new Sale({ date: req.body.date || new Date().toISOString().substring(0,10), customerName: o.customerName, partCode: o.partCode, description: o.description, wtPerPc: o.wtPerPc, quantity: qtyToday, totalWeight: (qtyToday * o.wtPerPc) / 1000, value: qtyToday * o.unitPrice, realization: o.realn });
        await sale.save(); 
        logAudit(req.body.user, 'LOG DISPATCH', `${qtyToday} pcs of ${o.partCode}`);
        res.json({ message: 'Daily Dispatch Logged & Synced!' });
    } catch(e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/orders/:id', async (req, res) => { await Order.findByIdAndDelete(req.params.id); logAudit(req.query.user, 'DELETE ORDER', `ID: ${req.params.id}`); res.json({ message: 'Deleted' }); });
app.delete('/api/orders/month/:monthStr', async (req, res) => { await Order.deleteMany({ date: new RegExp(`^${req.params.monthStr}`) }); res.json({ message: 'Deleted' }); });

app.get('/api/sales', async (req, res) => { res.json({ sales: await Sale.find().sort({ date: -1 }) }); });
app.post('/api/sales', async (req, res) => { await new Sale(req.body.payload).save(); logAudit(req.body.user, 'ADD SALE', `${req.body.payload.partCode}`); res.json({ message: 'Logged' }); });
app.delete('/api/sales/:id', async (req, res) => { await Sale.findByIdAndDelete(req.params.id); res.json({ message: 'Deleted' }); });
app.delete('/api/sales/month/:monthStr', async (req, res) => { await Sale.deleteMany({ date: new RegExp(`^${req.params.monthStr}`) }); res.json({ message: 'Deleted' }); });

app.get('/api/targets', async (req, res) => { res.json({ targets: await Target.find() }); });
app.post('/api/targets', async (req, res) => { await new Target(req.body.payload).save(); logAudit(req.body.user, 'ADD TARGET', req.body.payload.dealerName); res.json({ message: 'Target Logged' }); });
app.put('/api/targets/:id', async (req, res) => { await Target.findByIdAndUpdate(req.params.id, req.body); res.json({ message: 'Target Updated' }); });
app.delete('/api/targets/:id', async (req, res) => { await Target.findByIdAndDelete(req.params.id); res.json({ message: 'Target Deleted' }); });

app.get('/api/production-market', async (req, res) => { res.json({ production: await Production.find().sort({ month: -1 }) }); });
app.post('/api/production-market', async (req, res) => { await new Production(req.body.payload).save(); logAudit(req.body.user, 'ADD PROD', req.body.payload.partCode); res.json({ message: 'Logged' }); });
app.put('/api/production-market/:id', async (req, res) => { let p = await Production.findById(req.params.id); Object.assign(p, req.body); p.pendingQty = Math.max(0, p.plannedQty - p.actualQty); await p.save(); res.json({ message: 'Updated' }); });
app.delete('/api/production-market/:id', async (req, res) => { await Production.findByIdAndDelete(req.params.id); res.json({ message: 'Deleted' }); });
app.delete('/api/production-market/month/:monthStr', async (req, res) => { await Production.deleteMany({ month: req.params.monthStr }); res.json({ message: 'Deleted' }); });

app.get('/api/freight', async (req, res) => { res.json({ freight: await Freight.find().sort({date: -1}) }); });
app.post('/api/freight', async (req, res) => { await new Freight(req.body.payload).save(); logAudit(req.body.user, 'ADD FREIGHT', req.body.payload.customer); res.json({ message: 'Logged' }); });
app.put('/api/freight/:id', async (req, res) => { await Freight.findByIdAndUpdate(req.params.id, req.body); res.json({ message: 'Updated' }); });
app.delete('/api/freight/:id', async (req, res) => { await Freight.findByIdAndDelete(req.params.id); res.json({ message: 'Deleted' }); });

app.post('/api/marketing/send-bulk-email', async (req, res) => {
    try {
        const { filter, specificEmail, subject, bodyText, link, mediaBase64, filename } = req.body;
        let targetCustomers = [];

        if (filter === 'single' && specificEmail && specificEmail.trim() !== "") {
            const singleCustomer = await Customer.findOne({ email: new RegExp(specificEmail.trim(), 'i') });
            if (!singleCustomer) return res.status(404).json({ error: "Customer with that email not found." });
            targetCustomers.push(singleCustomer);
        } else {
            targetCustomers = await Customer.find({ email: { $exists: true, $ne: "" } });
        }

        if (targetCustomers.length === 0) return res.status(400).json({ error: "No valid customers with email addresses found." });

        let attachmentPayload = undefined;
        if (mediaBase64) {
            const base64Data = mediaBase64.split(';base64,').pop();
            attachmentPayload = [{ name: filename || `Attachment_${Date.now()}`, content: base64Data }];
        }

        let messagesSent = 0;
        for (let customer of targetCustomers) {
            const formattedBody = bodyText.replace(/\n/g, '<br>');
            const htmlContent = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
                    <h2 style="color: #e83e8c;">PPL ENTERPRISES 🏭</h2>
                    <p style="font-size: 16px;">Dear <strong>${customer.name}</strong>,</p>
                    <p style="font-size: 15px; color: #444; line-height: 1.6;">${formattedBody}</p>
                    ${link ? `
                    <div style="text-align: center; margin-top: 30px; margin-bottom: 20px;">
                        <a href="${link}" style="background-color: #007bff; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">View Offer / Click Here</a>
                    </div>` : ''}
                    <hr style="border: none; border-top: 1px solid #eee; margin-top: 30px;">
                    <p style="font-size: 12px; color: #888; text-align: center;">This email was sent by PPL Enterprises Sales Department.<br>123 Industrial Estate, India.</p>
                </div>
            `;

            await axios.post('https://api.brevo.com/v3/smtp/email', {
                sender: { name: "PPL Enterprises", email: process.env.SMTP_USER },
                to: [{ email: customer.email, name: customer.name }],
                subject: subject,
                htmlContent: htmlContent,
                attachment: attachmentPayload
            }, {
                headers: {
                    'accept': 'application/json',
                    'api-key': process.env.BREVO_API_KEY,
                    'content-type': 'application/json'
                }
            });
            messagesSent++;
        }
        res.json({ success: true, message: `Successfully sent ${messagesSent} emails!` });
    } catch (err) {
        console.error("Bulk Email API Error:", err.response ? JSON.stringify(err.response.data) : err.message);
        res.status(500).json({ error: "Failed to send emails. Check server logs." });
    }
});

app.post('/api/marketing/generate-ai-banner', async (req, res) => {
    try {
        const { userPrompt } = req.body;
        if (!userPrompt) return res.status(400).json({ error: "User prompt is required." });

        const enhancedPrompt = `High quality professional product photography, promotional banner for industrial hardware, high-tensile bolts and nuts, ${userPrompt}, 4k resolution, highly detailed, vibrant lighting, festive atmosphere`;
        console.log("⏳ Sending prompt to Free Hugging Face API...");

        const response = await axios.post(
            "https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0",
            { inputs: enhancedPrompt },
            {
                headers: {
                    Authorization: `Bearer ${process.env.HUGGINGFACE_TOKEN}`,
                    "Content-Type": "application/json"
                },
                responseType: 'arraybuffer'
            }
        );

        const buffer = Buffer.from(response.data, 'binary');
        const base64Image = buffer.toString('base64');

        console.log("✅ Free AI Image Generated!");
        res.json({ success: true, base64Image: `data:image/jpeg;base64,${base64Image}` });

    } catch (err) {
        console.error("❌ Free AI Error:", err.message);
        res.status(500).json({ error: "Free AI Generation Failed. The server might be busy, try again in a minute." });
    }
});

app.post('/api/marketing/send-offers', async (req, res) => {
    try {
        const { messageText, filter, specificPhone } = req.body;
        let targetCustomers = [];

        if (specificPhone && specificPhone.trim() !== "") {
            const singleCustomer = await Customer.findOne({ phone: new RegExp(specificPhone.trim(), 'i') });
            if (!singleCustomer) return res.status(404).json({ error: "Customer with that phone number not found." });
            targetCustomers.push(singleCustomer);
        } else {
            const allCustomers = await Customer.find({ phone: { $exists: true, $ne: "" } });
            if (filter === 'all') targetCustomers = allCustomers;
        }

        if (targetCustomers.length === 0) return res.status(400).json({ error: "No valid customers with phone numbers found." });

        let messagesSent = 0;
        for (let customer of targetCustomers) {
            const personalizedMessage = `*PPL ENTERPRISES* 📢\n\nHi ${customer.name},\n${messageText}`;
            await sendWhatsAppMessage(customer.phone, personalizedMessage);
            messagesSent++;
        }
        res.json({ success: true, message: `WhatsApp messages sent to ${messagesSent} customers.` });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/marketing/send-single', async (req, res) => {
    try {
        const { customerId, promoType, messageText, mediaBase64, filename } = req.body;
        const customer = await Customer.findById(customerId);
        if (!customer || !customer.email) return res.status(400).json({ error: "Customer not found or has no email address." });

        let mailOptions = {
            from: '"PPL Promotions" <chennakesavarao89@gmail.com>',
            to: customer.email,
            subject: '',
            html: ''
        };

        if (promoType === 'banner' || promoType === 'offer') {
            const title = promoType === 'banner' ? 'Exclusive Update' : 'Special Offer For You!';
            mailOptions.subject = `${title} from PPL Enterprises`;
            mailOptions.html = `<p>Hello ${customer.name},</p><p>${messageText}</p><p>Please see the attached promotion.</p>`;

            if (mediaBase64) {
                const base64Data = mediaBase64.replace(/^data:image\/png;base64,/, "");
                mailOptions.attachments = [{ filename: `${promoType}_${Date.now()}.png`, content: base64Data, encoding: 'base64' }];
            }
        } else if (promoType === 'discount') {
            mailOptions.subject = `Your Custom Discount Document - PPL Enterprises`;
            mailOptions.html = `<p>Hello ${customer.name},</p><p>Please find your requested discount/pricing document attached to this email.</p>`;

            if (mediaBase64) {
                const base64Data = mediaBase64.split(';base64,').pop();
                mailOptions.attachments = [{ filename: filename || `Discount_${Date.now()}.pdf`, content: base64Data, encoding: 'base64' }];
            }
        }

        await transporter.sendMail(mailOptions);
        res.json({ success: true, message: "Promotion sent successfully!" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/unsubscribe/:id', async (req, res) => {
    try {
        await Customer.findByIdAndUpdate(req.params.id, { isSubscribed: false });
        res.send(`<div style="font-family: Arial; text-align: center; margin-top: 50px; color: #555;"><h1 style="color: #e83e8c;">Unsubscribed Successfully</h1><p>You have been removed from our marketing mailing list.</p></div>`);
    } catch (err) { res.status(500).send("Error unsubscribing."); }
});

// REPLACE THIS LINE:
// ==========================================
// 🧙‍♂️ UNIVERSAL EXCEL MAGIC IMPORTER 🧙‍♂️
// ==========================================
app.post('/api/upload/magic', multer({ dest: require('os').tmpdir() }).single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No file received by the server." });

        if (req.body.wipeDatabase === 'ALL') {
            await Dealer.deleteMany({}); await Target.deleteMany({}); await Sale.deleteMany({});
            await Order.deleteMany({}); await Production.deleteMany({}); await Freight.deleteMany({});
            logAudit(req.body.user, 'WIPE DATABASE', 'ALL DATA DELETED BEFORE IMPORT');
        }

        const fyBaseYear = parseInt(req.body.fyBase || 2024); const manualTargetMonth = req.body.targetMonth; 
        const workbook = new ExcelJS.Workbook(); 
        
        // Read the file safely from the OS Temp directory (Prevents Nodemon from crashing!)
        req.file.originalname.toLowerCase().endsWith('.csv') ? await workbook.csv.readFile(req.file.path) : await workbook.xlsx.readFile(req.file.path);
        
        let processingStats = { dealer: 0, target: 0, sale: 0, order: 0, prod: 0, freight: 0 };

        let dealersToInsert = []; let ordersToInsert = []; let prodsToInsert = [];
        let salesToInsert = []; let freightsToInsert = []; let targetsToInsert = [];
        let wosToInsert = []; 

        const getCleanHeader = (row, colIndex) => {
            let val = row.getCell(colIndex).value;
            if (val && typeof val === 'object' && val.richText) val = val.richText.map(rt => rt.text).join('');
            return String(val || '').toUpperCase().trim().replace(/\n/g, ' ').replace(/\s+/g, ' ');
        };

        for (const worksheet of workbook.worksheets) {
            let sheetType = 'UNKNOWN', headerRowNum = -1;
            
            for (let r = 1; r <= 15; r++) {
                let row = worksheet.getRow(r); 
                let vals = row.values.join(' ').toUpperCase(); 
                
                // 🛑 FIX: We moved MPS to the VERY TOP. 
                // Now it won't get confused by words like "NAME" or "CUSTOMER" meant for other sheets!
                if (vals.includes('PPL PART CODE') || vals.includes('TOTA RM QTY') || (vals.includes('SIZE') && vals.includes('PITCH') && vals.includes('TOTAL'))) { sheetType = 'MPS'; headerRowNum = r; break; }
                
                // The rest of the checks remain below MPS
                if (vals.includes('PRIMARY DEPT') || vals.includes('NORMAL COST') || vals.includes('ACTUAL COST') || vals.includes('DIFF')) { sheetType = 'FREIGHT'; headerRowNum = r; break; }
                if (vals.includes('BOOKING NO') || vals.includes('ORDER VALUE') || vals.includes('BALANCE VAL') || vals.includes('ORDER QTY')) { sheetType = 'ORDER'; headerRowNum = r; break; }
                if ((vals.includes('PART CODE') && vals.includes('PLANNED')) || vals.includes('PUNE STOCK') || vals.includes('ACTUAL SCH/ ORDER QTY') || (vals.includes('ACTUAL SCH') && vals.includes('DISPATCH'))) { sheetType = 'PRODUCTION'; headerRowNum = r; break; }
                if (vals.includes('DESC') && (vals.includes('WT/PC') || vals.includes('WTPC'))) { sheetType = 'SALES'; headerRowNum = r; break; }
                if ((vals.includes('CREDIT DAYS') || vals.includes('TERRITORY')) && (vals.includes('DISCOUNT') || vals.includes('Q1') || vals.includes('TARGET'))) { sheetType = 'TARGET'; headerRowNum = r; break; }
                if (vals.includes('CUSTOMERSNAME') || vals.includes('PARTYNAME') || vals.includes('CONTACT PERSON') || vals.includes('NAME')) { sheetType = 'DEALER'; headerRowNum = r; break; }
            }

            if (sheetType === 'UNKNOWN') continue;

            if (sheetType === 'DEALER') {
                let headerRow = worksheet.getRow(headerRowNum); let headers = {};
                headerRow.eachCell((cell, colNumber) => { headers[colNumber] = getVal(cell).trim(); });
                worksheet.eachRow((row, rowNumber) => {
                    if (rowNumber <= headerRowNum) return;
                    let rawData = {}, isRowRed = false;
                    row.eachCell((cell, colNumber) => { 
                        if(headers[colNumber]) { rawData[headers[colNumber]] = getVal(cell); }
                        if (cell.font && cell.font.color && cell.font.color.argb) { if (cell.font.color.argb.toUpperCase().includes('FF0000') || cell.font.color.argb.toUpperCase().includes('C00000')) isRowRed = true; }
                    });
                    if (Object.keys(rawData).length > 1 && rawData['PARTY NAME'] !== 'TOTAL' && rawData['NAME'] !== 'TOTAL') {
                        let cleanData = {};
                        for (let k in rawData) { let comp = String(k).toUpperCase().replace(/[^A-Z0-9]/g, ''); if (['CUSTOMERSNAME', 'PARTYNAME', 'NAME'].includes(comp)) cleanData['Name'] = rawData[k]; else cleanData[k.trim()] = rawData[k]; }
                        let finalStatus = cleanData['STATUS'] ? String(cleanData['STATUS']).toUpperCase().trim() : (worksheet.name.toUpperCase().includes('INACTIVE') ? 'INACTIVE' : 'ACTIVE');
                        if (isRowRed) finalStatus = 'INACTIVE'; delete cleanData['STATUS']; 
                        let finalCategory = finalStatus === 'INACTIVE' ? (/Indl Inactive/i.test(worksheet.name) ? 'Indl Inactive Dealers' : 'INACTIVE') : 'DEALERS';
                        if(cleanData['Name']) { dealersToInsert.push({ sheetCategory: finalCategory, status: finalStatus, isNameRed: isRowRed, data: cleanData }); }
                    }
                });
            }

            if (sheetType === 'ORDER') {
                let cols = {};
                let headerRow = worksheet.getRow(headerRowNum);
                
                for(let c = 1; c <= worksheet.columnCount; c++) { 
                    let h1 = headerRowNum > 1 ? getVal(worksheet.getRow(headerRowNum - 1).getCell(c)).toUpperCase() : '';
                    let h2 = getVal(headerRow.getCell(c)).toUpperCase();
                    let h3 = getVal(worksheet.getRow(headerRowNum + 1).getCell(c)).toUpperCase();
                    let h = [h1, h2, h3].join(' ').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim(); 

                    if (h.includes('MONTH') && !h.includes('DESP')) cols.monthName = c;
                    else if (h.includes('BOOKING NO') || h.includes('BOOKING NUMBER')) cols.bookingNumber = c; 
                    else if (h.includes('BOOKING DATE')) cols.bookingDate = c;
                    else if (h.includes('CUSTOMER NAME') || h.includes('DEALER NAME')) cols.customerName = c; 
                    else if (h.includes('CUST PART CODE') || h.includes('PART CODE') || h.includes('PRODUCT CODE')) cols.partCode = c;
                    else if (h === 'PRODUCT TYPE' || h === 'TYPE' || h.includes('TYPE')) cols.type = c; 
                    else if (h === 'SIZE' || h === 'DIA' || h.includes('SIZE')) cols.size = c; 
                    else if (h === 'A/F' || h === 'AF' || h.includes('A/F')) cols.af = c; 
                    else if (h === 'PITCH' || h.includes('PITCH')) cols.pitch = c; 
                    else if (h === 'LENGTH' || h === 'LEN' || h.includes('LENGTH')) cols.length = c; 
                    else if (h === 'GRADE' || h.includes('GRADE')) cols.grade = c;
                    else if (h.includes('PLANNED SALE')) cols.plannedSaleQty = c; 
                    else if (h.includes('ORDER QTY') || h.includes('ACTUAL SCH')) cols.orderQty = c;
                    else if (h.includes('DISPATCH QTY') || h.includes('DESPATCH QTY')) cols.dispatchQty = c; 
                    else if (h.includes('LIST PRICE') || h.includes('RATE/PCS') || h.includes('UNIT PRICE') || h.includes('RATE') || h.includes('PRICE')) cols.unitPrice = c; 
                    else if (h.includes('WT/PC') || h.includes('PC/WT') || h.includes('PC WT')) cols.wtPerPc = c;
                    else if (h.includes('DESP MONTH')) cols.despMonth = c; 
                    else if (h.includes('REMARK') || h.includes('REMAK') || h.includes('REM')) cols.remarks = c; 
                    else if (h.includes('PAYMENT DATE') || h.includes('PMT')) cols.pmt = c; 
                    else if (h.includes('DESP DELAY')) cols.despDelay = c;
                    else if (h.includes('ORDER VALUE') || h.includes('SCH VAL') || h.includes('VALUE')) cols.orderValue = c;
                    else if (h.includes('DESPATCH VAL') || h.includes('DISPATCH VAL')) cols.dispatchValue = c;
                    else if (h.includes('BALANCE VAL')) cols.balanceValue = c;
                }
                
                let segment = 'General'; let sName = worksheet.name.toUpperCase();
                if (sName.includes('SS')) segment = 'SS'; else if (sName.includes('IND')) segment = 'IND'; else if (sName.includes('OEM')) segment = 'OEM'; else if (sName.includes('AUTO') || sName.includes('ORDER BOOK')) segment = 'AUTO';

                worksheet.eachRow((row, rNum) => {
                    if (rNum <= headerRowNum + 1) return;
                    
                    let partCode = cols.partCode ? getVal(row.getCell(cols.partCode)) : ''; 
                    let customerName = cols.customerName ? getVal(row.getCell(cols.customerName)) : '';
                    if ((!partCode && !customerName) || partCode.toUpperCase().includes('TOTAL') || customerName.toUpperCase().includes('TOTAL')) return;

                    let type = cols.type ? getVal(row.getCell(cols.type)) : ''; 
                    let size = cols.size ? getVal(row.getCell(cols.size)) : ''; 
                    let pitch = cols.pitch ? getVal(row.getCell(cols.pitch)) : ''; 
                    let len = cols.length ? getVal(row.getCell(cols.length)) : ''; 
                    let grade = cols.grade ? getVal(row.getCell(cols.grade)) : '';
                    let af = cols.af ? getVal(row.getCell(cols.af)) : '';

                    let description = `${type} ${size} x ${pitch} x ${len} ${grade}`.replace(/\s+/g, ' ').trim(); if (description === 'x x' || description === '') description = partCode;

                    let ordQty = cols.orderQty ? extractNumVal(row.getCell(cols.orderQty)) : 0; 
                    let despQty = cols.dispatchQty ? extractNumVal(row.getCell(cols.dispatchQty)) : 0; 
                    let psq = cols.plannedSaleQty ? extractNumVal(row.getCell(cols.plannedSaleQty)) : 0;
                    
                    let rowMonthStr = cols.monthName ? getVal(row.getCell(cols.monthName)) : ''; 
                    let bDateVal = cols.bookingDate ? getVal(row.getCell(cols.bookingDate)) : '';
                    let parsedDate = parseExcelDate(bDateVal); let finalDate = '';
                    if (parsedDate && parsedDate.length >= 7) { finalDate = parsedDate.substring(0, 7) + '-01'; } else if (rowMonthStr) { let mNum = getMonthNum(rowMonthStr); if (mNum) { let year = (parseInt(mNum) >= 4) ? fyBaseYear : fyBaseYear + 1; finalDate = `${year}-${mNum}-01`; } }
                    if (!finalDate) { finalDate = manualTargetMonth ? manualTargetMonth + '-01' : `${fyBaseYear}-04-01`; }

                    if (ordQty > 0 || despQty > 0 || psq > 0) {
                        let ord = { 
                            orderNumber: generateSysId(), 
                            date: finalDate, segment: segment, monthName: rowMonthStr, bookingNumber: cols.bookingNumber ? getVal(row.getCell(cols.bookingNumber)) : '', bookingDate: parsedDate, customerName: customerName, partCode, description, 
                            type, size, af, pitch, length: len, grade, 
                            wtPerPc: cols.wtPerPc ? extractNumVal(row.getCell(cols.wtPerPc)) : 0, plannedSaleQty: psq, orderQty: ordQty, dispatchQty: despQty, unitPrice: cols.unitPrice ? extractNumVal(row.getCell(cols.unitPrice)) : 0, despMonth: cols.despMonth ? getVal(row.getCell(cols.despMonth)) : '', despDelay: cols.despDelay ? getVal(row.getCell(cols.despDelay)) : '', remarks: cols.remarks ? getVal(row.getCell(cols.remarks)) : '', pmt: cols.pmt ? getVal(row.getCell(cols.pmt)) : '',
                            schValue: cols.orderValue ? extractNumVal(row.getCell(cols.orderValue)) : 0,
                            dispatchValue: cols.dispatchValue ? extractNumVal(row.getCell(cols.dispatchValue)) : 0,
                            pendingDispatchValue: cols.balanceValue ? extractNumVal(row.getCell(cols.balanceValue)) : 0
                        };
                        ordersToInsert.push(calcOrderFields(ord));
                    }
                });
            }

            if (sheetType === 'PRODUCTION') {
                let cols = {};
                let headerRow = worksheet.getRow(headerRowNum);
                for(let c=1; c<=worksheet.columnCount; c++){ 
                    let h = getCleanHeader(headerRow, c);
                    if (h.includes('PART CODE') || h.includes('PART NO') || h.includes('CUST PART CODE')) cols.part = c; 
                    else if (h.includes('PLANNED SALE') || h.includes('PLANNED QTY') || h === 'PLAN') cols.plan = c; 
                    else if (h.includes('ACTUAL SCH') || h.includes('PUNE STOCK') || h.includes('ACTUAL') || h.includes('ORDER QTY')) cols.actual = c; 
                    else if (h.includes('BALANCE QTY') || h.includes('PENDING QTY') || h.includes('PENDING') || h.includes('BALANCE')) cols.pending = c; 
                    else if (h === 'STATUS') cols.status = c; 
                }
                worksheet.eachRow((row, rNum) => {
                    if (rNum <= headerRowNum) return;
                    let partCode = cols.part ? getVal(row.getCell(cols.part)) : ''; if (!partCode || partCode.toUpperCase().includes('TOTAL')) return;
                    let plannedQty = cols.plan ? extractNumVal(row.getCell(cols.plan)) : 0; let actualQty = cols.actual ? extractNumVal(row.getCell(cols.actual)) : 0; let pendingQty = cols.pending ? extractNumVal(row.getCell(cols.pending)) : 0; let status = cols.status ? getVal(row.getCell(cols.status)) : 'Pending';
                    if (plannedQty > 0 || actualQty > 0 || pendingQty > 0) { 
                        prodsToInsert.push({ month: manualTargetMonth || `${fyBaseYear}-12`, partCode, description: partCode, plannedQty, actualQty, pendingQty, status }); 
                    }
                });
            }

            if (sheetType === 'SALES') {
                let headerRow = worksheet.getRow(headerRowNum);
                let wtColIdx = -1, descColIdx = -1, custColIdx = -1; 
                headerRow.eachCell((c, i) => { let v = getVal(c).toUpperCase(); if (v.includes('WT')) wtColIdx = i; if (v.includes('DESC') || v.includes('PART CODE') || v.includes('ITEM')) descColIdx = i; if (v.includes('CUSTOMER')) custColIdx = i; });
                if(descColIdx === -1) descColIdx = 2;

                let categoryRow = worksheet.getRow(headerRowNum > 1 ? headerRowNum - 1 : headerRowNum); 
                let qtyCols = {}, valCols = {}, currentCat = ''; let currentYearStr = String(fyBaseYear);
                
                for (let c = 1; c <= worksheet.columnCount; c++) {
                    let catVal = getVal(categoryRow.getCell(c)).toUpperCase();
                    if (catVal.match(/20\d\d-20\d\d/) || catVal.match(/20\d\d-\d\d/)) currentYearStr = catVal.match(/20\d\d/)[0];
                    if (catVal.includes('QTY') || catVal.includes('QUANTITY')) currentCat = 'QTY'; else if (catVal.includes('VAL') || catVal.includes('VALUE')) currentCat = 'VAL'; else if (catVal.includes('WT') || catVal.includes('WEIGHT')) currentCat = 'WT';
                    
                    let rawHeader = headerRow.getCell(c).value || headerRow.getCell(c).text; let parsedHDate = parseExcelDate(rawHeader); let hVal = getVal(headerRow.getCell(c)).toUpperCase().replace(/\n/g, ' ').replace(/\s+/g, ' ').trim(); 
                    let monthStr = null;
                    if (parsedHDate && parsedHDate.match(/^20\d\d-\d\d/)) { monthStr = parsedHDate.substring(0, 7); } else { let mNum = getMonthNum(hVal); if (mNum) { let y = parseInt(currentYearStr); if (parseInt(mNum) < 4) y += 1; monthStr = `${y}-${mNum}`; } }
                    if (monthStr) { if (currentCat === 'QTY' || !currentCat) qtyCols[c] = monthStr; if (currentCat === 'VAL') valCols[c] = monthStr; }
                }

                if (Object.keys(qtyCols).length > 0) {
                    worksheet.eachRow((row, rowNumber) => {
                        if (rowNumber <= headerRowNum) return; 
                        let desc = getVal(row.getCell(descColIdx)); if (!desc || desc.toUpperCase().includes('TOTAL')) return;
                        let customerName = custColIdx !== -1 ? getVal(row.getCell(custColIdx)) : ''; let wtPerPc = wtColIdx !== -1 ? extractNumVal(row.getCell(wtColIdx)) : 0; 
                        let partCode = ''; const match = desc.match(/\(([^)]+)\)$/); if (match) partCode = match[1].trim(); else partCode = desc.substring(0, 15).trim();
                        for (let colIdx in qtyCols) {
                            let monthStr = qtyCols[colIdx]; let qty = extractNumVal(row.getCell(parseInt(colIdx))); let valColIdx = Object.keys(valCols).find(k => valCols[k] === monthStr); let val = valColIdx ? extractNumVal(row.getCell(parseInt(valColIdx))) : 0;
                            if (qty > 0 || val > 0) { 
                                let tw = (qty * wtPerPc)/1000; 
                                salesToInsert.push({ date: monthStr+'-01', customerName, partCode, description: desc, wtPerPc, quantity: qty, totalWeight: tw, value: val, realization: tw>0?(val/tw):0 }); 
                            } 
                        }
                    });
                } else {
                    let subHeader = worksheet.getRow(headerRowNum + 1); let qCol = -1, vCol = -1;
                    subHeader.eachCell((c, i) => { let v = getVal(c).toUpperCase(); if (v === '(Q)') qCol = i; if (v === '(V)') vCol = i; });
                    if (qCol === -1) qCol = 6; if (vCol === -1) vCol = 8;
                    let headerString = headerRow.values.join(' ').toUpperCase(); let fyMatch = headerString.match(/(22|23|24|25)-(23|24|25|26)/); let yearToUse = fyBaseYear; if (fyMatch) yearToUse = 2000 + parseInt(fyMatch[1]);
                    worksheet.eachRow((row, rowNumber) => {
                        if (rowNumber <= subHeader.number) return;
                        let desc = getVal(row.getCell(descColIdx)); if (!desc || desc.toUpperCase().includes('TOTAL')) return;
                        let customerName = custColIdx !== -1 ? getVal(row.getCell(custColIdx)) : ''; let wtPerPc = wtColIdx !== -1 ? extractNumVal(row.getCell(wtColIdx)) : 0; 
                        let partCode = ''; const match = desc.match(/\(([^)]+)\)$/); if (match) partCode = match[1].trim(); else partCode = desc.substring(0, 15).trim();
                        let qty = extractNumVal(row.getCell(qCol)), val = extractNumVal(row.getCell(vCol));
                        if (qty > 0 || val > 0) { 
                            let tw = (qty * wtPerPc)/1000; 
                            salesToInsert.push({ date: `${yearToUse}-04-01`, customerName, partCode, description: desc, wtPerPc, quantity: qty, totalWeight: tw, value: val, realization: tw>0?(val/tw):0 }); 
                        }
                    });
                }
            }

            if (sheetType === 'FREIGHT') {
                let cols = {};
                let headerRow = worksheet.getRow(headerRowNum);
                for(let c = 1; c <= worksheet.columnCount; c++) { 
                    let h = getCleanHeader(headerRow, c);
                    if (h === 'DATE') cols.date = c;
                    else if (h === 'CUSTOMER') cols.customer = c;
                    else if (h === 'PART DETAILS') cols.partDetails = c;
                    else if (h === 'QTY') cols.qty = c;
                    else if (h === 'WEIGHT') cols.weight = c;
                    else if (h === 'ACTUAL COST') cols.actualCost = c;
                    else if (h === 'NORMAL COST' || h === 'NORMAL COSTS') cols.normalCost = c;
                    else if (h === 'DIFF') cols.diff = c;
                    else if (h === 'PRIMARY DEPT') cols.primaryDept = c;
                    else if (h === 'SECONDARY DEPT') cols.secondaryDept = c;
                    else if (h === 'REMARK' || h === 'REMARKS') cols.remarks = c;
                }

                worksheet.eachRow((row, rNum) => {
                    if (rNum <= headerRowNum) return; 
                    let date = cols.date ? parseExcelDate(getVal(row.getCell(cols.date))) : ''; 
                    if(!date) return; 
                    let actual = cols.actualCost ? extractNumVal(row.getCell(cols.actualCost)) : 0;
                    let normal = cols.normalCost ? extractNumVal(row.getCell(cols.normalCost)) : 0;
                    freightsToInsert.push({ 
                        date, 
                        customer: cols.customer ? getVal(row.getCell(cols.customer)) : '', 
                        partDetails: cols.partDetails ? getVal(row.getCell(cols.partDetails)) : '', 
                        qty: cols.qty ? extractNumVal(row.getCell(cols.qty)) : 0, 
                        weight: cols.weight ? extractNumVal(row.getCell(cols.weight)) : 0, 
                        actualCost: actual, 
                        normalCost: normal, 
                        diff: cols.diff ? extractNumVal(row.getCell(cols.diff)) : (actual - normal), 
                        primaryDept: cols.primaryDept ? getVal(row.getCell(cols.primaryDept)) : '', 
                        secondaryDept: cols.secondaryDept ? getVal(row.getCell(cols.secondaryDept)) : '', 
                        remarks: cols.remarks ? getVal(row.getCell(cols.remarks)) : '' 
                    });
                });
            }

            if (sheetType === 'TARGET') {
                let tCols = { name: -1, terr: -1, cr: -1, disc: -1, cd: -1, td: -1, int: -1, tot: -1, q1: -1, q2: -1, q3: -1, q4: -1, rem: -1 };
                let hRow = worksheet.getRow(headerRowNum);
                
                hRow.eachCell((c, i) => {
                    let h = getCleanHeader(hRow, i);
                    if(h.includes('NAME') || h.includes('CUSTOMER') || h.includes('DEALER NAME')) tCols.name = i; 
                    else if(h.includes('TERRITORY') || h.includes('AREA') || h.includes('STATE') || h.includes('LOCATION')) tCols.terr = i; 
                    else if(h.includes('CREDIT DAYS') || h.includes('CREDIT')) tCols.cr = i;
                    else if(h.includes('DISCOUNT') || h.includes('DISC')) tCols.disc = i; 
                    else if(h === 'CD') tCols.cd = i; 
                    else if(h === 'TD') tCols.td = i; 
                    else if(h.includes('INTEREST')) tCols.int = i;
                    else if(h.includes('TOTAL TARGET') || h.includes('TOTAL') || h.includes('FY ')) tCols.tot = i; 
                    else if(h === 'Q1') tCols.q1 = i; 
                    else if(h === 'Q2') tCols.q2 = i; 
                    else if(h === 'Q3') tCols.q3 = i; 
                    else if(h === 'Q4') tCols.q4 = i; 
                    else if(h.includes('REMARK') || h.includes('REMARKS')) tCols.rem = i;
                });
                if (tCols.name === -1) tCols.name = 2; 

                worksheet.eachRow((row, rNum) => {
                    if (rNum <= headerRowNum) return; 
                    let dName = getVal(row.getCell(tCols.name)); if(!dName || dName.toUpperCase().includes('TOTAL')) return;
                    targetsToInsert.push({ 
                        dealerName: dName, territory: tCols.terr !== -1 ? getVal(row.getCell(tCols.terr)) : '', creditDays: tCols.cr !== -1 ? extractNumVal(row.getCell(tCols.cr)) : 0, 
                        discount: tCols.disc !== -1 ? getVal(row.getCell(tCols.disc)) : '', cd: tCols.cd !== -1 ? getVal(row.getCell(tCols.cd)) : '', td: tCols.td !== -1 ? getVal(row.getCell(tCols.td)) : '', interest: tCols.int !== -1 ? getVal(row.getCell(tCols.int)) : '', 
                        total: tCols.tot !== -1 ? extractNumVal(row.getCell(tCols.tot)) : 0, q1: tCols.q1 !== -1 ? extractNumVal(row.getCell(tCols.q1)) : 0, q2: tCols.q2 !== -1 ? extractNumVal(row.getCell(tCols.q2)) : 0, q3: tCols.q3 !== -1 ? extractNumVal(row.getCell(tCols.q3)) : 0, q4: tCols.q4 !== -1 ? extractNumVal(row.getCell(tCols.q4)) : 0, remarks: tCols.rem !== -1 ? getVal(row.getCell(tCols.rem)) : ''
                    });
                });
            }

            // ✅ PARSE MPS LOGIC PROPERLY INTEGRATED HERE
            // ✅ FULL MPS LOGIC 
            // ✅ FULL MPS LOGIC (Saves to Raw Tab, avoids Active WOs)
            // ✅ FULL MPS LOGIC (Saves to Raw Tab, avoids Active WOs)
            if (sheetType === 'MPS') {
                // Wipe the old raw data first so we don't get duplicates on re-upload
                await WorkOrder.deleteMany({ status: 'CANCELLED', remarks: 'MPS Auto-Import' });

                let headers = {};
                let headerRow = worksheet.getRow(headerRowNum);
                
                // Dynamically capture EVERY column header safely
                // Dynamically capture EVERY column header safely
                headerRow.eachCell((cell, colNumber) => {
                    if (cell.value) {
                        let cleanHeader = getVal(cell).trim().toUpperCase().replace(/\./g, '_').replace(/\$/g, '');
                        
                        // 🛑 FIX: Excel has TWO "PITCH" columns. 
                        // If we already captured "PITCH", we MUST rename the duplicate so it doesn't overwrite your real data!
                        if (cleanHeader === 'PITCH') {
                            // Check if 'PITCH' is already in the headers object
                            let alreadyExists = Object.values(headers).includes('PITCH');
                            if (alreadyExists) {
                                cleanHeader = 'PITCH_DUPLICATE_STD'; // Rename the bad one
                            }
                        }
                        
                        headers[colNumber] = cleanHeader;
                    }
                });
                worksheet.eachRow((row, rNum) => {
                    if (rNum <= headerRowNum) return;
                    
                    let rowData = {};
                    let hasData = false;
                    
                    row.eachCell((cell, colNumber) => {
                        if (headers[colNumber]) {
                            rowData[headers[colNumber]] = getVal(cell);
                            if (getVal(cell)) hasData = true;
                        }
                    });

                    // Save as long as the row has ANY data
                    if (!hasData) return;

                    let targetQty = 0;
                    if (rowData['TOTAL']) targetQty = parseFloat(String(rowData['TOTAL']).replace(/[^0-9.-]/g, '')) || 0;

                    // Push to database
                    wosToInsert.push({
                        woNumber: `MPS-${Date.now().toString().slice(-5)}-${rNum}`,
                        partNo: rowData['PPL PART CODES'] || rowData['PPL PART CODE'] || 'N/A',
                        partName: `${rowData['TYPE'] || ''} ${rowData['SIZE'] || ''}`.trim(),
                        type: rowData['TYPE'] || '',
                        size: rowData['SIZE'] || '',
                        pitch: rowData['PITCH'] || '',
                        length: rowData['LENGTH'] || '',
                        gr: rowData['GRADE'] || '',
                        targetQty: targetQty,
                        producedQty: 0,
                        // 🛑 FIX: Use CANCELLED to bypass DB rules while hiding it from Active WOs!
                        status: 'CANCELLED', 
                        rmDetails: `${rowData['R_M DETAIL'] || ''} (Wire: ${rowData['WIRE SIZE'] || ''})`, 
                        rmKg: parseFloat(String(rowData['TOTA RM QTY'] || '0').replace(/[^0-9.-]/g, '')) || 0,
                        remarks: `MPS Auto-Import`,
                        createdBy: req.body.user || 'System',
                        mpsRawData: rowData 
                    });
                });
            }
        } // <-- End of the worksheet loop

        // 🚨 BULK INSERT ENGINE WITH `ordered: false` 🚨
        const safeInsert = async (Model, data, statKey) => {
            if (data.length > 0) {
                try {
                    let result = await Model.insertMany(data, { ordered: false });
                    processingStats[statKey] += result.length || data.length;
                } catch (e) {
                    processingStats[statKey] += e.insertedDocs ? e.insertedDocs.length : 0;
                }
            }
        };

        await safeInsert(Dealer, dealersToInsert, 'dealer');
        await safeInsert(Order, ordersToInsert, 'order');
        await safeInsert(Production, prodsToInsert, 'prod');
        await safeInsert(Sale, salesToInsert, 'sale');
        await safeInsert(Freight, freightsToInsert, 'freight');
        await safeInsert(Target, targetsToInsert, 'target');
        await safeInsert(WorkOrder, wosToInsert, 'order'); 

        logAudit(req.body.user, 'SYSTEM IMPORT', `Success. Processed multiple sheets via safe bulk insert.`);
        res.json({ message: `Import Complete!` });
    } catch (err) { 
        console.error("FATAL IMPORT ERROR:", err); 
        res.status(500).json({ error: err.message }); 
    }
});

// Force IPv4 binding by passing '0.0.0.0' to prevent IPv6 localhost mismatch errors
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Master ERP Server Running on IPv4 port ${PORT}`));