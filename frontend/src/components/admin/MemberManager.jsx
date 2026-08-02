import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import {
  Users, Search, Pencil, Trash2, RotateCcw, AlertTriangle, AlertCircle, X, Save, Info, Phone
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function MemberManager() {
  const [members, setMembers]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');

  // Edit member inline
  const [editingId, setEditingId]     = useState(null);
  const [editForm, setEditForm]       = useState({ name: '', email: '', phone: '' });
  const [editError, setEditError]     = useState('');
  const [editLoading, setEditLoading] = useState(false);

  // Delete confirmation
  const [deletingMember, setDeletingMember] = useState(null);
  const [deleteLoading, setDeleteLoading]   = useState(false);

  // ── Fetch members ───────────────────────────────────────────────────────────
  const fetchMembers = async () => {
    setLoading(true);
    try {
      const res = await api.get('/members');
      setMembers(res.data);
    } catch (err) {
      toast.error('Failed to load members list.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchMembers(); }, []);

  // ── Filtered view ────────────────────────────────────────────────────────────
  const filtered = members.filter(m => {
    const q = search.toLowerCase();
    return (
      m.membership_id?.toLowerCase().includes(q) ||
      m.name?.toLowerCase().includes(q) ||
      m.phone?.toLowerCase().includes(q) ||
      m.email?.toLowerCase().includes(q)
    );
  });

  // ── Edit Member ──────────────────────────────────────────────────────────────
  const startEdit = (m) => {
    setEditingId(m.id);
    setEditForm({ name: m.name, email: m.email || '', phone: m.phone || '' });
    setEditError('');
  };

  const cancelEdit = () => { setEditingId(null); setEditError(''); };

  const handleSaveEdit = async (m) => {
    setEditError('');
    if (!editForm.name.trim()) { setEditError('Name cannot be empty.'); return; }
    if (!editForm.email.trim() || !editForm.email.includes('@')) { setEditError('Please enter a valid email address.'); return; }
    setEditLoading(true);
    try {
      await api.put(`/members/${m.id}`, {
        membership_id: m.membership_id,
        name: editForm.name.trim(),
        email: editForm.email.trim(),
        department: m.department || 'IEEE Member',
        phone: editForm.phone.trim(),
        status: m.status || 'active'
      });
      toast.success('Member updated successfully.');
      setEditingId(null);
      fetchMembers();
    } catch (err) {
      setEditError(err.response?.data?.error || 'Failed to update member.');
    } finally {
      setEditLoading(false);
    }
  };

  // ── Delete Member ────────────────────────────────────────────────────────────
  const handleConfirmDelete = async () => {
    if (!deletingMember) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/members/${deletingMember.id}`);
      toast.success(`"${deletingMember.name}" removed from members list.`);
      setDeletingMember(null);
      fetchMembers();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete member.');
      setDeletingMember(null);
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-warm-surface border border-warm-border p-6 rounded-3xl shadow-sm">
        <div>
          <div className="flex items-center space-x-2 text-terracotta text-xs font-semibold uppercase tracking-wider">
            <Users className="w-4 h-4" />
            <span>Member Registry</span>
          </div>
          <h2 className="text-xl font-bold text-warm-charcoal mt-1">Manage IEEE Members</h2>
          <p className="text-xs text-warm-gray mt-0.5">
            Members are automatically added here with their contact details when they issue their first rental.
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={fetchMembers}
            className="p-2.5 bg-warm-muted hover:bg-warm-border text-warm-gray hover:text-warm-charcoal rounded-xl transition-colors"
            title="Refresh List"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Info Banner */}
      <div className="flex items-start space-x-3 bg-terracotta-light border border-terracotta-border rounded-2xl p-4">
        <Info className="w-4 h-4 text-terracotta shrink-0 mt-0.5" />
        <p className="text-xs text-terracotta leading-relaxed">
          This list is <span className="font-semibold text-warm-charcoal">automatically populated</span> — entries and contact numbers are saved whenever a rental is issued in the Rentals tab.
        </p>
      </div>

      {/* Stats */}
      <div className="bg-warm-surface border border-warm-border rounded-2xl p-5 max-w-xs shadow-xs">
        <p className="text-xs text-warm-gray font-medium">Total Registered Members</p>
        <p className="text-3xl font-extrabold text-warm-charcoal mt-1">{members.length}</p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="w-4 h-4 text-warm-subtle absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          placeholder="Search by name, membership ID, email, or contact number..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-warm-surface border border-warm-border rounded-xl py-2.5 pl-10 pr-3 text-sm text-warm-charcoal placeholder:text-warm-subtle focus:outline-none focus:border-terracotta transition-colors shadow-xs"
        />
      </div>

      {/* Table */}
      <div className="bg-warm-surface border border-warm-border rounded-3xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-warm-border bg-warm-muted">
                <th className="px-5 py-3.5 text-left text-warm-gray font-semibold">Membership ID</th>
                <th className="px-5 py-3.5 text-left text-warm-gray font-semibold">Name</th>
                <th className="px-5 py-3.5 text-left text-warm-gray font-semibold">Email</th>
                <th className="px-5 py-3.5 text-left text-warm-gray font-semibold">Contact Number</th>
                <th className="px-5 py-3.5 text-right text-warm-gray font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-warm-border-subtle">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-warm-subtle">
                    <div className="flex items-center justify-center space-x-2">
                      <div className="w-4 h-4 border-2 border-terracotta border-t-transparent rounded-full animate-spin" />
                      <span>Loading members...</span>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-warm-subtle">
                    {search
                      ? 'No members match your search.'
                      : 'No members yet — they will appear here automatically when the first rental is issued.'}
                  </td>
                </tr>
              ) : (
                filtered.map(m => {
                  const isEditing = editingId === m.id;
                  return (
                    <tr key={m.id} className="hover:bg-warm-surface-hover transition-colors">
                      {/* Membership ID */}
                      <td className="px-5 py-4 font-mono text-terracotta text-[11px] font-bold">
                        {m.membership_id}
                      </td>

                      {/* Name */}
                      <td className="px-5 py-4">
                        {isEditing ? (
                          <div className="space-y-1">
                            <input
                              type="text"
                              value={editForm.name}
                              onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                              className="w-full bg-warm-muted border border-terracotta-border rounded-lg py-1.5 px-2.5 text-xs text-warm-charcoal focus:outline-none focus:border-terracotta"
                              placeholder="Full Name"
                              autoFocus
                            />
                            {editError && <p className="text-warm-danger text-[10px]">{editError}</p>}
                          </div>
                        ) : (
                          <span className="text-warm-charcoal font-semibold">{m.name}</span>
                        )}
                      </td>

                      {/* Email */}
                      <td className="px-5 py-4 text-warm-gray">
                        {isEditing ? (
                          <input
                            type="email"
                            value={editForm.email}
                            onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                            className="w-full bg-warm-muted border border-terracotta-border rounded-lg py-1.5 px-2.5 text-xs text-warm-charcoal focus:outline-none focus:border-terracotta"
                            placeholder="Email Address"
                          />
                        ) : (
                          m.email || '—'
                        )}
                      </td>

                      {/* Contact Number (Phone) */}
                      <td className="px-5 py-4 text-warm-charcoal font-mono">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editForm.phone}
                            onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
                            className="w-full bg-warm-muted border border-terracotta-border rounded-lg py-1.5 px-2.5 text-xs font-mono text-warm-charcoal focus:outline-none focus:border-terracotta"
                            placeholder="Contact Number"
                          />
                        ) : (
                          <div className="flex items-center space-x-1.5">
                            {m.phone ? (
                              <>
                                <Phone className="w-3 h-3 text-warm-subtle shrink-0" />
                                <span>{m.phone}</span>
                              </>
                            ) : (
                              <span className="text-warm-subtle">—</span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          {isEditing ? (
                            <>
                              <button
                                onClick={() => handleSaveEdit(m)}
                                disabled={editLoading}
                                className="p-2 bg-terracotta hover:bg-terracotta-hover text-white rounded-xl transition-colors disabled:opacity-50"
                                title="Save Changes"
                              >
                                <Save className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={cancelEdit}
                                className="p-2 bg-warm-muted hover:bg-warm-border text-warm-gray hover:text-warm-charcoal rounded-xl transition-colors"
                                title="Cancel"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => startEdit(m)}
                                className="p-2 bg-warm-muted hover:bg-terracotta-light text-warm-gray hover:text-terracotta rounded-xl transition-all"
                                title="Edit Member Details"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setDeletingMember(m)}
                                className="p-2 bg-warm-muted hover:bg-warm-danger-bg text-warm-gray hover:text-warm-danger rounded-xl transition-all"
                                title="Remove Member"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deletingMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-warm-charcoal/40 backdrop-blur-sm">
          <div className="bg-warm-surface border border-warm-danger-border rounded-3xl max-w-sm w-full p-6 shadow-xl">
            <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-warm-danger-bg border border-warm-danger-border mx-auto mb-4">
              <AlertTriangle className="w-7 h-7 text-warm-danger" />
            </div>
            <h3 className="text-lg font-bold text-warm-charcoal text-center mb-1">Remove Member?</h3>
            <p className="text-warm-gray text-xs text-center mb-4">
              Remove <span className="font-bold text-warm-charcoal">"{deletingMember.name}"</span> ({deletingMember.membership_id}) from the registry?
              <br />
              <span className="text-warm-subtle mt-1 block">Their rental history will remain intact.</span>
            </p>
            <div className="flex items-center justify-center space-x-3">
              <button
                onClick={() => setDeletingMember(null)}
                disabled={deleteLoading}
                className="px-5 py-2.5 bg-warm-muted hover:bg-warm-border text-warm-charcoal text-xs font-semibold rounded-xl transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deleteLoading}
                className="px-5 py-2.5 bg-warm-danger hover:opacity-90 text-white text-xs font-semibold rounded-xl shadow-xs transition-all disabled:opacity-50 flex items-center space-x-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{deleteLoading ? 'Removing...' : 'Remove'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
