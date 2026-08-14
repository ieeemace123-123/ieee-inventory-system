import test from 'node:test';
import assert from 'node:assert/strict';
import { renewRentalWithConfirmedEmail } from '../src/routes/rentalRoutes.js';

const activeRental = {
  id: 12,
  return_due_date: '2026-08-20',
  date_returned: null,
  status: 'Active',
  item_name: 'Arduino Uno',
  member_name: 'Test Member',
  membership_id: 'IEEE-TEST',
  member_email: 'member@example.com'
};

function createDb(rental = activeRental) {
  const events = [];
  const client = {
    async query(sql, params) {
      if (sql.includes('SELECT r.id')) {
        events.push('lock');
        return { rows: rental ? [rental] : [] };
      }
      if (sql.includes('UPDATE rentals')) events.push(['update', params]);
      if (sql.includes('INSERT INTO rental_renewals')) events.push(['history', params]);
      return { rows: [], rowCount: 1 };
    }
  };
  return {
    events,
    db: { transaction: callback => callback(client) }
  };
}

test('sends the renewal email before committing the new due date', async () => {
  const { db, events } = createDb();
  const sendEmail = async payload => {
    events.push(['email', payload]);
    return { success: true, accepted: true, messageId: 'smtp-message-1' };
  };

  const result = await renewRentalWithConfirmedEmail({
    db,
    id: 12,
    returnDueDate: '2026-08-27',
    adminUsername: 'admin',
    sendEmail
  });

  assert.equal(result.previousDueDate, '2026-08-20');
  assert.deepEqual(events.map(event => Array.isArray(event) ? event[0] : event), ['lock', 'email', 'update', 'history']);
  assert.equal(events[1][1].newDueDate, '2026-08-27');
  assert.equal(events[2][1][0], '2026-08-27');
  assert.equal(events[3][1][4], 'smtp-message-1');
});

test('does not change the due date when email delivery is rejected', async () => {
  const { db, events } = createDb();
  const sendEmail = async () => {
    events.push('email');
    return { success: false, error: 'SMTP rejected recipient' };
  };

  await assert.rejects(
    renewRentalWithConfirmedEmail({ db, id: 12, returnDueDate: '2026-08-27', sendEmail }),
    error => error.statusCode === 502 && error.message.includes('due date was not changed')
  );
  assert.deepEqual(events, ['lock', 'email']);
});

test('rejects returned rentals before sending an email', async () => {
  const { db, events } = createDb({ ...activeRental, status: 'Returned', date_returned: '2026-08-18' });
  let emailCalled = false;

  await assert.rejects(
    renewRentalWithConfirmedEmail({
      db,
      id: 12,
      returnDueDate: '2026-08-27',
      sendEmail: async () => { emailCalled = true; return { success: true }; }
    }),
    error => error.statusCode === 400 && error.message.includes('returned rental')
  );
  assert.equal(emailCalled, false);
  assert.deepEqual(events, ['lock']);
});

test('rejects dates that do not extend the current deadline', async () => {
  const { db, events } = createDb();
  await assert.rejects(
    renewRentalWithConfirmedEmail({ db, id: 12, returnDueDate: '2026-08-20', sendEmail: async () => ({ success: true }) }),
    error => error.statusCode === 400 && error.message.includes('after the current due date')
  );
  assert.deepEqual(events, ['lock']);
});
