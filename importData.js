const mongoose = require('mongoose');
const ExcelJS = require('exceljs');
require('dotenv').config();

// We import the Product model from our newly updated models.js
const { Product } = require('./models');

// Helper to safely read Excel cells
function getActualValue(cell) {
    if (!cell || cell.value === null || cell.value === undefined) return "";
    if (typeof cell.value === 'object') {
        return cell.value.result !== undefined ? cell.value.result : 0;
    }
    return cell.value;
}

function getNumberValue(cell) {
    let val = getActualValue(cell);
    let num = Number(val);
    return isNaN(num) ? 0 : num;
}

function getStringValue(cell) {
    let val = getActualValue(cell);
    return String(val).trim();
}

async function runImport() {
    try {
        // 1. Connect to Database
        await mongoose.connect(process.env.MONGO_URI);
        console.log("🟢 Connected to database. Reading Excel file...");

        const workbook = new ExcelJS.Workbook();
        
        // Ensure you have your 'inventory.xlsx' in the same folder!
        await workbook.xlsx.readFile('inventory.xlsx'); 
        const sheet = workbook.getWorksheet(1);
        const productsToSave = [];

        // 2. Loop through every row in the Excel sheet
        sheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return; // Skip the Header row

            let scanCode = getStringValue(row.getCell(2)); 

            if (scanCode && scanCode !== "0" && scanCode !== "") {
                // Remove any weird asterisks from barcode scanners
                scanCode = scanCode.replace(/\*/g, '').trim();

                // Build the bulk update operation
                productsToSave.push({
                    updateOne: {
                        filter: { barcode: scanCode }, // Check if product already exists
                        update: {
                            $set: {
                                // Maps exactly to your NEW ERP schema in models.js
                                barcode: scanCode, 
                                productCode: getStringValue(row.getCell(2)), 
                                sector: getStringValue(row.getCell(3)),      
                                type: getStringValue(row.getCell(4)),
                                length: getNumberValue(row.getCell(6)),
                                af: getNumberValue(row.getCell(7)),
                                grade: getStringValue(row.getCell(8)),
                                weightPerPc: getNumberValue(row.getCell(9)),
                                currentStock: getNumberValue(row.getCell(15))
                            }
                        },
                        upsert: true // If it doesn't exist, create it. If it does, update it!
                    }
                });
            }
        });

        // 3. Save to MongoDB
        if (productsToSave.length > 0) {
            console.log(`📦 Found ${productsToSave.length} valid products. Uploading to ERP...`);
            await Product.bulkWrite(productsToSave);
            console.log(`✅ Success! Imported all products perfectly.`);
        } else {
            console.log("⚠️ No valid products found in the Excel sheet.");
        }
        
        process.exit();
    } catch (error) {
        console.error("❌ Something went wrong:", error);
        process.exit(1);
    }
}

// Run the function
runImport();