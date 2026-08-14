import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { ClipboardList, Plus, Search, RotateCcw, User, Mail, Phone, AlertTriangle, CheckCircle2, Clock, Info, Send, Trash2, AlertCircle, ExternalLink, CalendarPlus, X } from 'lucide-react';
import toast from 'react-hot-toast';

export default function RentalManager() {
  const [rentals, setRentals] = useState([]);
  const [items, setItems] = useState([]);
  const [statusFilter, setStatusFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // ── Create Rental Modal State ───────────────────────────────────────────────
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Borrower contact fields (all required)
  const [borrowerName, setBorrowerName]   = useState('');
  const [borrowerEmail, setBorrowerEmail] = useState('');
  const [borrowerPhone, setBorrowerPhone] = useState('');
  const [borrowerClass, setBorrowerClass] = useState('');
  const [borrowerDepartment, setBorrowerDepartment] = useState('');
  const [memberSuggestions, setMemberSuggestions] = useState([]);
  const [selectedMemberId, setSelectedMemberId] = useState(null);

  // IEEE Membership ID — stored as-is, no verification
  const [membershipIdInput, setMembershipIdInput] = useState('');

  // Email soft domain-typo warning (non-blocking)
  const [emailDomainWarning, setEmailDomainWarning] = useState('');

  // Item + quantity
  const [selectedItemId, setSelectedItemId] = useState('');
  const [quantity, setQuantity]             = useState(1);
  const [stockWarning, setStockWarning]     = useState('');

  // Dates
  const [dateTaken, setDateTaken]       = useState(new Date().toISOString().split('T')[0]);
  const [returnDueDate, setReturnDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  });
  const [dueDateError, setDueDateError] = useState('');

  const [createError, setCreateError]   = useState('');
  const [submitting, setSubmitting]     = useState(false);

  // Borrower details view modal
  const [viewingBorrower, setViewingBorrower] = useState(null);

  // Delete confirmation modal
  const [deletingRental, setDeletingRental]         = useState(null);
  const [deleteRentalLoading, setDeleteRentalLoading] = useState(false);

  // Rental renewal modal
  const [renewingRental, setRenewingRental] = useState(null);
  const [renewalDueDate, setRenewalDueDate] = useState('');
  const [renewalError, setRenewalError] = useState('');
  const [renewalLoading, setRenewalLoading] = useState(false);

  // ── Data fetching ───────────────────────────────────────────────────────────
  const fetchRentals = async () => {
    setLoading(true);
    try {
      const res = await api.get('/rentals', {
        params: { status: statusFilter, search }
      });
      setRentals(res.data);
    } catch (err) {
      toast.error('Failed to load rental records.');
    } finally {
      setLoading(false);
    }
  };

  const fetchItems = async () => {
    try {
      const itemRes = await api.get('/items');
      setItems(itemRes.data);
    } catch (err) {
      console.error('Failed to load items:', err);
    }
  };

  useEffect(() => { fetchItems(); }, []);

  useEffect(() => {
    if (!isCreateModalOpen || selectedMemberId || borrowerName.trim().length < 2) {
      setMemberSuggestions([]);
      return undefined;
    }
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get('/members', { params: { search: borrowerName.trim() } });
        setMemberSuggestions(data.slice(0, 6));
      } catch {
        setMemberSuggestions([]);
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [borrowerName, isCreateModalOpen, selectedMemberId]);

  const selectMember = (member) => {
    setSelectedMemberId(member.id);
    setBorrowerName(member.name || '');
    setBorrowerEmail(member.email || '');
    setBorrowerPhone(member.phone || '');
    setBorrowerClass(member.class_name || '');
    setBorrowerDepartment(member.department || '');
    setMembershipIdInput(member.membership_id || '');
    setMemberSuggestions([]);
  };

  useEffect(() => {
    const timer = setTimeout(() => fetchRentals(), 200);
    return () => clearTimeout(timer);
  }, [statusFilter, search]);

  // ── Email domain typo checker ────────────────────────────────────────────
  const DOMAIN_TYPOS = {
    'gamil.com':   'gmail.com',
    'gmial.com':   'gmail.com',
    'gmai.com':    'gmail.com',
    'gmaill.com':  'gmail.com',
    'gmal.com':    'gmail.com',
    'gmali.com':   'gmail.com',
    'hotmial.com': 'hotmail.com',
    'hotmal.com':  'hotmail.com',
    'hotmai.com':  'hotmail.com',
    'yaho.com':    'yahoo.com',
    'yahooo.com':  'yahoo.com',
    'yhoo.com':    'yahoo.com',
    'outlok.com':  'outlook.com',
    'outllok.com': 'outlook.com',
    'otulook.com': 'outlook.com',
  };

  const checkEmailDomain = (email) => {
    const trimmed = email.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!trimmed || !emailRegex.test(trimmed)) {
      setEmailDomainWarning('');
      return;
    }
    const domain = trimmed.split('@')[1]?.toLowerCase();
    if (domain && DOMAIN_TYPOS[domain]) {
      setEmailDomainWarning(`Did you mean ${trimmed.split('@')[0]}@${DOMAIN_TYPOS[domain]}?`);
    } else {
      setEmailDomainWarning('');
    }
  };

  // Live stock warning when quantity changes
  const activeSelectedItem = items.find(i => String(i.id) === String(selectedItemId));

  useEffect(() => {
    if (!activeSelectedItem) { setStockWarning(''); return; }
    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty <= 0) { setStockWarning(''); return; }
    if (qty > activeSelectedItem.available_qty) {
      setStockWarning(`Only ${activeSelectedItem.available_qty} unit(s) available — reduce quantity to proceed.`);
    } else {
      setStockWarning('');
    }
  }, [quantity, selectedItemId, activeSelectedItem]);

  // Due date validation on change
  useEffect(() => {
    if (returnDueDate && dateTaken && returnDueDate <= dateTaken) {
      setDueDateError('Due date must be after the date of issue.');
    } else {
      setDueDateError('');
    }
  }, [returnDueDate, dateTaken]);

  // Open/reset modal
  const handleOpenCreateModal = () => {
    fetchItems();
    setBorrowerName('');
    setBorrowerEmail('');
    setBorrowerPhone('');
    setBorrowerClass('');
    setBorrowerDepartment('');
    setMemberSuggestions([]);
    setSelectedMemberId(null);
    setMembershipIdInput('');
    setSelectedItemId('');
    setQuantity(1);
    setStockWarning('');
    setEmailDomainWarning('');
    setDateTaken(new Date().toISOString().split('T')[0]);
    const d = new Date();
    d.setDate(d.getDate() + 7);
    setReturnDueDate(d.toISOString().split('T')[0]);
    setDueDateError('');
    setCreateError('');
    setIsCreateModalOpen(true);
  };

  // Submit handler
  const handleCreateRental = async (e) => {
    e.preventDefault();
    setCreateError('');
    checkEmailDomain(borrowerEmail);

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRegex = /^\d{10}$/;

    if (!borrowerName.trim()) {
      setCreateError('Full name is required.');
      return;
    }
    if (!membershipIdInput.trim()) {
      setCreateError('IEEE Membership ID is required.');
      return;
    }
    if (!emailRegex.test(borrowerEmail.trim())) {
      setCreateError('Please enter a valid email address.');
      return;
    }
    if (!phoneRegex.test(borrowerPhone.trim())) {
      setCreateError('Phone number must be exactly 10 digits.');
      return;
    }
    if (!borrowerClass.trim() || !borrowerDepartment.trim()) {
      setCreateError('Class and department are required.');
      return;
    }
    if (!selectedItemId) {
      setCreateError('Please select an inventory item.');
      return;
    }
    if (stockWarning) {
      setCreateError(stockWarning);
      return;
    }
    if (dueDateError) {
      setCreateError(dueDateError);
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post('/rentals', {
        item_id:         selectedItemId,
        membership_id:   membershipIdInput.trim(),
        borrower_name:   borrowerName.trim(),
        borrower_email:  borrowerEmail.trim(),
        borrower_phone:  borrowerPhone.trim(),
        borrower_class:  borrowerClass.trim(),
        borrower_department: borrowerDepartment.trim(),
        quantity:        Number(quantity),
        date_taken:      dateTaken,
        return_due_date: returnDueDate
      });

      const emailStatus = res.data?.email_status;
      if (emailStatus?.sent) {
        toast.success(`Rental issued! Confirmation email sent to ${borrowerEmail.trim()}`);
      } else if (emailStatus?.queued) {
        toast.success('Rental issued. Confirmation email is being delivered.');
      } else if (emailStatus?.error) {
        toast.error(`Rental saved, but confirmation email failed: ${emailStatus.error}`, { duration: 6000 });
      } else {
        toast.success('Rental issued successfully!');
      }

      setIsCreateModalOpen(false);
      fetchRentals();
      fetchItems();
    } catch (err) {
      setCreateError(err.response?.data?.error || 'Failed to create rental.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkReturned = async (rentalId, itemName) => {
    if (!window.confirm(`Confirm return of "${itemName}"? This will restore 1 unit to live stock.`)) {
      return;
    }

    try {
      await api.post(`/rentals/${rentalId}/return`);
      toast.success(`"${itemName}" marked as returned! Stock updated.`);
      fetchRentals();
      fetchItems();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to process return.');
    }
  };

  const openRentalRenewal = (rental) => {
    const currentDue = new Date(`${rental.return_due_date}T00:00:00Z`);
    currentDue.setUTCDate(currentDue.getUTCDate() + 7);
    setRenewalDueDate(currentDue.toISOString().slice(0, 10));
    setRenewalError('');
    setRenewingRental(rental);
  };

  const handleRenewRental = async (event) => {
    event.preventDefault();
    if (!renewalDueDate || renewalDueDate <= renewingRental.return_due_date) {
      setRenewalError(`Choose a date after ${renewingRental.return_due_date}.`);
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    if (renewalDueDate <= today) {
      setRenewalError('The renewed due date must be after today.');
      return;
    }

    setRenewalLoading(true);
    setRenewalError('');
    try {
      await api.patch(`/rentals/${renewingRental.id}/renew`, {
        return_due_date: renewalDueDate
      });
      toast.success(`Email sent and rental renewed through ${renewalDueDate}.`);
      setRenewingRental(null);
      await fetchRentals();
    } catch (error) {
      setRenewalError(error.response?.data?.error || 'Failed to renew rental.');
    } finally {
      setRenewalLoading(false);
    }
  };

  const handleTriggerCron = async () => {
    try {
      toast.loading('Running daily overdue check & sending notifications...', { id: 'cron' });
      const res = await api.post('/rentals/cron-trigger');

      const reminderSent = res.data?.reminder_check?.data?.results?.filter(r => r.email_sent)?.length || 0;
      const overdueSent  = res.data?.overdue_check?.data?.results?.filter(r => r.email_sent)?.length || 0;
      const totalSent    = reminderSent + overdueSent;

      const reminderFail = res.data?.reminder_check?.data?.results?.filter(r => r.email_sent === false)?.length || 0;
      const overdueFail  = res.data?.overdue_check?.data?.results?.filter(r => r.email_sent === false)?.length || 0;
      const totalFail    = reminderFail + overdueFail;

      if (totalFail > 0) {
        toast.error(`Audit completed: ${totalSent} email(s) sent, ${totalFail} failed.`, { id: 'cron', duration: 5000 });
      } else {
        toast.success(`Daily email audit completed! ${totalSent} notification(s) sent.`, { id: 'cron' });
      }
      fetchRentals();
    } catch (err) {
      toast.error('Failed to run overdue audit.', { id: 'cron' });
    }
  };

  // Delete rental handlers
  const handleDeleteRentalClick = (rental) => {
    setDeletingRental(rental);
  };

  const handleConfirmDeleteRental = async () => {
    if (!deletingRental) return;
    setDeleteRentalLoading(true);
    try {
      await api.delete(`/rentals/${deletingRental.id}`);
      setDeletingRental(null);
      fetchRentals();
      fetchItems();
    } catch (err) {
      console.error('[RentalManager] DELETE rental failed:', {
        status: err.response?.status,
        statusText: err.response?.statusText,
        responseBody: err.response?.data,
        message: err.message,
        rentalId: deletingRental?.id
      });
      const errMsg = err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to delete rental record.';
      toast.error(errMsg);
      setDeletingRental(null);
    } finally {
      setDeleteRentalLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-warm-surface border border-warm-border p-6 rounded-3xl shadow-sm">
        <div>
          <div className="flex items-center space-x-2 text-terracotta text-xs font-semibold uppercase tracking-wider">
            <ClipboardList className="w-4 h-4" />
            <span>Rental Management & Transactions</span>
          </div>
          <h2 className="text-xl font-bold text-warm-charcoal mt-1">Excel-Style Rental Log & Stock Audit</h2>
          <p className="text-xs text-warm-gray">Issue equipment rentals, process item returns, and trigger overdue notifications.</p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={handleTriggerCron}
            className="flex items-center space-x-1.5 bg-warm-muted hover:bg-warm-border text-terracotta font-semibold text-xs px-3.5 py-2.5 rounded-xl border border-terracotta-border transition-all shadow-xs"
            title="Trigger Overdue Email Notifications Audit"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Run Overdue Audit</span>
          </button>

          <button
            onClick={handleOpenCreateModal}
            className="flex items-center space-x-2 bg-terracotta hover:bg-terracotta-hover text-white font-semibold text-xs px-4 py-2.5 rounded-xl shadow-xs transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Issue New Rental</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-warm-subtle absolute left-3.5 top-3.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search rentals by member name, membership ID, email, or item..."
            className="w-full bg-warm-surface border border-warm-border rounded-2xl py-3 pl-10 pr-4 text-sm text-warm-charcoal placeholder:text-warm-subtle focus:outline-none focus:border-terracotta shadow-xs"
          />
        </div>

        {/* Status Filter Buttons */}
        <div className="flex items-center space-x-1.5 bg-warm-surface p-1.5 rounded-2xl border border-warm-border shadow-xs">
          {['All', 'Active', 'Overdue', 'Returned'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                statusFilter === st
                  ? 'bg-terracotta text-white shadow-xs'
                  : 'text-warm-gray hover:text-warm-charcoal'
              }`}
            >
              {st}
            </button>
          ))}
        </div>

      </div>

      {/* Excel-Style Spreadsheet Table: Mobile Cards + Desktop Table */}
      <div className="bg-warm-surface border border-warm-border rounded-3xl overflow-hidden shadow-sm">
        
        {/* Mobile View: Stacked Cards (Visible on screens < md) */}
        <div className="block md:hidden divide-y divide-warm-border-subtle">
          {loading ? (
            <div className="py-8 text-center text-warm-subtle text-xs">Loading rental records...</div>
          ) : rentals.length === 0 ? (
            <div className="py-8 text-center text-warm-subtle text-xs">No rental records found matching filters.</div>
          ) : (
            rentals.map((r) => {
              const now = new Date();
              const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
              const isReturned = (r.status || '').toLowerCase() === 'returned' || r.date_returned !== null;
              const isOverdue = !isReturned && ((r.status || '').toLowerCase() === 'overdue' || r.return_due_date < todayStr);

              return (
                <div key={r.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold text-warm-charcoal text-sm">{r.item_name}</p>
                      <p className="text-warm-gray text-[11px] font-mono">Qty: {r.quantity} | {r.item_category}</p>
                    </div>
                    {isReturned ? (
                      <span className="inline-flex items-center space-x-1 bg-warm-success-bg text-warm-success border border-warm-success-border px-2 py-0.5 rounded-lg text-xs font-bold shrink-0">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Returned</span>
                      </span>
                    ) : isOverdue ? (
                      <span className="inline-flex items-center space-x-1 bg-warm-danger-bg text-warm-danger border border-warm-danger-border px-2 py-0.5 rounded-lg text-xs font-bold shrink-0 animate-pulse">
                        <AlertTriangle className="w-3 h-3" />
                        <span>Overdue</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center space-x-1 bg-terracotta-light text-terracotta border border-terracotta-border px-2 py-0.5 rounded-lg text-xs font-bold shrink-0">
                        <Clock className="w-3 h-3" />
                        <span>Active</span>
                      </span>
                    )}
                  </div>

                  <div className="bg-warm-muted p-2.5 rounded-xl border border-warm-border space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-warm-gray">Borrower:</span>
                      <button onClick={() => setViewingBorrower(r)} className="font-bold text-terracotta hover:underline">
                        {r.member_name} ({r.membership_id})
                      </button>
                    </div>
                    <div className="flex justify-between text-warm-gray">
                      <span>Taken: {r.date_taken}</span>
                      <span className={isOverdue ? 'text-warm-danger font-semibold' : ''}>Due: {r.return_due_date}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-end space-x-2 pt-1">
                    <button
                      onClick={() => setViewingBorrower(r)}
                      className="p-2 bg-warm-surface hover:bg-warm-muted text-warm-charcoal rounded-xl border border-warm-border"
                      title="View Details"
                    >
                      <Info className="w-4 h-4" />
                    </button>

                    {!isReturned && (
                      <>
                        <button
                          onClick={() => openRentalRenewal(r)}
                          className="flex-1 flex items-center justify-center space-x-1 border border-terracotta-border bg-terracotta-light text-terracotta font-semibold py-2 rounded-xl text-xs"
                        >
                          <CalendarPlus className="w-3.5 h-3.5" />
                          <span>Renew</span>
                        </button>
                        <button
                          onClick={() => handleMarkReturned(r.id, r.item_name)}
                          className="flex-1 flex items-center justify-center space-x-1 bg-warm-success hover:opacity-90 text-white font-semibold py-2 rounded-xl text-xs shadow-xs"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Return</span>
                        </button>
                      </>
                    )}

                    <button
                      onClick={() => handleDeleteRentalClick(r)}
                      className="p-2 bg-warm-surface hover:bg-warm-danger-bg text-warm-danger rounded-xl border border-warm-border"
                      title="Delete Entry"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Desktop View: Full Data Table (Visible on screens >= md) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs text-warm-charcoal">
            <thead className="bg-warm-muted text-warm-gray font-semibold border-b border-warm-border uppercase tracking-wider">
              <tr>
                <th className="py-4 px-5">Item Name</th>
                <th className="py-4 px-5">Borrower Name</th>
                <th className="py-4 px-5">Membership ID</th>
                <th className="py-4 px-5">Date Taken</th>
                <th className="py-4 px-5">Return Due Date</th>
                <th className="py-4 px-5">Status</th>
                <th className="py-4 px-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-warm-border-subtle font-medium">
              {loading ? (
                <tr>
                  <td colSpan="7" className="py-8 text-center text-warm-subtle">Loading rental records...</td>
                </tr>
              ) : rentals.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-8 text-center text-warm-subtle">No rental records found matching filters.</td>
                </tr>
              ) : (
                rentals.map((r) => {
                  const now = new Date();
                  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                  const isReturned = (r.status || '').toLowerCase() === 'returned' || r.date_returned !== null;
                  const isOverdue = !isReturned && ((r.status || '').toLowerCase() === 'overdue' || r.return_due_date < todayStr);

                  return (
                    <tr key={r.id} className="hover:bg-warm-surface-hover transition-colors">
                      
                      {/* Item Name */}
                      <td className="py-4 px-5">
                        <p className="font-bold text-warm-charcoal text-sm">{r.item_name}</p>
                        <p className="text-warm-gray text-[11px] font-mono">Qty: {r.quantity} | {r.item_category}</p>
                      </td>

                      {/* Borrower Name */}
                      <td className="py-4 px-5">
                        <button
                          onClick={() => setViewingBorrower(r)}
                          className="font-bold text-terracotta hover:underline text-left"
                        >
                          {r.member_name}
                        </button>
                        <p className="text-warm-gray text-[11px]">{r.member_department}</p>
                      </td>

                      {/* Membership ID */}
                      <td className="py-4 px-5 font-mono font-bold text-terracotta">
                        {r.membership_id}
                      </td>

                      {/* Date Taken */}
                      <td className="py-4 px-5 text-warm-charcoal">{r.date_taken}</td>

                      {/* Return Due Date */}
                      <td className={`py-4 px-5 font-semibold ${isOverdue ? 'text-warm-danger' : 'text-warm-charcoal'}`}>
                        {r.return_due_date}
                      </td>

                      {/* Status */}
                      <td className="py-4 px-5">
                        {isReturned ? (
                          <span className="inline-flex items-center space-x-1 bg-warm-success-bg text-warm-success border border-warm-success-border px-2.5 py-1 rounded-lg font-bold">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Returned</span>
                          </span>
                        ) : isOverdue ? (
                          <span className="inline-flex items-center space-x-1 bg-warm-danger-bg text-warm-danger border border-warm-danger-border px-2.5 py-1 rounded-lg font-bold animate-pulse">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>Overdue</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 bg-terracotta-light text-terracotta border border-terracotta-border px-2.5 py-1 rounded-lg font-bold">
                            <Clock className="w-3.5 h-3.5" />
                            <span>Active</span>
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-5 text-right space-x-2">
                        <button
                          onClick={() => setViewingBorrower(r)}
                          className="p-2 bg-warm-muted hover:bg-warm-border text-warm-charcoal rounded-xl transition-all"
                          title="View Borrower Details"
                        >
                          <Info className="w-4 h-4" />
                        </button>

                        {!isReturned && (
                          <>
                            <button
                              onClick={() => openRentalRenewal(r)}
                              className="inline-flex items-center space-x-1 border border-terracotta-border bg-terracotta-light text-terracotta font-semibold px-3 py-1.5 rounded-xl transition-all text-xs"
                            >
                              <CalendarPlus className="w-3.5 h-3.5" />
                              <span>Renew</span>
                            </button>
                            <button
                              onClick={() => handleMarkReturned(r.id, r.item_name)}
                              className="inline-flex items-center space-x-1 bg-warm-success hover:opacity-90 text-white font-semibold px-3 py-1.5 rounded-xl shadow-xs transition-all text-xs"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>Return Item</span>
                            </button>
                          </>
                        )}

                        <button
                          onClick={() => handleDeleteRentalClick(r)}
                          className="p-2 bg-warm-muted hover:bg-warm-danger-bg text-warm-gray hover:text-warm-danger rounded-xl transition-all"
                          title="Delete Rental Log Entry"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>

                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Create / Issue New Rental Modal ── */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-warm-charcoal/40 backdrop-blur-sm">
          <div className="bg-warm-surface border border-warm-border rounded-3xl max-w-xl w-full p-6 shadow-xl relative max-h-[93vh] overflow-y-auto text-warm-charcoal">

            {/* Modal Header */}
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-xl font-bold text-warm-charcoal">Issue New Rental</h3>
                <p className="text-xs text-warm-gray mt-0.5">Fill in the borrower details and select an item to issue a rental.</p>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="p-2 text-warm-gray hover:text-warm-charcoal rounded-xl hover:bg-warm-muted transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Error Banner */}
            {createError && (
              <div className="flex items-start space-x-2 bg-warm-danger-bg border border-warm-danger-border text-warm-danger p-3 rounded-xl mb-4 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{createError}</span>
              </div>
            )}

            <form onSubmit={handleCreateRental} className="space-y-4">

              {/* ── Section: Borrower Details ── */}
              <div className="bg-warm-muted/60 border border-warm-border rounded-2xl p-4 space-y-3">
                <p className="text-[11px] font-bold text-warm-gray uppercase tracking-widest">Borrower Details</p>

                {/* Name */}
                <div>
                  <label className="block text-xs font-semibold text-warm-charcoal mb-1">
                    Full Name <span className="text-warm-danger">*</span>
                  </label>
                  <div className="relative">
                    <User className="w-3.5 h-3.5 text-warm-subtle absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      placeholder="e.g. Arun Kumar"
                      value={borrowerName}
                      onChange={(e) => { setBorrowerName(e.target.value); setSelectedMemberId(null); }}
                      autoComplete="off"
                      className="w-full bg-warm-surface border border-warm-border rounded-xl py-2.5 pl-9 pr-3 text-sm text-warm-charcoal focus:outline-none focus:border-terracotta transition-colors"
                    />
                    {memberSuggestions.length > 0 && (
                      <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-warm-border bg-white shadow-lg">
                        {memberSuggestions.map(member => (
                          <button key={member.id} type="button" onClick={() => selectMember(member)} className="block w-full border-b border-warm-border-subtle px-3 py-2 text-left hover:bg-warm-muted last:border-0">
                            <span className="block text-xs font-semibold text-warm-charcoal">{member.name}</span>
                            <span className="block text-[10px] text-warm-gray">{member.membership_id} · {member.class_name || 'Class not set'} · {member.department}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Email */}
                <div>
                  <label className="block text-xs font-semibold text-warm-charcoal mb-1">
                    Email Address <span className="text-warm-danger">*</span>
                  </label>
                  <div className="relative">
                    <Mail className="w-3.5 h-3.5 text-warm-subtle absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      placeholder="e.g. arun@example.com"
                      value={borrowerEmail}
                      onChange={(e) => { setBorrowerEmail(e.target.value); setEmailDomainWarning(''); }}
                      onBlur={(e) => checkEmailDomain(e.target.value)}
                      className="w-full bg-warm-surface border border-warm-border rounded-xl py-2.5 pl-9 pr-3 text-sm text-warm-charcoal focus:outline-none focus:border-terracotta transition-colors"
                    />
                  </div>
                  {/* Soft domain warning */}
                  {emailDomainWarning && (
                    <div className="mt-1.5 flex items-center space-x-1.5 text-terracotta text-[11px]">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span className="font-semibold">{emailDomainWarning}</span>
                    </div>
                  )}
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-xs font-semibold text-warm-charcoal mb-1">
                    Phone Number <span className="text-warm-danger">*</span>
                    <span className="text-warm-gray font-normal ml-1">(10 digits)</span>
                  </label>
                  <div className="relative">
                    <Phone className="w-3.5 h-3.5 text-warm-subtle absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="tel"
                      required
                      placeholder="e.g. 9876543210"
                      maxLength={10}
                      value={borrowerPhone}
                      onChange={(e) => setBorrowerPhone(e.target.value.replace(/\D/g, ''))}
                      className="w-full bg-warm-surface border border-warm-border rounded-xl py-2.5 pl-9 pr-3 text-sm text-warm-charcoal focus:outline-none focus:border-terracotta font-mono tracking-wider transition-colors"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-warm-charcoal">Class <span className="text-warm-danger">*</span></label>
                    <input required value={borrowerClass} onChange={event => setBorrowerClass(event.target.value)} placeholder="e.g. S6 ECE" className="w-full rounded-xl border border-warm-border bg-warm-surface px-3 py-2.5 text-sm outline-none focus:border-terracotta" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-warm-charcoal">Department <span className="text-warm-danger">*</span></label>
                    <input required value={borrowerDepartment} onChange={event => setBorrowerDepartment(event.target.value)} placeholder="e.g. ECE" className="w-full rounded-xl border border-warm-border bg-warm-surface px-3 py-2.5 text-sm outline-none focus:border-terracotta" />
                  </div>
                </div>
              </div>

              {/* ── Section: IEEE Membership ID ── */}
              <div className="bg-warm-muted/60 border border-warm-border rounded-2xl p-4 space-y-3">
                <p className="text-[11px] font-bold text-warm-gray uppercase tracking-widest">IEEE Membership ID</p>

                <div>
                  <label className="block text-xs font-semibold text-warm-charcoal mb-1">
                    Membership ID <span className="text-warm-danger">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      placeholder="e.g. IEEE-1001"
                      value={membershipIdInput}
                      onChange={(e) => setMembershipIdInput(e.target.value)}
                      className="w-full bg-warm-surface border border-warm-border rounded-xl py-2.5 px-3 text-sm text-warm-charcoal font-mono focus:outline-none focus:border-terracotta transition-colors"
                    />
                  </div>
                  <a href="https://services24.ieee.org/membership-validator.html" target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-terracotta hover:underline">
                    Verify with the official IEEE Membership Validator <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>

              {/* ── Section: Item & Quantity ── */}
              <div className="bg-warm-muted/60 border border-warm-border rounded-2xl p-4 space-y-3">
                <p className="text-[11px] font-bold text-warm-gray uppercase tracking-widest">Inventory Item</p>

                {/* Item Select */}
                <div>
                  <label className="block text-xs font-semibold text-warm-charcoal mb-1">
                    Select Item <span className="text-warm-danger">*</span>
                  </label>
                  <select
                    required
                    value={selectedItemId}
                    onChange={(e) => { setSelectedItemId(e.target.value); setQuantity(1); }}
                    className="w-full bg-warm-surface border border-warm-border rounded-xl py-2.5 px-3 text-sm text-warm-charcoal focus:outline-none focus:border-terracotta"
                  >
                    <option value="">-- Choose from Inventory --</option>
                    {items.map((i) => (
                      <option key={i.id} value={i.id} disabled={i.available_qty <= 0}>
                        {i.name} — {i.available_qty > 0 ? `${i.available_qty} in stock` : 'Out of Stock'}
                      </option>
                    ))}
                  </select>
                  {activeSelectedItem && (
                    <div className="mt-1.5 flex items-center space-x-3 text-[11px]">
                      <span className="text-terracotta font-semibold">Available: {activeSelectedItem.available_qty} unit(s)</span>
                      <span className="text-warm-border">•</span>
                      <span className="text-warm-gray">Total owned: {activeSelectedItem.total_qty}</span>
                    </div>
                  )}
                </div>

                {/* Quantity */}
                <div>
                  <label className="block text-xs font-semibold text-warm-charcoal mb-1">
                    Quantity <span className="text-warm-danger">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={activeSelectedItem?.available_qty || 999}
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className={`w-full bg-warm-surface border rounded-xl py-2.5 px-3 text-sm text-warm-charcoal focus:outline-none transition-colors ${
                      stockWarning ? 'border-warm-danger-border focus:border-warm-danger' : 'border-warm-border focus:border-terracotta'
                    }`}
                  />
                  {stockWarning && (
                    <div className="mt-1.5 flex items-center space-x-1.5 text-warm-danger text-[11px]">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span className="font-semibold">{stockWarning}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Section: Dates ── */}
              <div className="bg-warm-muted/60 border border-warm-border rounded-2xl p-4 space-y-3">
                <p className="text-[11px] font-bold text-warm-gray uppercase tracking-widest">Rental Period</p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-warm-charcoal mb-1">
                      Date of Issue <span className="text-warm-danger">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={dateTaken}
                      onChange={(e) => setDateTaken(e.target.value)}
                      className="w-full bg-warm-surface border border-warm-border rounded-xl py-2.5 px-3 text-sm text-warm-charcoal focus:outline-none focus:border-terracotta transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-warm-charcoal mb-1">
                      Due Date <span className="text-warm-danger">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={returnDueDate}
                      min={dateTaken ? (() => { const d = new Date(dateTaken); d.setDate(d.getDate()+1); return d.toISOString().split('T')[0]; })() : undefined}
                      onChange={(e) => setReturnDueDate(e.target.value)}
                      className={`w-full bg-warm-surface border rounded-xl py-2.5 px-3 text-sm text-warm-charcoal focus:outline-none transition-colors ${
                        dueDateError ? 'border-warm-danger-border focus:border-warm-danger' : 'border-warm-border focus:border-terracotta'
                      }`}
                    />
                    {dueDateError && (
                      <p className="text-[11px] text-warm-danger mt-1 flex items-center space-x-1">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>{dueDateError}</span>
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Submit Row ── */}
              <div className="flex items-center justify-end space-x-3 pt-1">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-5 py-2.5 bg-warm-muted text-warm-charcoal text-xs font-semibold rounded-xl hover:bg-warm-border transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !!stockWarning || !!dueDateError}
                  className="px-5 py-2.5 bg-terracotta hover:bg-terracotta-hover disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center space-x-2"
                >
                  <ClipboardList className="w-4 h-4" />
                  <span>{submitting ? 'Issuing Rental...' : 'Issue Rental'}</span>
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Renew Rental Modal */}
      {renewingRental && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-warm-charcoal/40 p-4 backdrop-blur-sm" onClick={() => !renewalLoading && setRenewingRental(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-warm-border bg-white p-5 shadow-xl" onClick={event => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-terracotta"><CalendarPlus className="h-4 w-4" /> Renew rental</div>
                <h3 className="mt-1 text-lg font-bold text-warm-charcoal">{renewingRental.item_name}</h3>
                <p className="mt-1 text-xs text-warm-gray">Borrowed by {renewingRental.member_name}</p>
              </div>
              <button type="button" disabled={renewalLoading} onClick={() => setRenewingRental(null)} className="rounded-lg p-1.5 text-warm-gray hover:bg-warm-muted" aria-label="Close renewal dialog"><X className="h-4 w-4" /></button>
            </div>

            <form onSubmit={handleRenewRental} className="mt-5 space-y-4">
              <div className="rounded-xl border border-warm-border bg-warm-muted p-3 text-xs">
                <span className="text-warm-gray">Current due date</span>
                <strong className="float-right text-warm-charcoal">{renewingRental.return_due_date}</strong>
                {!!renewingRental.renewal_count && <p className="mt-2 text-warm-gray">Previously renewed {renewingRental.renewal_count} time{renewingRental.renewal_count === 1 ? '' : 's'}.</p>}
              </div>
              <label className="block text-sm font-semibold text-warm-charcoal">
                New due date
                <input
                  type="date"
                  required
                  min={(() => { const date = new Date(`${renewingRental.return_due_date}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + 1); return date.toISOString().slice(0, 10); })()}
                  value={renewalDueDate}
                  onChange={event => { setRenewalDueDate(event.target.value); setRenewalError(''); }}
                  className="mt-2 w-full rounded-xl border border-warm-border bg-white px-3 py-2.5 text-sm outline-none focus:border-terracotta"
                />
              </label>
              {renewalError && <p className="flex items-start gap-2 rounded-lg bg-warm-danger-bg p-3 text-xs text-warm-danger"><AlertCircle className="h-4 w-4 shrink-0" /> {renewalError}</p>}
              <p className="text-xs leading-5 text-warm-gray">The confirmation email must be accepted before the due date changes. Renewal also resets an overdue rental to Active, records the previous deadline, and starts a fresh reminder cycle.</p>
              <div className="flex justify-end gap-2">
                <button type="button" disabled={renewalLoading} onClick={() => setRenewingRental(null)} className="rounded-xl border border-warm-border px-4 py-2.5 text-xs font-semibold text-warm-charcoal hover:bg-warm-muted">Cancel</button>
                <button type="submit" disabled={renewalLoading} className="inline-flex items-center gap-2 rounded-xl bg-terracotta px-4 py-2.5 text-xs font-semibold text-white hover:bg-terracotta-hover disabled:opacity-50">
                  <CalendarPlus className="h-4 w-4" /> {renewalLoading ? 'Renewing...' : 'Confirm renewal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Borrower Details Modal */}
      {viewingBorrower && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-warm-charcoal/40 backdrop-blur-sm">
          <div className="bg-warm-surface border border-warm-border rounded-3xl max-w-md w-full p-6 shadow-xl relative text-warm-charcoal">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-xs font-mono font-bold text-terracotta bg-terracotta-light px-2.5 py-1 rounded-lg border border-terracotta-border">
                  {viewingBorrower.membership_id}
                </span>
                <h3 className="text-xl font-bold text-warm-charcoal mt-2">{viewingBorrower.member_name}</h3>
              </div>
              <button
                onClick={() => setViewingBorrower(null)}
                className="text-warm-gray hover:text-warm-charcoal p-1"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs">
              <div className="bg-warm-muted p-3 rounded-xl border border-warm-border space-y-2">
                <p className="text-warm-gray font-semibold">Registered Contact Info:</p>
                <p className="text-warm-charcoal"><strong>Email:</strong> {viewingBorrower.member_email}</p>
                <p className="text-warm-charcoal"><strong>Phone:</strong> {viewingBorrower.member_phone || 'Not provided'}</p>
                <p className="text-warm-charcoal"><strong>Class:</strong> {viewingBorrower.member_class || 'Not provided'}</p>
                <p className="text-warm-charcoal"><strong>Department:</strong> {viewingBorrower.member_department}</p>
              </div>

              <div className="bg-warm-muted p-3 rounded-xl border border-warm-border space-y-2">
                <p className="text-warm-gray font-semibold">Current Rental Log Details:</p>
                <p className="text-warm-charcoal"><strong>Rented Item:</strong> {viewingBorrower.item_name}</p>
                <p className="text-warm-charcoal"><strong>Quantity:</strong> {viewingBorrower.quantity}</p>
                <p className="text-warm-charcoal"><strong>Date Taken:</strong> {viewingBorrower.date_taken}</p>
                <p className="text-warm-charcoal"><strong>Expected Return Date:</strong> {viewingBorrower.return_due_date}</p>
                <p className="text-warm-charcoal"><strong>Actual Return Date:</strong> {viewingBorrower.date_returned || 'Not returned yet'}</p>
                <p className="text-warm-charcoal"><strong>Status:</strong> <span className="font-bold">{viewingBorrower.status}</span></p>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setViewingBorrower(null)}
                className="bg-warm-muted hover:bg-warm-border text-warm-charcoal text-xs font-semibold px-4 py-2 rounded-xl"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Rental Confirmation Modal */}
      {deletingRental && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-warm-charcoal/40 backdrop-blur-sm">
          <div className="bg-warm-surface border border-warm-danger-border rounded-3xl max-w-sm w-full p-6 shadow-xl">
            {/* Icon */}
            <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-warm-danger-bg border border-warm-danger-border mx-auto mb-4">
              <AlertTriangle className="w-7 h-7 text-warm-danger" />
            </div>

            <h3 className="text-lg font-bold text-warm-charcoal text-center mb-1">Delete Rental Log Entry?</h3>
            <p className="text-warm-gray text-xs text-center mb-4">
              Are you sure you want to permanently delete the rental record for{' '}
              <span className="font-bold text-warm-charcoal">"{deletingRental.item_name}"</span>{' '}
              borrowed by <span className="font-bold text-warm-charcoal">{deletingRental.member_name}</span>?
              This action cannot be undone.
            </p>

            {/* Warn if the item is still out on rental */}
            {!deletingRental.date_returned && deletingRental.status !== 'Returned' && (
              <div className="bg-warm-danger-bg border border-warm-danger-border rounded-xl p-3 mb-4 text-xs text-warm-danger flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  <strong>Note:</strong> This item has not been returned yet ({deletingRental.status}). Deleting will automatically restore{' '}
                  <strong>{deletingRental.quantity}</strong> unit(s) back to live inventory stock.
                </span>
              </div>
            )}

            <div className="flex items-center justify-center space-x-3">
              <button
                onClick={() => setDeletingRental(null)}
                disabled={deleteRentalLoading}
                className="px-5 py-2.5 bg-warm-muted hover:bg-warm-border text-warm-charcoal text-xs font-semibold rounded-xl transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDeleteRental}
                disabled={deleteRentalLoading}
                className="px-5 py-2.5 bg-warm-danger hover:opacity-90 text-white text-xs font-semibold rounded-xl shadow-xs transition-all disabled:opacity-50 flex items-center space-x-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{deleteRentalLoading ? 'Deleting...' : 'Yes, Delete'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
