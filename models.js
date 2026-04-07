const mongoose = require('mongoose');

// --- YOUR EXISTING SCHEMAS ---
const productSchema = new mongoose.Schema({
    barcode: { type: String, required: true, unique: true },
    productCode: String, sector: String, type: String, grade: String, af: Number, length: Number, weightPerPc: Number,
    currentStock: { type: Number, default: 0 }, wipStock: { type: Number, default: 0 }, reservedStock: { type: Number, default: 0 }, 
    productionReadied: { type: Number, default: 0 }, fgCheck: { type: Number, default: 0 }, lastUpdated: { type: Date, default: Date.now }
});

const transactionSchema = new mongoose.Schema({
    barcode: String, type: { type: String, enum: ['INWARD', 'DISPATCH', 'PRODUCTION', 'ADJUSTMENT', 'QC_APPROVAL'] },
    quantity: Number, resultingStock: Number, user: String, date: { type: Date, default: Date.now }
});

const rawMaterialSchema = new mongoose.Schema({
    materialCode: { type: String, required: true, unique: true }, materialName: String, grade: String, scope: String,        
    lastSupplier: String, currentStockKg: { type: Number, default: 0 }, lastUpdatedBy: String, lastUpdate: { type: Date, default: Date.now }
});

const purchaseOrderSchema = new mongoose.Schema({
    poNumber: String, supplierName: String, materialCode: String, grade: String, scope: String, expectedKg: Number,
    costPerKg: Number, totalCost: Number, status: { type: String, enum: ['PENDING', 'RECEIVED'], default: 'PENDING' },
    orderedBy: String, orderDate: { type: Date, default: Date.now }, receivedDate: Date
});

const productionBatchSchema = new mongoose.Schema({
    batchNumber: { type: String, unique: true, sparse: true }, date: { type: Date, default: Date.now }, stage: { type: String, required: true },
    machineName: String, operator: String, shift: String, partNo: String, workOrderNo: String, partSize: String, pitch: String,
    length: Number, partName: String, af: String, productGrade: String, operation: String, rawMaterialCode: String, heatNo: String,
    rawMaterialConsumedKg: { type: Number, default: 0 }, pieceWeightKg: { type: Number, default: 0 }, scheduleHours: { type: Number, default: 0 },
    jobChangeHours: { type: Number, default: 0 }, prodPlannedHours: { type: Number, default: 0 }, speedRpm: { type: Number, default: 0 },
    shiftTargetQty: { type: Number, default: 0 }, acceptedQty: { type: Number, default: 0 }, rejectedQty: { type: Number, default: 0 },
    rejectionKg: { type: Number, default: 0 }, rejectionReason: String, remarks: String, lossMajorJC: { type: Number, default: 0 },
    lossMinorJC: { type: Number, default: 0 }, lossSetting: { type: Number, default: 0 }, lossMcClean: { type: Number, default: 0 },
    lossToolRework: { type: Number, default: 0 }, lossNoTool: { type: Number, default: 0 }, lossNoLoad: { type: Number, default: 0 },
    lossNoOperator: { type: Number, default: 0 }, lossMMnt: { type: Number, default: 0 }, lossEMnt: { type: Number, default: 0 },
    lossNoPower: { type: Number, default: 0 }, lossNoAirOil: { type: Number, default: 0 }, lossNoRm: { type: Number, default: 0 },
    lossRmLoading: { type: Number, default: 0 }, lossQaApproval: { type: Number, default: 0 }, lossCoilChange: { type: Number, default: 0 },
    lossNoPlan: { type: Number, default: 0 }, lossNpdTeam: { type: Number, default: 0 }, lossUnknown: { type: Number, default: 0 },
    loggedBy: String, qcStatus: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' }, qcBy: String,
    qcDate: Date, qcRemarks: String, ppcStatus: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
    ppcBy: String, ppcRemarks: String, ppcDate: Date, isReadyForNextStage: { type: Boolean, default: false }, nextProcessRoute: { type: String },
    measuredLength: Number, measuredAF: String, threadGauge: { type: String, enum: ['PASS', 'FAIL', 'N/A'], default: 'N/A' }
});

const workOrderSchema = new mongoose.Schema({
    woNumber: { type: String, required: true, unique: true }, partNo: String, partName: String, targetQty: Number, producedQty: { type: Number, default: 0 },
    status: { type: String, enum: ['ACTIVE', 'COMPLETED', 'CANCELLED'], default: 'ACTIVE' }, createdBy: String, createdAt: { type: Date, default: Date.now }
});

const CustomerSchema = new mongoose.Schema({
    name: { type: String, required: true }, sector: { type: String }, transportMode: { type: String }, phone: { type: String }, email: { type: String },
    address: { type: String }, area: { type: String }, pinCode: { type: String }, state: { type: String }, zone: { type: String },
    type: { type: String, enum: ['DEALER', 'RETAILER', 'BULK_BUYER', 'OTHER'], default: 'RETAILER' }, isSubscribed: { type: Boolean, default: true },
    interactions: [{ date: { type: Date, default: Date.now }, type: { type: String }, notes: { type: String } }], createdAt: { type: Date, default: Date.now }
});

const SalesOrderSchema = new mongoose.Schema({
    orderNo: { type: String, required: true, unique: true }, customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' }, customerName: { type: String }, 
    items: [{ productCode: { type: String, required: true }, sector: { type: String }, grade: { type: String }, length: { type: Number }, af: { type: String }, weightPerPc: { type: Number }, quantity: { type: Number, required: true }, unitPrice: { type: Number, required: true }, total: { type: Number, required: true } }],
    subtotal: { type: Number, default: 0 }, gstAmount: { type: Number, default: 0 }, grandTotal: { type: Number, default: 0 },
    status: { type: String, enum: ['QUOTATION', 'CONFIRMED', 'IN_PRODUCTION', 'DISPATCHED', 'SHIPPED', 'DELIVERED'], default: 'QUOTATION' },
    paymentStatus: { type: String, enum: ['PENDING', 'PARTIAL', 'PAID', 'OVERDUE'], default: 'PENDING' }, trackingLink: { type: String }, orderDate: { type: Date, default: Date.now }, createdBy: { type: String }
});

// 2. Main ERP Models
const Product = mongoose.model('Product', productSchema);
const Transaction = mongoose.model('Transaction', transactionSchema);
const RawMaterial = mongoose.model('RawMaterial', rawMaterialSchema);
const PurchaseOrder = mongoose.model('PurchaseOrder', purchaseOrderSchema);
const ProductionBatch = mongoose.model('ProductionBatch', productionBatchSchema);
const WorkOrder = mongoose.model('WorkOrder', workOrderSchema);
const Customer = mongoose.model('Customer', CustomerSchema);
const SalesOrder = mongoose.model('SalesOrder', SalesOrderSchema);



// ==========================================
// NEW: TOOL ROOM & QA STATE SCHEMA
// ==========================================
// This single document stores the state of the Tool Room without breaking the Warehouse ERP
const ErpStateSchema = new mongoose.Schema({
    identifier: { type: String, default: "production_state", unique: true },
    state: { type: Object, default: {} }
}, { minimize: false });

const ErpState = mongoose.model('ErpState', ErpStateSchema);

// --- EXPORTS ---
module.exports = { 
    Product, Transaction, RawMaterial, PurchaseOrder, ProductionBatch, WorkOrder, Customer, SalesOrder,ErpState
};