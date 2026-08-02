import express from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { getDbClient } from '../db/database.js';
import { authenticateAdmin } from '../middleware/auth.js';

const router = express.Router();
const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } });

// GET /api/items (Public: Search & filter items with live stock status)
router.get('/', async (req, res) => {
  try {
    const { search, category } = req.query;
    const db = getDbClient();

    let query = `SELECT * FROM items WHERE 1=1`;
    const params = [];
    let paramIndex = 1;

    if (search) {
      query += ` AND (name ILIKE $${paramIndex} OR description ILIKE $${paramIndex + 1})`;
      params.push(`%${search}%`, `%${search}%`);
      paramIndex += 2;
    }

    if (category && category !== 'All') {
      query += ` AND category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    query += ` ORDER BY name ASC`;

    const items = await db.all(query, params);

    // Map items with auto-derived status
    const itemsWithStatus = items.map(item => ({
      ...item,
      status: item.available_qty > 0 ? 'In Stock' : 'Out of Stock'
    }));

    return res.json(itemsWithStatus);
  } catch (error) {
    console.error('Error fetching items:', error);
    return res.status(500).json({ error: 'Failed to retrieve items.' });
  }
});

// GET /api/items/categories (Public: List unique categories)
router.get('/categories', async (req, res) => {
  try {
    const db = getDbClient();
    const categories = await db.all('SELECT DISTINCT category FROM items ORDER BY category ASC');
    return res.json(categories.map(c => c.category));
  } catch (error) {
    console.error('Error fetching categories:', error);
    return res.status(500).json({ error: 'Failed to retrieve categories.' });
  }
});

// GET /api/items/sample-template (Admin required: Download sample inventory Excel template)
router.get('/sample-template', authenticateAdmin, (req, res) => {
  try {
    const wb = XLSX.utils.book_new();
    const sampleData = [
      {
        'Component Name': 'Arduino Uno R3',
        'Category': 'Microcontrollers',
        'Quantity': 10,
        'Description': 'ATmega328P microcontroller board with USB interface'
      },
      {
        'Component Name': 'HC-SR04 Ultrasonic Sensor',
        'Category': 'Sensors',
        'Quantity': 15,
        'Description': 'Ultrasonic distance measuring sensor 2cm-400cm'
      },
      {
        'Component Name': 'SG90 Micro Servo Motor',
        'Category': 'Actuators & Modules',
        'Quantity': 8,
        'Description': '9g micro servo motor 1.8kg/cm torque'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(sampleData);
    ws['!cols'] = [
      { wch: 28 }, // Component Name
      { wch: 22 }, // Category
      { wch: 12 }, // Quantity
      { wch: 45 }  // Description
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Inventory Items');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="IEEE_Inventory_Import_Template.xlsx"');
    return res.send(buffer);
  } catch (error) {
    console.error('[ItemRoutes] Error generating sample Excel template:', error);
    return res.status(500).json({ error: 'Failed to generate sample inventory template.' });
  }
});

// POST /api/items/bulk-import (Admin only: Upload & parse Excel/CSV for bulk inventory import/update)
router.post('/bulk-import', authenticateAdmin, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No Excel or CSV file uploaded.' });
    }

    const filename = req.file.originalname || '';
    const ext = filename.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext)) {
      return res.status(400).json({ error: `Unsupported file format ".${ext}". Please upload a .xlsx, .xls, or .csv file.` });
    }

    let workbook;
    try {
      workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    } catch (parseErr) {
      return res.status(400).json({ error: 'Failed to parse Excel file. File may be corrupt or unreadable.' });
    }

    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return res.status(400).json({ error: 'Uploaded file contains no worksheets.' });
    }

    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (!rows || rows.length === 0) {
      return res.status(400).json({ error: 'Uploaded file contains no data rows.' });
    }

    console.log(`[ItemRoutes] 📊 Processing bulk inventory import "${filename}" with ${rows.length} row(s)...`);

    const db = getDbClient();
    const details = [];

    let addedCount = 0;
    let updatedCount = 0;
    let failedCount = 0;

    // Use transaction helper for atomicity
    await db.transaction(async (client) => {
      for (let index = 0; index < rows.length; index++) {
        const row = rows[index];
        const rowNum = index + 2; // Row 1 is header

        const name = String(
          row['Component Name'] || row['Name'] || row['Item Name'] || row['name'] || ''
        ).trim();

        const category = String(
          row['Category'] || row['category'] || 'General'
        ).trim() || 'General';

        const description = String(
          row['Description'] || row['description'] || ''
        ).trim();

        const rawQty = row['Quantity'] !== undefined && row['Quantity'] !== ''
          ? row['Quantity']
          : (row['Total Quantity'] !== undefined && row['Total Quantity'] !== '' ? row['Total Quantity'] : row['total_qty']);

        // Validation 1: Required component name
        if (!name) {
          failedCount++;
          details.push({
            row_number: rowNum,
            item_name: 'N/A',
            action: 'failed',
            reason: 'Missing required field: Component Name'
          });
          continue;
        }

        // Validation 2: Quantity must be valid non-negative integer
        const qtyNum = parseInt(rawQty, 10);
        if (rawQty === undefined || rawQty === null || rawQty === '' || isNaN(qtyNum) || qtyNum < 0) {
          failedCount++;
          details.push({
            row_number: rowNum,
            item_name: name,
            action: 'failed',
            reason: `Invalid quantity "${rawQty}": must be a non-negative integer`
          });
          continue;
        }

        // Check if item already exists (PostgreSQL: use ILIKE for case-insensitive match)
        const existingRes = await client.query(
          `SELECT id, total_qty, available_qty FROM items WHERE LOWER(name) = LOWER($1)`,
          [name]
        );
        const existingItem = existingRes.rows[0] || null;

        if (existingItem) {
          // Duplicate found → Update stock (add to existing stock)
          await client.query(
            `UPDATE items SET total_qty = total_qty + $1, available_qty = available_qty + $2 WHERE id = $3`,
            [qtyNum, qtyNum, existingItem.id]
          );
          updatedCount++;
          details.push({
            row_number: rowNum,
            item_name: name,
            action: 'updated',
            qty_added: qtyNum,
            reason: `Stock increased by +${qtyNum} units (new total: ${existingItem.total_qty + qtyNum})`
          });
        } else {
          // New item → Insert
          await client.query(
            `INSERT INTO items (name, description, category, total_qty, available_qty) VALUES ($1, $2, $3, $4, $5)`,
            [name, description, category, qtyNum, qtyNum]
          );
          addedCount++;
          details.push({
            row_number: rowNum,
            item_name: name,
            action: 'added',
            qty_added: qtyNum,
            reason: `New inventory item created with ${qtyNum} unit(s)`
          });
        }
      }
    });

    const messageParts = [];
    if (addedCount > 0) messageParts.push(`${addedCount} new item(s) added`);
    if (updatedCount > 0) messageParts.push(`${updatedCount} existing item(s) updated (stock increased)`);
    if (failedCount > 0) messageParts.push(`${failedCount} row(s) failed validation`);

    const summaryMessage = messageParts.length > 0
      ? messageParts.join(', ') + '.'
      : 'No valid rows to process.';

    return res.status(200).json({
      message: summaryMessage,
      summary: {
        total_rows: rows.length,
        added: addedCount,
        updated: updatedCount,
        failed: failedCount
      },
      details
    });
  } catch (error) {
    console.error('[ItemRoutes] ❌ Error processing bulk inventory import:', error);
    return res.status(500).json({ error: error.message || 'Failed to import inventory items.' });
  }
});

// GET /api/items/:id (Public: Get single item)
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = getDbClient();

    const item = await db.get('SELECT * FROM items WHERE id = $1', [id]);
    if (!item) {
      return res.status(404).json({ error: 'Item not found.' });
    }

    const itemWithStatus = {
      ...item,
      status: item.available_qty > 0 ? 'In Stock' : 'Out of Stock'
    };

    return res.json(itemWithStatus);
  } catch (error) {
    console.error('Error fetching item details:', error);
    return res.status(500).json({ error: 'Failed to retrieve item details.' });
  }
});

// POST /api/items (Admin only: Add new item)
router.post('/', authenticateAdmin, async (req, res) => {
  try {
    const { name, description, category, total_qty } = req.body;

    if (!name || !category || total_qty === undefined || total_qty === null) {
      return res.status(400).json({ error: 'Name, Category, and Total Quantity are required.' });
    }

    const totalQtyNum = parseInt(total_qty, 10);
    if (isNaN(totalQtyNum) || totalQtyNum < 0) {
      return res.status(400).json({ error: 'Total quantity must be a non-negative integer.' });
    }

    const db = getDbClient();
    // PostgreSQL: use RETURNING id to get the inserted row's ID
    const result = await db.run(
      `INSERT INTO items (name, description, category, total_qty, available_qty) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [name.trim(), description ? description.trim() : '', category.trim(), totalQtyNum, totalQtyNum]
    );

    const newItem = await db.get('SELECT * FROM items WHERE id = $1', [result.lastID]);
    return res.status(201).json({
      message: 'Inventory item added successfully.',
      item: { ...newItem, status: newItem.available_qty > 0 ? 'In Stock' : 'Out of Stock' }
    });
  } catch (error) {
    console.error('Error creating item:', error);
    return res.status(500).json({ error: 'Failed to create inventory item.' });
  }
});

// PUT /api/items/:id (Admin only: Edit item details)
router.put('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, category, total_qty } = req.body;

    if (!name || !category || total_qty === undefined || total_qty === null) {
      return res.status(400).json({ error: 'Name, Category, and Total Quantity are required.' });
    }

    const newTotal = parseInt(total_qty, 10);
    if (isNaN(newTotal) || newTotal < 0) {
      return res.status(400).json({ error: 'Total quantity must be a non-negative integer.' });
    }

    const db = getDbClient();
    const existing = await db.get('SELECT * FROM items WHERE id = $1', [id]);
    if (!existing) {
      return res.status(404).json({ error: 'Item not found.' });
    }

    // Calculate how many items are currently rented out
    const currentlyRented = existing.total_qty - existing.available_qty;

    if (newTotal < currentlyRented) {
      return res.status(400).json({
        error: `Cannot reduce total quantity to ${newTotal} because ${currentlyRented} units are currently rented out by members.`
      });
    }

    // Recalculate available_qty
    const newAvailable = newTotal - currentlyRented;

    await db.run(
      `UPDATE items SET name = $1, description = $2, category = $3, total_qty = $4, available_qty = $5 WHERE id = $6`,
      [name.trim(), description ? description.trim() : '', category.trim(), newTotal, newAvailable, id]
    );

    const updatedItem = await db.get('SELECT * FROM items WHERE id = $1', [id]);
    return res.json({
      message: 'Item updated successfully.',
      item: { ...updatedItem, status: updatedItem.available_qty > 0 ? 'In Stock' : 'Out of Stock' }
    });
  } catch (error) {
    console.error('Error updating item:', error);
    return res.status(500).json({ error: 'Failed to update item.' });
  }
});

// DELETE /api/items/:id (Admin only: Delete item if not currently rented out)
router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const db = getDbClient();

    const item = await db.get('SELECT * FROM items WHERE id = $1', [id]);
    if (!item) {
      return res.status(404).json({ error: 'Item not found.' });
    }

    // Check if item has unreturned active rentals
    const activeRental = await db.get(
      `SELECT id FROM rentals WHERE item_id = $1 AND date_returned IS NULL`,
      [id]
    );

    if (activeRental) {
      return res.status(400).json({
        error: `Cannot delete item "${item.name}" because it is currently rented out to a member.`
      });
    }

    await db.run('DELETE FROM items WHERE id = $1', [id]);
    return res.json({ message: `Item "${item.name}" deleted successfully.` });
  } catch (error) {
    console.error('Error deleting item:', error);
    return res.status(500).json({ error: 'Failed to delete item.' });
  }
});

export default router;
