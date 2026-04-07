require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const csv = require('csv-parser');

// Import your database models
const { Customer } = require('./models');

// Make sure this matches the exact name of your CSV file!
const CSV_FILE_PATH = 'CUSTOMERS ADDRESS.xlsx - Sheet1 (2).csv'; 

async function importData() {
    try {
        // 1. Connect to MongoDB
        console.log("⏳ Connecting to Database...");
        await mongoose.connect(process.env.MONGO_URI);
        console.log("✅ Database Connected!");

        const customersToInsert = [];

        // 2. Read and Parse the CSV File
        console.log("⏳ Reading CSV File...");
        fs.createReadStream(CSV_FILE_PATH)
            .pipe(csv({ skipLines: 1 }))
            .on('data', (row) => {
                // Skip completely empty rows
                if (!row['CUSTOMERS NAME']) return;

                // Map the CSV columns exactly to your Database Schema
                customersToInsert.push({
                    name: row['CUSTOMERS NAME'].trim(),
                    sector: row['SECTOR'] ? row['SECTOR'].trim() : '',
                    transportMode: row['TRANSOPORT MODE/PAY BASIS'] ? row['TRANSOPORT MODE/PAY BASIS'].trim() : '',
                    address: row['ADDRESS '] ? row['ADDRESS '].trim() : '', // Notice the space if your CSV header has one
                    email: row['EMAIL'] ? row['EMAIL'].trim() : '',
                    phone: row['PHONE NO'] ? row['PHONE NO'].trim() : '',
                    area: row['AREA'] ? row['AREA'].trim() : '',
                    pinCode: row['PIN CODE'] ? row['PIN CODE'].trim() : '',
                    state: row['STATE'] ? row['STATE'].trim() : '',
                    zone: row['ZONE'] ? row['ZONE'].trim() : '',
                    
                    // We can default the CRM 'type' based on the sector, or just leave it as DEALER
                    type: row['SECTOR'] && row['SECTOR'].includes('OEM') ? 'BULK_BUYER' : 'DEALER'
                });
            })
            .on('end', async () => {
                console.log(`✅ Successfully parsed ${customersToInsert.length} customers from the file.`);
                
                // 3. Bulk Insert into MongoDB
                try {
                    console.log("⏳ Uploading to MongoDB. Please wait...");
                    await Customer.insertMany(customersToInsert);
                    console.log("🎉 SUCCESS! All customers have been added to your CRM.");
                } catch (dbError) {
                    console.error("❌ Error saving to database:", dbError.message);
                } finally {
                    // Close the database connection when done
                    mongoose.connection.close();
                    process.exit();
                }
            });

    } catch (error) {
        console.error("❌ Fatal Error:", error.message);
        process.exit(1);
    }
}

// Run the function
importData();