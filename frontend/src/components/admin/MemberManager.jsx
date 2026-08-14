import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../services/api';
import { CalendarPlus, Download, Pencil, RefreshCw, Save, Search, Trash2, Users, X } from 'lucide-react';
import toast from 'react-hot-toast';

const emptyEdit = { name: '', email: '', phone: '', class_name: '', department: '', membership_expiry_date: '' };

export default function MemberManager() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(emptyEdit);
  const [renewing, setRenewing] = useState(null);
  const [renewalDate, setRenewalDate] = useState('');
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/members');
      setMembers(data);
    } catch {
      toast.error('Failed to load members.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return members;
    return members.filter(member => [member.name, member.membership_id, member.email, member.phone, member.class_name, member.department]
      .some(value => value?.toLowerCase().includes(query)));
  }, [members, search]);

  const startEdit = member => {
    setEditingId(member.id);
    setEditForm({
      name: member.name || '', email: member.email || '', phone: member.phone || '',
      class_name: member.class_name || '', department: member.department || '',
      membership_expiry_date: member.membership_expiry_date?.slice(0, 10) || ''
    });
  };

  const saveEdit = async member => {
    if (!editForm.name.trim() || !editForm.email.includes('@') || !editForm.department.trim()) {
      toast.error('Name, valid email, and department are required.');
      return;
    }
    setBusy(true);
    try {
      await api.put(`/members/${member.id}`, {
        ...editForm,
        membership_id: member.membership_id,
        status: member.status || 'active'
      });
      toast.success('Member updated.');
      setEditingId(null);
      await fetchMembers();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to update member.');
    } finally { setBusy(false); }
  };

  const openRenewal = member => {
    const date = new Date();
    date.setFullYear(date.getFullYear() + 1);
    setRenewalDate(date.toISOString().slice(0, 10));
    setRenewing(member);
  };

  const renewMembership = async () => {
    setBusy(true);
    try {
      await api.patch(`/members/${renewing.id}/renew`, { membership_expiry_date: renewalDate });
      toast.success(`Membership renewed through ${renewalDate}.`);
      setRenewing(null);
      await fetchMembers();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to renew membership.');
    } finally { setBusy(false); }
  };

  const deleteMember = async () => {
    setBusy(true);
    try {
      await api.delete(`/members/${deleting.id}`);
      toast.success('Member removed.');
      setDeleting(null);
      await fetchMembers();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to remove member.');
    } finally { setBusy(false); }
  };

  const exportMembers = async () => {
    try {
      const response = await api.get('/members/export', { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'IEEE_MACE_SB_Members.xlsx';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch { toast.error('Failed to export member details.'); }
  };

  const updateEdit = (field, value) => setEditForm(current => ({ ...current, [field]: value }));

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 rounded-xl border border-warm-border bg-white p-5 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-terracotta"><Users className="h-4 w-4" /> Member registry</div>
          <h2 className="mt-1 text-xl font-bold">IEEE MACE SB members</h2>
          <p className="mt-1 text-xs text-warm-gray">Class, department, membership validity, and rental counts in one register.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchMembers} className="rounded-lg border border-warm-border p-2.5 text-warm-gray hover:bg-warm-muted" aria-label="Refresh"><RefreshCw className="h-4 w-4" /></button>
          <button onClick={exportMembers} className="flex items-center gap-2 rounded-lg bg-terracotta px-3 py-2 text-sm font-semibold text-white hover:bg-terracotta-hover"><Download className="h-4 w-4" /> Export Excel</button>
        </div>
      </div>

      <label className="relative block">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-warm-subtle" />
        <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search name, ID, class, or department" className="w-full rounded-lg border border-warm-border bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-terracotta" />
      </label>

      <div className="overflow-hidden rounded-xl border border-warm-border bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] text-xs">
            <thead className="border-b border-warm-border bg-warm-muted text-left text-warm-gray">
              <tr><th className="px-4 py-3">Member</th><th className="px-4 py-3">Contact</th><th className="px-4 py-3">Class</th><th className="px-4 py-3">Department</th><th className="px-4 py-3">Valid through</th><th className="px-4 py-3">Rentals</th><th className="px-4 py-3 text-right">Actions</th></tr>
            </thead>
            <tbody className="divide-y divide-warm-border-subtle">
              {loading ? <tr><td colSpan="7" className="p-10 text-center text-warm-gray">Loading members…</td></tr> : filtered.length === 0 ? <tr><td colSpan="7" className="p-10 text-center text-warm-gray">No members found.</td></tr> : filtered.map(member => {
                const isEditing = editingId === member.id;
                return (
                  <tr key={member.id} className="align-top hover:bg-warm-surface-hover">
                    <td className="px-4 py-3">
                      {isEditing ? <input value={editForm.name} onChange={event => updateEdit('name', event.target.value)} className="w-40 rounded border border-warm-border px-2 py-1.5" /> : <><p className="font-semibold text-warm-charcoal">{member.name}</p><p className="mt-1 font-mono text-[11px] text-terracotta">{member.membership_id}</p></>}
                    </td>
                    <td className="px-4 py-3 text-warm-gray">
                      {isEditing ? <div className="space-y-1"><input value={editForm.email} onChange={event => updateEdit('email', event.target.value)} className="w-48 rounded border border-warm-border px-2 py-1.5" /><input value={editForm.phone} onChange={event => updateEdit('phone', event.target.value)} className="w-48 rounded border border-warm-border px-2 py-1.5" /></div> : <><p>{member.email}</p><p className="mt-1">{member.phone || '—'}</p></>}
                    </td>
                    <td className="px-4 py-3">{isEditing ? <input value={editForm.class_name} onChange={event => updateEdit('class_name', event.target.value)} className="w-28 rounded border border-warm-border px-2 py-1.5" /> : member.class_name || '—'}</td>
                    <td className="px-4 py-3">{isEditing ? <input value={editForm.department} onChange={event => updateEdit('department', event.target.value)} className="w-48 rounded border border-warm-border px-2 py-1.5" /> : member.department || '—'}</td>
                    <td className="px-4 py-3">{isEditing ? <input type="date" value={editForm.membership_expiry_date} onChange={event => updateEdit('membership_expiry_date', event.target.value)} className="rounded border border-warm-border px-2 py-1.5" /> : member.membership_expiry_date?.slice(0, 10) || 'Not set'}</td>
                    <td className="px-4 py-3"><strong>{member.total_rentals_count || 0}</strong> total<br /><span className="text-warm-gray">{member.active_rentals_count || 0} active</span></td>
                    <td className="px-4 py-3"><div className="flex justify-end gap-1">
                      {isEditing ? <><button disabled={busy} onClick={() => saveEdit(member)} className="rounded-lg bg-terracotta p-2 text-white"><Save className="h-3.5 w-3.5" /></button><button onClick={() => setEditingId(null)} className="rounded-lg border border-warm-border p-2"><X className="h-3.5 w-3.5" /></button></> : <><button onClick={() => startEdit(member)} className="rounded-lg border border-warm-border p-2 text-warm-gray hover:bg-warm-muted" title="Edit"><Pencil className="h-3.5 w-3.5" /></button><button onClick={() => openRenewal(member)} className="rounded-lg border border-warm-border p-2 text-terracotta hover:bg-terracotta-light" title="Renew membership"><CalendarPlus className="h-3.5 w-3.5" /></button><button onClick={() => setDeleting(member)} className="rounded-lg border border-warm-border p-2 text-warm-danger hover:bg-warm-danger-bg" title="Remove"><Trash2 className="h-3.5 w-3.5" /></button></>}
                    </div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {renewing && <Modal title={`Renew ${renewing.name}`} onClose={() => setRenewing(null)}><label className="block text-sm font-medium">New expiry date<input type="date" value={renewalDate} onChange={event => setRenewalDate(event.target.value)} className="mt-2 w-full rounded-lg border border-warm-border px-3 py-2" /></label><button disabled={busy} onClick={renewMembership} className="mt-4 w-full rounded-lg bg-terracotta py-2.5 text-sm font-semibold text-white">Renew membership</button></Modal>}
      {deleting && <Modal title="Remove member?" onClose={() => setDeleting(null)}><p className="text-sm text-warm-gray">Remove <strong className="text-warm-charcoal">{deleting.name}</strong>? Rental history will be retained.</p><button disabled={busy} onClick={deleteMember} className="mt-4 w-full rounded-lg bg-warm-danger py-2.5 text-sm font-semibold text-white">Remove member</button></Modal>}
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-warm-charcoal/30 p-4" onClick={onClose}><div className="w-full max-w-sm rounded-xl border border-warm-border bg-white p-5" onClick={event => event.stopPropagation()}><div className="mb-4 flex items-center justify-between"><h3 className="font-bold">{title}</h3><button onClick={onClose} className="rounded-lg p-1.5 hover:bg-warm-muted"><X className="h-4 w-4" /></button></div>{children}</div></div>;
}
