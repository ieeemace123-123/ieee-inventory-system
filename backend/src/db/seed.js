import bcrypt from 'bcryptjs';
import { getDbClient, initDb } from './database.js';
import { fileURLToPath } from 'url';
import path from 'path';

export async function seedDatabase() {
  await initDb();
  const db = getDbClient();

  // 1. Seed Admin
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    throw new Error('[Seed] ADMIN_PASSWORD environment variable is not set. Set it in your .env file before seeding.');
  }

  const existingAdmin = await db.get('SELECT * FROM admins WHERE username = $1', [adminUsername]);
  if (!existingAdmin) {
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(adminPassword, salt);
    await db.run('INSERT INTO admins (username, password_hash) VALUES ($1, $2)', [adminUsername, passwordHash]);
    console.log(`[Seed] Admin user created: ${adminUsername}`);
  }

  // 2. Seed Members if empty or update sample member statuses
  const sampleMembers = [
    { membership_id: 'IEEE-1001', name: 'Alex Johnson', email: 'alex.j@university.edu', phone: '+1-555-0192', department: 'Electrical Engineering', status: 'active' },
    { membership_id: 'IEEE-1002', name: 'Priya Sharma', email: 'priya.s@university.edu', phone: '+1-555-0143', department: 'Computer Science', status: 'active' },
    { membership_id: 'IEEE-1003', name: 'Marcus Chen', email: 'marcus.c@university.edu', phone: '+1-555-0188', department: 'Robotics & Automation', status: 'active' },
    { membership_id: 'IEEE-1004', name: 'Sophia Martinez', email: 'sophia.m@university.edu', phone: '+1-555-0162', department: 'Electronics & Comm.', status: 'active' },
    { membership_id: 'IEEE-1005', name: 'David Kim', email: 'david.k@university.edu', phone: '+1-555-0111', department: 'Biomedical Engineering', status: 'inactive' }
  ];

  // PostgreSQL: COUNT(*) returns a string, cast to integer
  const memberCountRow = await db.get('SELECT COUNT(*) as count FROM members');
  const memberCount = parseInt(memberCountRow.count, 10);

  if (memberCount === 0) {
    for (const m of sampleMembers) {
      await db.run(
        'INSERT INTO members (membership_id, name, email, phone, department, status, is_deleted) VALUES ($1, $2, $3, $4, $5, $6, 0)',
        [m.membership_id, m.name, m.email, m.phone, m.department, m.status || 'active']
      );
    }
    console.log('[Seed] Sample members inserted.');
  } else {
    // Ensure sample member statuses are properly set for testing
    for (const m of sampleMembers) {
      const existing = await db.get('SELECT id FROM members WHERE membership_id = $1', [m.membership_id]);
      if (existing) {
        await db.run('UPDATE members SET status = $1, is_deleted = 0 WHERE id = $2', [m.status, existing.id]);
      }
    }
  }

  // 3. Seed Items if empty
  const itemCountRow = await db.get('SELECT COUNT(*) as count FROM items');
  const itemCount = parseInt(itemCountRow.count, 10);

  if (itemCount === 0) {
    const sampleItems = [
      { name: 'Raspberry Pi 4 Model B (4GB)', description: 'Single-board computer with 1.5GHz quad-core CPU and dual micro-HDMI.', category: 'Microcontrollers', total_qty: 8, available_qty: 6 },
      { name: 'Arduino Uno Rev3', description: 'ATmega328P microcontroller board with 14 digital I/O pins and 6 analog inputs.', category: 'Microcontrollers', total_qty: 15, available_qty: 12 },
      { name: 'Digital Storage Oscilloscope 100MHz', description: 'Dual-channel portable oscilloscope with 1GSa/s real-time sample rate.', category: 'Testing Instruments', total_qty: 3, available_qty: 2 },
      { name: 'ESP32 Wi-Fi + BLE Dev Module', description: 'Dual-core microcontroller with integrated Wi-Fi, Bluetooth 4.2, and capacitive touch sensors.', category: 'Microcontrollers', total_qty: 20, available_qty: 20 },
      { name: 'Digital Multimeter Auto-Ranging', description: 'True RMS digital multimeter for AC/DC current, voltage, resistance, and capacitance testing.', category: 'Testing Instruments', total_qty: 10, available_qty: 7 },
      { name: 'Soldering Station 60W Adjustable', description: 'Temperature-controlled ESD-safe soldering station with iron stand and brass tip cleaner.', category: 'Tools', total_qty: 5, available_qty: 0 },
      { name: 'HC-SR04 Ultrasonic Distance Sensor', description: 'Ultrasonic range detector module (2cm to 400cm range).', category: 'Sensors', total_qty: 25, available_qty: 23 },
      { name: '5V 4-Channel Relay Module', description: 'Optocoupler isolated relay output board suitable for Arduino and Raspberry Pi projects.', category: 'Actuators & Modules', total_qty: 12, available_qty: 12 }
    ];

    for (const item of sampleItems) {
      await db.run(
        'INSERT INTO items (name, description, category, total_qty, available_qty) VALUES ($1, $2, $3, $4, $5)',
        [item.name, item.description, item.category, item.total_qty, item.available_qty]
      );
    }
    console.log('[Seed] Sample items inserted.');
  }

  // 4. Seed Rentals if empty
  const rentalCountRow = await db.get('SELECT COUNT(*) as count FROM rentals');
  const rentalCount = parseInt(rentalCountRow.count, 10);

  if (rentalCount === 0) {
    const today = new Date();
    
    // Past due date for testing overdue system
    const pastDueDate = new Date(today);
    pastDueDate.setDate(pastDueDate.getDate() - 3);

    // Active future due date
    const futureDueDate = new Date(today);
    futureDueDate.setDate(futureDueDate.getDate() + 7);

    // Returned past date
    const takenPastDate = new Date(today);
    takenPastDate.setDate(takenPastDate.getDate() - 10);
    const returnedPastDate = new Date(today);
    returnedPastDate.setDate(returnedPastDate.getDate() - 2);

    const m1 = await db.get("SELECT id FROM members WHERE membership_id = 'IEEE-1001'");
    const m2 = await db.get("SELECT id FROM members WHERE membership_id = 'IEEE-1002'");
    const m3 = await db.get("SELECT id FROM members WHERE membership_id = 'IEEE-1003'");
    
    const i1 = await db.get("SELECT id FROM items WHERE name LIKE '%Raspberry Pi%'");
    const i2 = await db.get("SELECT id FROM items WHERE name LIKE '%Oscilloscope%'");
    const i3 = await db.get("SELECT id FROM items WHERE name LIKE '%Soldering Station%'");

    if (m1 && i1) {
      await db.run(
        `INSERT INTO rentals (item_id, member_id, quantity, date_taken, return_due_date, date_returned, status)
         VALUES ($1, $2, 1, $3, $4, NULL, 'Active')`,
        [i1.id, m1.id, today.toISOString().split('T')[0], futureDueDate.toISOString().split('T')[0]]
      );
    }

    if (m2 && i3) {
      await db.run(
        `INSERT INTO rentals (item_id, member_id, quantity, date_taken, return_due_date, date_returned, status)
         VALUES ($1, $2, 1, $3, $4, NULL, 'Overdue')`,
        [i3.id, m2.id, pastDueDate.toISOString().split('T')[0], pastDueDate.toISOString().split('T')[0]]
      );
    }

    if (m3 && i2) {
      await db.run(
        `INSERT INTO rentals (item_id, member_id, quantity, date_taken, return_due_date, date_returned, status)
         VALUES ($1, $2, 1, $3, $4, $5, 'Returned')`,
        [i2.id, m3.id, takenPastDate.toISOString().split('T')[0], returnedPastDate.toISOString().split('T')[0], returnedPastDate.toISOString().split('T')[0]]
      );
    }

    console.log('[Seed] Sample rentals inserted.');
  }

  console.log('[Seed] Seeding completed.');
}

const isDirectExecution = process.argv[1] && path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);

if (isDirectExecution) {
  seedDatabase().catch(err => {
    console.error('Seed error:', err);
    process.exit(1);
  });
}
