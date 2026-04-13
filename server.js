const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const cors = require('cors');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
require('dotenv').config();


const axios = require('axios');
const app = express();

// ==========================================
// CORS Configuration
// ==========================================
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'Accept']
}));
// Allow large file uploads via Base64 (up to 50MB)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
const { Product, Transaction, RawMaterial, PurchaseOrder, ProductionBatch, WorkOrder, Customer, SalesOrder, ErpState, } = require('./models');

// ==========================================
// WHATSAPP API & PDF SETUP (server.js)
// ==========================================
// REMOVE: const nodemailer = require('nodemailer');



// ==========================================

// Helper: Send WhatsApp Message via Meta Cloud API using Axios
async function sendWhatsAppMessage(phoneNumber, messageText) {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_ID;

    if (!token || !phoneId) {
        console.log("⚠️ WhatsApp credentials missing in .env file. Message not sent.");
        return;
    }

    // Clean phone number (remove spaces, +, etc. e.g., '919999999999')
    const cleanPhone = phoneNumber.replace(/\D/g, '');

    try {
        const response = await axios.post(
            `https://graph.facebook.com/v17.0/${phoneId}/messages`,
            {
                messaging_product: "whatsapp",
                to: cleanPhone,
                type: "text",
                text: { body: messageText }
            },
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        console.log(`✅ WhatsApp sent successfully to ${cleanPhone}`);
    } catch (err) {
        // This will print the EXACT reason Meta rejected the message if it fails
        console.error("❌ Failed to send WhatsApp:", err.response ? JSON.stringify(err.response.data) : err.message);
    }
}
// ... (Keep your generateInvoiceBuffer and drawInvoiceDesign functions here) ...
// Shared Function to draw the beautiful PDF Invoice
function drawInvoiceDesign(doc, order, customer) {
    // 1. Company Logo & Details
    doc.rect(50, 40, 50, 50).fillAndStroke('#f8f9fa', '#6f42c1'); // Logo Box
    doc.fillColor('#6f42c1').fontSize(12).text('PPL', 62, 60); // Logo Text

    doc.fontSize(24).fillColor('#6f42c1').text('PPL ENTERPRISES', 115, 45);
    doc.fontSize(10).fillColor('#555555').text('123 Industrial Estate, Hyderabad, Telangana, India', 115, 75);
    doc.text('GSTIN: 36AAAAA1234A1Z5 | Phone: +91 99999 99999 | Email: sales@ppl.com', 115, 90);

    doc.moveTo(50, 115).lineTo(550, 115).strokeColor('#dddddd').stroke();

    // 2. Invoice Title & Order Details
    doc.moveDown(2);
    doc.fontSize(18).fillColor('#000000').text('TAX INVOICE', { align: 'center' });
    doc.moveDown();

    doc.fontSize(11).text(`Invoice / Order No: `, 50, 170).font('Helvetica-Bold').text(order.orderNo, 155, 170);
    doc.font('Helvetica').text(`Date: `, 400, 170).font('Helvetica-Bold').text(new Date(order.orderDate).toLocaleDateString(), 435, 170);

    // 3. Customer Details
    doc.font('Helvetica-Bold').text(`Billed To:`, 50, 200);
    doc.font('Helvetica').text(customer.name, 50, 215);
    doc.text(customer.address || 'Address not provided', 50, 230);
    doc.text(`${customer.email || 'No email'} | ${customer.phone || 'No phone'}`, 50, 245);

    // 4. Product Table Header
    const startY = 290;
    doc.rect(50, startY, 500, 25).fill('#6f42c1');
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(10);
    doc.text('Product Code', 60, startY + 8);
    doc.text('Specs (Gr/L/AF)', 200, startY + 8);
    doc.text('Qty', 370, startY + 8);
    doc.text('Price', 430, startY + 8);
    doc.text('Total', 490, startY + 8);

    // 5. Product Rows
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

    // 6. Totals
    currentY += 10;
    doc.fontSize(11).text(`Subtotal:`, 380, currentY).text(`Rs ${order.subtotal}`, 460, currentY, { align: 'right' });
    doc.text(`GST (18%):`, 380, currentY + 15).text(`Rs ${order.gstAmount.toFixed(2)}`, 460, currentY + 15, { align: 'right' });

    doc.font('Helvetica-Bold').fontSize(14).fillColor('#28a745');
    doc.text(`Grand Total:`, 350, currentY + 40).text(`Rs ${order.grandTotal.toLocaleString()}`, 430, currentY + 40, { align: 'right' });

    // 7. Signatures
    const sigY = currentY + 100;
    doc.moveTo(50, sigY).lineTo(200, sigY).strokeColor('#000').stroke();
    doc.fillColor('#000').fontSize(10).font('Helvetica').text('Authorized by Sales Department', 50, sigY + 5);

    doc.moveTo(350, sigY).lineTo(500, sigY).strokeColor('#000').stroke();
    doc.text('Approved by MD', 390, sigY + 5);
}

// Generate PDF Buffer for Email Attachment
function generateInvoiceBuffer(order, customer) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ size: 'A4', margin: 50 });
            let buffers = [];
            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => resolve(Buffer.concat(buffers)));
            drawInvoiceDesign(doc, order, customer);
            doc.end();
        } catch (err) { reject(err); }
    });
}



// ==========================================
// BULK EMAIL MARKETING ENGINE (Bypasses Render Firewall via API)
// ==========================================
app.post('/api/marketing/send-bulk-email', async (req, res) => {
    try {
        const { filter, specificEmail, subject, bodyText, link, mediaBase64, filename } = req.body;

        let targetCustomers = [];

        // 1. Determine Target Audience
        if (filter === 'single' && specificEmail && specificEmail.trim() !== "") {
            const singleCustomer = await Customer.findOne({ email: new RegExp(specificEmail.trim(), 'i') });
            if (!singleCustomer) return res.status(404).json({ error: "Customer with that email not found." });
            targetCustomers.push(singleCustomer);
        } else {
            targetCustomers = await Customer.find({ email: { $exists: true, $ne: "" } });
        }

        if (targetCustomers.length === 0) return res.status(400).json({ error: "No valid customers with email addresses found." });

        // 2. Prepare the Attachment (if uploaded)
        let attachmentPayload = undefined;
        if (mediaBase64) {
            const base64Data = mediaBase64.split(';base64,').pop();
            attachmentPayload = [{
                name: filename || `Attachment_${Date.now()}`,
                content: base64Data
            }];
        }

        // 3. Loop through and Email them using Brevo API
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

            // Punch through the firewall using Port 443 (HTTPS)
            await axios.post('https://api.brevo.com/v3/smtp/email', {
                sender: { name: "PPL Enterprises", email: process.env.SMTP_USER }, // Must match the email you verified in Brevo
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
        // This will print the EXACT reason Brevo failed if something goes wrong
        console.error("Bulk Email API Error:", err.response ? JSON.stringify(err.response.data) : err.message);
        res.status(500).json({ error: "Failed to send emails. Check server logs." });
    }
});
// NEW: Download PDF Invoice Endpoint
app.get('/api/sales-orders/:id/invoice', async (req, res) => {
    try {
        const order = await SalesOrder.findById(req.params.id);
        if (!order) return res.status(404).send("Order not found");
        const customer = await Customer.findById(order.customerId);

        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Invoice_${order.orderNo}.pdf`);
        doc.pipe(res);

        drawInvoiceDesign(doc, order, customer);
        doc.end();
    } catch (err) { res.status(500).send("Error generating invoice."); }
});

// Helper: Generate HTML Invoice for Emails
function generateInvoiceHTML(order, customer) {
    const itemsHtml = order.items.map(item => `
        <tr>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;">
                <strong>${item.productCode}</strong><br>
                <span style="font-size: 11px; color: #666;">Sec: ${item.sector || '-'} | Gr: ${item.grade || '-'} | L: ${item.length || '-'}mm | A/F: ${item.af || '-'} | Wt: ${item.weightPerPc || '-'}g</span>
            </td>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;">${item.quantity}</td>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;">₹${item.unitPrice}</td>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;">₹${item.total}</td>
        </tr>
    `).join('');

    return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #ddd; padding: 20px;">
        <h2 style="color: #6f42c1; text-align: center;">PPL ENTERPRISES</h2>
        <h3 style="color: #333;">Tax Invoice / Order: ${order.orderNo}</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; text-align: left;">
            <tr style="background-color: #f8f9fa;">
                <th style="padding: 10px; border-bottom: 2px solid #ddd;">Item</th>
                <th style="padding: 10px; border-bottom: 2px solid #ddd;">Qty</th>
                <th style="padding: 10px; border-bottom: 2px solid #ddd;">Price</th>
                <th style="padding: 10px; border-bottom: 2px solid #ddd;">Total</th>
            </tr>
            ${itemsHtml}
        </table>
        <h3 style="text-align: right; color: #28a745;">Grand Total: ₹${order.grandTotal.toLocaleString()}</h3>
    </div>`;
}

// ==========================================
// FREE AI MARKETING (Hugging Face API via Axios)
// ==========================================
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
                responseType: 'arraybuffer' // CRITICAL: Tells Axios we are downloading a binary image
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

// ==========================================
// TARGETED WHATSAPP MARKETING
// ==========================================
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
            await sendWhatsAppMessage(customer.phone, personalizedMessage); // Make sure sendWhatsAppMessage function is at the top of your file!
            messagesSent++;
        }
        res.json({ success: true, message: `WhatsApp messages sent to ${messagesSent} customers.` });
    } catch (err) {
        console.error("Marketing Error:", err);
        res.status(500).json({ error: err.message });
    }
});


// ==========================================
// INDIVIDUAL PROMOTIONS (BANNER, OFFER, DISCOUNT)
// ==========================================
app.post('/api/marketing/send-single', async (req, res) => {

    
    try {
        const { customerId, promoType, messageText, mediaBase64, filename } = req.body;

        await transporter.sendMail(mailOptions);

        const customer = await Customer.findById(customerId);
        if (!customer || !customer.email) {
            return res.status(400).json({ error: "Customer not found or has no email address." });
        }

        let mailOptions = {
            from: '"PPL Promotions" <chennakesavarao89@gmail.com>',
            to: customer.email,
            subject: '',
            html: ''
        };

        // Determine what we are sending
        if (promoType === 'banner' || promoType === 'offer') {
            const title = promoType === 'banner' ? 'Exclusive Update' : 'Special Offer For You!';
            mailOptions.subject = `${title} from PPL Enterprises`;
            mailOptions.html = `
                <p>Hello ${customer.name},</p>
                <p>${messageText}</p>
                <p>Please see the attached promotion.</p>
            `;

            // Attach the Canvas Image
            if (mediaBase64) {
                const base64Data = mediaBase64.replace(/^data:image\/png;base64,/, "");
                mailOptions.attachments = [{
                    filename: `${promoType}_${Date.now()}.png`,
                    content: base64Data,
                    encoding: 'base64'
                }];
            }
        }
        else if (promoType === 'discount') {
            mailOptions.subject = `Your Custom Discount Document - PPL Enterprises`;
            mailOptions.html = `<p>Hello ${customer.name},</p><p>Please find your requested discount/pricing document attached to this email.</p>`;

            // Attach the Uploaded PDF/Image
            if (mediaBase64) {
                const base64Data = mediaBase64.split(';base64,').pop(); // Strip the mime type header
                mailOptions.attachments = [{
                    filename: filename || `Discount_${Date.now()}.pdf`,
                    content: base64Data,
                    encoding: 'base64'
                }];
            }
        }

        // Send the email (ensure your transporter uses App Passwords as fixed earlier)
        await transporter.sendMail(mailOptions);
        res.json({ success: true, message: "Promotion sent successfully!" });

    } catch (err) {
        console.error("Single Promo Error:", err);
        res.status(500).json({ error: err.message });
    }
});
// Serve the Frontend Dashboard
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ==========================================
// DB Connection
// ==========================================
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB Connected Successfully"))
    .catch(err => console.error("❌ MongoDB Connection CRASH:", err));

// ==========================================
// AUTHENTICATION
// ==========================================
// ==========================================
// AUTHENTICATION
// ==========================================
const DASHBOARD_USERS = {
    "admin": { pass: "admin123", role: "ADMIN" },
    "toolroom": { pass: "tool123", role: "TOOLROOM" }, // Added Tool Room
    "qa": { pass: "qa123", role: "QA" },               // Added QA
    "buyer": { pass: "buy123", role: "PURCHASE" },
    "ppc": { pass: "ppc123", role: "PPC" },
    "maker": { pass: "make123", role: "PRODUCTION" },
    "seller": { pass: "sell123", role: "SALES" },
    "qc": { pass: "qc123", role: "QC" }
};
const WORKER_USERS = { "worker1": { pass: "work123", role: "PRODUCTION" } };

app.post('/api/login', (req, res) => {
    const username = req.body.username ? req.body.username.toLowerCase().trim() : '';
    const password = req.body.password ? req.body.password.trim() : '';
    console.log(`🚨 [LOGIN ATTEMPT] Username: "${username}"`);

    if (password === 'Admin12345' && !username) return res.json({ success: true, role: "ADMIN", username: "Admin" });
    if (DASHBOARD_USERS[username] && DASHBOARD_USERS[username].pass === password) return res.json({ success: true, role: DASHBOARD_USERS[username].role, username: username });
    if (WORKER_USERS[username] && WORKER_USERS[username].pass === password) return res.json({ success: true, role: WORKER_USERS[username].role, username: username });

    res.status(401).json({ success: false, message: "Access Denied: Incorrect credentials." });
});

// ==========================================
// UNSUBSCRIBE ENDPOINT
// ==========================================
app.get('/api/unsubscribe/:id', async (req, res) => {
    try {
        await Customer.findByIdAndUpdate(req.params.id, { isSubscribed: false });
        res.send(`<div style="font-family: Arial; text-align: center; margin-top: 50px; color: #555;">
            <h1 style="color: #e83e8c;">Unsubscribed Successfully</h1>
            <p>You have been removed from our marketing mailing list.</p>
        </div>`);
    } catch (err) { res.status(500).send("Error unsubscribing."); }
});

// ==========================================
// SALES & CRM MANAGEMENT
// ==========================================
app.get('/api/customers', async (req, res) => {
    try { res.json(await Customer.find().sort({ createdAt: -1 })); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/customers', async (req, res) => {
    try { await new Customer(req.body).save(); res.json({ success: true, message: "Customer Added!" }); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/sales-orders', async (req, res) => {
    try { res.json(await SalesOrder.find().sort({ orderDate: -1 })); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/sales-orders', async (req, res) => {
    try {
        const { customerId, customerName, items, status, createdBy } = req.body;
        let subtotal = 0; const enrichedItems = [];

        for (let item of items) {
            subtotal += (item.quantity * item.unitPrice);
            let product = await Product.findOne({ barcode: item.productCode });

            if (product) {
                if (status === 'CONFIRMED') {
                    if (product.currentStock < item.quantity) return res.status(400).json({ error: `Not enough stock for ${item.productCode}` });
                    product.reservedStock = (product.reservedStock || 0) + item.quantity;
                    await product.save();
                }
                enrichedItems.push({
                    ...item,
                    sector: product.sector || 'N/A', grade: product.grade || 'N/A',
                    length: product.length || 0, af: product.af ? String(product.af) : 'N/A',
                    weightPerPc: product.weightPerPc || 0
                });
            } else {
                enrichedItems.push({ ...item, sector: 'N/A', grade: 'N/A', length: 0, af: 'N/A', weightPerPc: 0 });
            }
        }

        const gstAmount = subtotal * 0.18;
        const grandTotal = subtotal + gstAmount;

        await new SalesOrder({
            orderNo: `SO-${Date.now()}`, customerId, customerName, items: enrichedItems,
            subtotal, gstAmount, grandTotal, status, createdBy
        }).save();

        res.json({ success: true, message: `Order saved as ${status}` });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/sales-orders/:id/status', async (req, res) => {
    try {
        const { status, paymentStatus, username, trackingLink } = req.body;
        const order = await SalesOrder.findById(req.params.id);
        if (!order) return res.status(404).json({ error: "Order not found" });

        const customer = await Customer.findById(order.customerId);

        if (order.status !== 'DISPATCHED' && status === 'DISPATCHED' && order.items && Array.isArray(order.items)) {
            for (let item of order.items) {
                let product = await Product.findOne({ barcode: item.productCode });
                if (product) {
                    product.currentStock -= item.quantity;
                    product.reservedStock = Math.max((product.reservedStock || 0) - item.quantity, 0);
                    await product.save();
                    await new Transaction({
                        barcode: product.barcode, type: 'DISPATCH',
                        quantity: item.quantity, resultingStock: product.currentStock,
                        user: username || 'System'
                    }).save();
                }
            }
        }

        if (status) order.status = status;
        if (paymentStatus) order.paymentStatus = paymentStatus;
        if (trackingLink) order.trackingLink = trackingLink;
        await order.save();

        if (customer && customer.phone) {
            const host = req.get('host');
            const invoiceLink = `${req.protocol}://${host}/api/sales-orders/${order._id}/invoice`;

            let waMessage = "";
            if (status === 'CONFIRMED') {
                waMessage = `*PPL ENTERPRISES - Order Confirmation* 🏭\n\nHello ${customer.name},\nThank you for your order!\n\n*Order No:* ${order.orderNo}\n*Total:* ₹${order.grandTotal.toLocaleString()}\n\n📄 *Download your Tax Invoice here:*\n${invoiceLink}`;
            } else if (status === 'DISPATCHED') {
                waMessage = `*Order Dispatched* 📦\n\nHello ${customer.name},\nYour order *${order.orderNo}* has been packed and dispatched from our facility.`;
            } else if (status === 'SHIPPED') {
                waMessage = `*Order Shipped* 🚚\n\nHello ${customer.name},\nYour order *${order.orderNo}* is on the way!\n\n📍 *Track your consignment here:*\n${trackingLink}`;
            } else if (status === 'DELIVERED') {
                waMessage = `*Order Delivered* ✅\n\nHello ${customer.name},\nYour order *${order.orderNo}* has been delivered successfully. Thank you for choosing PPL!`;
            }

            if (waMessage !== "") {
                sendWhatsAppMessage(customer.phone, waMessage);
            }
        }

        res.json({ success: true, message: "Order updated successfully" });

    } catch (err) {
        console.error("❌ CRITICAL ROUTE CRASH:", err);
        res.status(500).json({ error: err.message });
    }
});

SalesOrder.syncIndexes().then(() => console.log("✅ Ghost indexes cleared from Sales Orders!")).catch(err => console.log(err));

// ==========================================
// PPC ROUTING ENGINE
// ==========================================
app.put('/api/ppc/verify/:id', async (req, res) => {
    try {
        const { status, remarks, nextRoute, username } = req.body;
        const batch = await ProductionBatch.findById(req.params.id);
        if (!batch) return res.status(404).json({ error: "Batch not found" });

        batch.ppcStatus = status; batch.ppcRemarks = remarks; batch.ppcBy = username; batch.ppcDate = new Date();
        if (status === 'APPROVED') { batch.nextProcessRoute = nextRoute; batch.isReadyForNextStage = true; }

        await batch.save();
        res.json({ success: true, message: `Batch ${status} and routed to ${nextRoute || 'Hold'}` });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// QC GATEKEEPER & INVENTORY MOVEMENT
// ==========================================
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
                    product.productionReadied = (product.productionReadied || 0) + finalAccQty;
                    product.wipStock = Math.max((product.wipStock || 0) - (finalAccQty + finalRejQty), 0);
                    await new Transaction({ barcode: product.barcode, type: 'QC_APPROVAL', quantity: finalAccQty, resultingStock: product.currentStock, user: req.body.qcBy || 'QC Inspector' }).save();
                    
                    // --- NEW: WORK ORDER AUTO-CLOSURE LOGIC ---
                    if (batch.workOrderNo && batch.workOrderNo !== 'OTHER') {
                        let wo = await WorkOrder.findOne({ woNumber: batch.workOrderNo });
                        if (wo) {
                            wo.producedQty = (wo.producedQty || 0) + finalAccQty;
                            if (wo.producedQty >= wo.targetQty) wo.status = 'COMPLETED'; // Auto-remove from active
                            await wo.save();
                        }
                    }
                } else if (batch.stage === 'FORGING') {
                    product.wipStock = (product.wipStock || 0) + finalAccQty;
                } else {
                    product.wipStock = Math.max((product.wipStock || 0) - finalRejQty, 0);
                }

                product.lastUpdated = new Date();
                await product.save();
            }
        }

        batch.acceptedQty = finalAccQty; batch.rejectedQty = finalRejQty; batch.rejectionKg = finalRejKg;
        batch.measuredLength = req.body.measuredLength; batch.measuredAF = req.body.measuredAF; batch.threadGauge = req.body.threadGauge;
        batch.qcStatus = incomingStatus; batch.qcBy = req.body.qcBy || 'QC Inspector'; batch.qcDate = new Date(); batch.qcRemarks = req.body.qcRemarks || '';

        await batch.save();
        res.json({ success: true, message: `QC ${incomingStatus} Successfully!` });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// PRODUCTION DEPT
// ==========================================
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

            if (req.body.stage === 'FORGING' && req.body.rawMaterialCode && req.body.rawMaterialConsumedKg) {
                const material = await RawMaterial.findOne({ materialCode: req.body.rawMaterialCode.trim().toUpperCase() });
                if (material) {
                    material.currentStockKg -= Number(req.body.rawMaterialConsumedKg);
                    material.lastUpdate = new Date();
                    await material.save();
                }
            }
            product.lastUpdated = new Date();
            await product.save();
        }

        await new ProductionBatch({
            ...req.body,
            batchNumber: req.body.batchNumber || `BATCH-${Date.now()}`,
            date: req.body.date ? new Date(req.body.date) : new Date(),
            ppcStatus: 'PENDING', qcStatus: 'PENDING'
        }).save();
        res.json({ success: true, message: `Production Logged!` });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/production/batch/:id', async (req, res) => {
    try {
        await ProductionBatch.findByIdAndDelete(req.params.id);
        res.status(200).json({ success: true, message: "Batch deleted successfully" });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ==========================================
// INVENTORY & TRANSACTIONS
// ==========================================
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

        const newProduct = new Product({ ...req.body, barcode, productCode: barcode, wipStock: 0, productionReadied: 0, fgCheck: 0 });
        await newProduct.save();

        if (req.body.currentStock > 0) {
            await new Transaction({ barcode, type: 'INWARD', quantity: req.body.currentStock, resultingStock: req.body.currentStock, user: "Admin" }).save();
        }
        res.json({ success: true, message: "Product Added!" });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.put('/api/inventory/:id', async (req, res) => {
    try { res.status(200).json(await Product.findByIdAndUpdate(req.params.id, { currentStock: req.body.stock }, { new: true })); }
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
        product.fgCheck = readied; // Update FG check to latest
        product.productionReadied = 0; // Reset readied to 0
        product.lastUpdated = new Date();
        
        await product.save();
        await new Transaction({ barcode: product.barcode, type: 'ADJUSTMENT', quantity: diff, resultingStock: product.currentStock, user: req.body.username || 'System' }).save();
        
        res.json({ success: true, message: "Stock Reconciled!" });
    } catch (error) { res.status(500).json({ message: error.message }); }
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

        if (type === 'INWARD') {
            product.fgCheck = (product.fgCheck || 0) + parsedQty;
            product.currentStock = (product.currentStock || 0) + parsedQty;
        } else if (type === 'DISPATCH') {
            product.currentStock = Math.max((product.currentStock || 0) - parsedQty, 0);
        }

        product.lastUpdated = new Date();
        await product.save();

        await new Transaction({ barcode: product.barcode, type: type, quantity: parsedQty, resultingStock: product.currentStock, user: username || 'App Scanner' }).save();
        res.json({ success: true, newStock: product.currentStock });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// PURCHASE & RAW MATERIALS
// ==========================================
app.get('/api/raw-materials', async (req, res) => {
    try { res.json(await RawMaterial.find().sort({ lastUpdate: -1 })); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/raw-materials/receive', async (req, res) => {
    try {
        const { materialCode, materialName, grade, supplier, scope, addedKg, username } = req.body;
        let material = await RawMaterial.findOne({ materialCode });

        if (!material) {
            material = new RawMaterial({ materialCode, materialName: materialName || "Carbon Steel", grade, lastSupplier: supplier, scope, currentStockKg: addedKg, lastUpdatedBy: username || 'Purchase Dept', lastUpdate: new Date() });
        } else {
            material.currentStockKg += Number(addedKg);
            if (grade) material.grade = grade;
            if (supplier) material.lastSupplier = supplier;
            if (scope) material.scope = scope;
            material.lastUpdatedBy = username || 'Purchase Dept';
            material.lastUpdate = new Date();
            if (materialName && materialName.trim() !== "") material.materialName = materialName.trim();
        }
        await material.save();
        await new Transaction({ barcode: `[RAW] ${materialCode}`, type: 'INWARD', quantity: addedKg, resultingStock: material.currentStockKg, user: username || 'Purchase Dept' }).save();
        res.json({ success: true, message: "Raw material updated", stock: material.currentStockKg });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/purchase-orders', async (req, res) => {
    try { 
        const pos = await PurchaseOrder.find().sort({ orderDate: -1, _id: -1 });
        res.json(pos);
    } catch (err) { 
        console.error("GET /api/purchase-orders ERROR:", err);
        res.status(500).json({ error: err.message }); 
    }
});

app.post('/api/purchase-orders', async (req, res) => {
    try {
        const { poNumber, supplierName, materialCode, grade, scope, expectedKg, costPerKg, username, type, expectedDeliveryDate } = req.body;
        
        // Create a safe payload, only including fields that actually exist
        const newPO = new PurchaseOrder({
            poNumber: poNumber || `PO-${Date.now()}`,
            supplierName: supplierName || "Unknown Supplier",
            materialCode: materialCode ? materialCode.toUpperCase() : "UNKNOWN",
            grade: grade || "Standard",
            scope: scope || "General Inventory",
            expectedKg: Number(expectedKg) || 0,
            costPerKg: Number(costPerKg) || 0,
            totalCost: (Number(expectedKg) || 0) * (Number(costPerKg) || 0),
            orderedBy: username || "Purchase Dept",
            status: 'PENDING',
            orderDate: new Date()
        });

        // Add these fields only if your schema supports them to prevent crashes
        if (type) newPO.type = type;
        if (expectedDeliveryDate) newPO.expectedDeliveryDate = new Date(expectedDeliveryDate);

        await newPO.save();
        res.json({ success: true, message: "PO Created Successfully!" });
    } catch (err) { 
        console.error("POST /api/purchase-orders ERROR:", err);
        res.status(500).json({ error: err.message }); 
    }
});


app.put('/api/purchase-orders/:id/receive', async (req, res) => {
    try {
        const { username } = req.body;
        const po = await PurchaseOrder.findById(req.params.id);
        if (!po || po.status === 'RECEIVED') return res.status(400).json({ message: "Invalid PO" });

        po.status = 'RECEIVED'; po.receivedDate = new Date(); await po.save();

        let material = await RawMaterial.findOne({ materialCode: po.materialCode });
        if (!material) {
            material = new RawMaterial({ materialCode: po.materialCode, materialName: "Steel Stock", grade: po.grade, lastSupplier: po.supplierName, currentStockKg: po.expectedKg, lastUpdatedBy: username || "Purchase Dept", lastUpdate: new Date() });
        } else {
            material.currentStockKg += po.expectedKg; material.grade = po.grade; material.lastSupplier = po.supplierName; material.lastUpdatedBy = username || "Purchase Dept"; material.lastUpdate = new Date();
        }
        await material.save();

        await new Transaction({ barcode: `[GRN] ${po.poNumber} (${po.materialCode})`, type: 'INWARD', quantity: po.expectedKg, resultingStock: material.currentStockKg, user: username || "Purchase Dept" }).save();
        res.json({ success: true, message: "Stock Received & Added to Inventory!" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});


app.put('/api/purchase-orders/:id/status', async (req, res) => {
    try {
        const { status, username } = req.body;
        const po = await PurchaseOrder.findById(req.params.id);
        
        if (!po) return res.status(404).json({ error: "PO not found" });
        
        po.status = status;
        if (status === 'RECEIVED') po.receivedDate = new Date();
        
        await po.save();
        res.json({ success: true, message: "PO Status Updated" });
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});
// ==========================================
// WORK ORDERS (WO) MANAGEMENT & PPC TRACKING
// ==========================================
app.get('/api/work-orders/active', async (req, res) => {
    try { res.json(await WorkOrder.find({ status: 'ACTIVE' }).sort({ createdAt: -1 })); }
    catch (err) { res.status(500).json({ error: err.message }); }
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

        // Add the new update, marked as unread for the admin
        const updateData = { ...req.body, readByAdmin: false }; 
        const existingIndex = wo.history.findIndex(h => h.DATE === updateData.DATE);
        
        if (existingIndex >= 0) wo.history[existingIndex] = updateData;
        else wo.history.push(updateData);

        await wo.save();
        res.json({ success: true, message: "Daily log updated!" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// NEW: Get unread count for Admin Badge
app.get('/api/work-orders/unread-count', async (req, res) => {
    try {
        const wos = await WorkOrder.find({ "history.readByAdmin": false });
        let count = 0;
        wos.forEach(wo => count += wo.history.filter(h => !h.readByAdmin).length);
        res.json({ count });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// NEW: Mark all updates as read when Admin opens the tab
app.put('/api/work-orders/mark-read', async (req, res) => {
    try {
        const wos = await WorkOrder.find({ "history.readByAdmin": false });
        for (let wo of wos) {
            wo.history.forEach(h => h.readByAdmin = true);
            await wo.save();
        }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});
// ==========================================
// NEW: TOOL ROOM & QA SYNC ENDPOINTS
// ==========================================
app.get('/api/sync', async (req, res) => {
    try {
        let doc = await ErpState.findOne({ identifier: "production_state" });
        if (!doc) {
            doc = await ErpState.create({ identifier: "production_state", state: {} });
        }
        res.json(doc);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/sync', async (req, res) => {
    try {
        const updatedDoc = await ErpState.findOneAndUpdate(
            { identifier: "production_state" },
            { state: req.body },
            { upsert: true, returnDocument: 'after' }
        );
        res.json({ success: true, message: "Successfully synced to MongoDB" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});


// ==========================================
// FRONTEND ROUTES
// ==========================================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/toolroom.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'toolroom.html'));
});



// ==========================================
        // PPC / WORK ORDER & REPORTS MODULE
        // ==========================================
        let allWoHistory = [];

        function switchPPCTab(tab) {
            // Hide all PPC sections
            document.getElementById('ppcCreateSection').style.display = tab === 'create' ? 'block' : 'none';
            document.getElementById('ppcActiveSection').style.display = tab === 'active' ? 'block' : 'none';
            document.getElementById('ppcUpdateSection').style.display = tab === 'update' ? 'block' : 'none';

            // Reset all PPC tab button styles
            ['create', 'active', 'update'].forEach(t => {
                const btn = document.getElementById('tab-ppc-' + t);
                if (btn) {
                    btn.classList.remove('active');
                    btn.style.background = '#eee';
                    btn.style.color = '#555';
                }
            });

            // Style the active button
            const activeBtn = document.getElementById('tab-ppc-' + tab);
            if (activeBtn) {
                activeBtn.classList.add('active');
                activeBtn.style.color = 'white';
                if(tab === 'create') activeBtn.style.background = '#e83e8c';
                if(tab === 'active') activeBtn.style.background = '#28a745';
                if(tab === 'update') activeBtn.style.background = '#17a2b8';
            }

            // If switching to update or active tab, refresh the data
            if (tab === 'update' || tab === 'active') {
                document.getElementById('upd_date').value = new Date().toISOString().split('T')[0];
                if (typeof loadActiveWorkOrders === 'function') {
                    loadActiveWorkOrders(); 
                }
            }
        }
// ==========================================
// SERVER LISTEN
// ==========================================
app.listen(process.env.PORT || 5000, () => console.log(`🚀 ERP Server Running on port ${process.env.PORT || 5000}`));