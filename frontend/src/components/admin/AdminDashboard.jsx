import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import InventoryManager from './InventoryManager';
import RentalManager from './RentalManager';
import MemberManager from './MemberManager';
import { Package, ClipboardList, AlertTriangle, ShieldCheck, Mail, Send, ShieldAlert, Users, CheckCircle2, XCircle, RefreshCw, Eye } from 'lucide-react';
import toast from 'react-hot-toast';

const VALID_TABS = ['rentals', 'inventory', 'members', 'automation'];

export default function AdminDashboard() {
  const { isAuthenticated, loading } = useAuth();

  const [activeTab, setActiveTab] = useState(() => {
    // 1. Check URL hash first (e.g. #inventory, #automation, #rentals)
    const hash = (window.location.hash || '').replace('#', '');
    if (VALID_TABS.includes(hash)) {
      return hash;
    }
    // 2. Check localStorage
    const savedTab = localStorage.getItem('ieee_admin_active_tab');
    if (savedTab && VALID_TABS.includes(savedTab)) {
      return savedTab;
    }
    // 3. Fallback default
    return 'rentals';
  });

  const handleTabChange = (tab) => {
    if (!VALID_TABS.includes(tab)) return;
    setActiveTab(tab);
    localStorage.setItem('ieee_admin_active_tab', tab);
    window.location.hash = tab;
  };

  useEffect(() => {
    // Keep localStorage and URL hash synced whenever activeTab changes
    localStorage.setItem('ieee_admin_active_tab', activeTab);
    if (window.location.hash !== `#${activeTab}`) {
      window.location.hash = activeTab;
    }
  }, [activeTab]);

  const [stats, setStats] = useState({
    totalMembers: 0,
    totalItems: 0,
    activeRentals: 0,
    overdueRentals: 0
  });

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState(null);
  const [runningCron, setRunningCron] = useState(false);

  // Overdue Status State
  const [overdueStatus, setOverdueStatus] = useState(null);
  const [loadingStatus, setLoadingStatus] = useState(false);

  const fetchOverdueStatus = async () => {
    if (!isAuthenticated) return;
    setLoadingStatus(true);
    try {
      const res = await api.get('/rentals/overdue-status');
      setOverdueStatus(res.data);
    } catch (err) {
      console.error('Failed to load overdue status:', err);
    } finally {
      setLoadingStatus(false);
    }
  };

  const fetchStats = async () => {
    if (!isAuthenticated) return;
    try {
      const [itemsRes, rentalsRes, membersRes] = await Promise.all([
        api.get('/items'),
        api.get('/rentals'),
        api.get('/members')
      ]);

      const rentals = rentalsRes.data;

      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      const activeRentals = rentals.filter(r => {
        const isReturned = (r.status || '').toLowerCase() === 'returned' || r.date_returned !== null;
        return !isReturned;
      }).length;

      const overdueRentals = rentals.filter(r => {
        const isReturned = (r.status || '').toLowerCase() === 'returned' || r.date_returned !== null;
        const isPastDue = r.return_due_date < todayStr;
        const isOverdueStatus = (r.status || '').toLowerCase() === 'overdue';
        return !isReturned && (isOverdueStatus || isPastDue);
      }).length;

      setStats({
        totalMembers: membersRes.data.length,
        totalItems: itemsRes.data.length,
        activeRentals,
        overdueRentals
      });
    } catch (err) {
      console.error('Failed to load dashboard metrics:', err);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchStats();
      fetchOverdueStatus();
    }
  }, [activeTab, isAuthenticated]);

  if (!loading && !isAuthenticated) {
    return (
      <div className="bg-warm-surface border border-warm-danger-border rounded-3xl p-8 text-center max-w-md mx-auto my-12 shadow-sm">
        <ShieldAlert className="w-12 h-12 text-warm-danger mx-auto mb-3 animate-pulse" />
        <h3 className="text-xl font-bold text-warm-charcoal">Access Denied</h3>
        <p className="text-xs text-warm-gray mt-2">Admin authorization token missing or expired. Please login to access operational controls.</p>
      </div>
    );
  }

  const handleManualCron = async () => {
    setRunningCron(true);
    try {
      const res = await api.post('/rentals/cron-trigger');
      setAuditLogs(res.data);

      const reminderSent = res.data?.reminder_check?.data?.results?.filter(r => r.email_sent)?.length || 0;
      const overdueSent  = res.data?.overdue_check?.data?.results?.filter(r => r.email_sent)?.length || 0;
      const totalSent    = reminderSent + overdueSent;

      const reminderFail = res.data?.reminder_check?.data?.results?.filter(r => r.email_sent === false)?.length || 0;
      const overdueFail  = res.data?.overdue_check?.data?.results?.filter(r => r.email_sent === false)?.length || 0;
      const totalFail    = reminderFail + overdueFail;

      if (totalFail > 0) {
        toast.error(`Audit finished: ${totalSent} sent, ${totalFail} failed.`);
      } else {
        toast.success(`Daily email audit finished! ${totalSent} notification(s) dispatched.`);
      }
      fetchStats();
      fetchOverdueStatus();
    } catch (err) {
      toast.error('Overdue check failed.');
    } finally {
      setRunningCron(false);
    }
  };

  return (
    <div className="space-y-8 pb-12">
      
      {/* Top Banner & Stats Overview */}
      <div className="bg-gradient-to-r from-warm-surface via-warm-muted to-warm-surface border border-warm-border rounded-3xl p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 text-terracotta text-xs font-semibold uppercase tracking-wider">
              <ShieldCheck className="w-4 h-4" />
              <span>Admin Management Portal</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-warm-charcoal mt-1">IEEE Branch Operational Overview</h2>
            <p className="text-xs text-warm-gray">Live monitoring of equipment stock, rental records, and automated notifications.</p>
          </div>

          <button
            onClick={handleManualCron}
            disabled={runningCron}
            className="flex items-center space-x-2 bg-terracotta hover:bg-terracotta-hover text-white font-semibold text-xs px-4 py-3 rounded-2xl shadow-xs transition-all disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            <span>{runningCron ? 'Auditing Overdue Items...' : 'Trigger Daily Overdue Email Audit'}</span>
          </button>
        </div>

        {/* Operational Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 sm:gap-4 mt-6">

          <div className="bg-warm-surface border border-warm-border p-4 rounded-2xl shadow-xs">
            <div className="flex items-center justify-between text-terracotta">
              <span className="text-xs font-medium text-warm-gray">Registered Members</span>
              <Users className="w-4 h-4" />
            </div>
            <p className="text-2xl font-extrabold text-warm-charcoal mt-2">{stats.totalMembers}</p>
          </div>

          <div className="bg-warm-surface border border-warm-border p-4 rounded-2xl shadow-xs">
            <div className="flex items-center justify-between text-terracotta">
              <span className="text-xs font-medium text-warm-gray">Active Rentals</span>
              <ClipboardList className="w-4 h-4" />
            </div>
            <p className="text-2xl font-extrabold text-warm-charcoal mt-2">{stats.activeRentals}</p>
          </div>

          <div className="bg-warm-surface border border-warm-border p-4 rounded-2xl shadow-xs">
            <div className="flex items-center justify-between text-warm-danger">
              <span className="text-xs font-medium text-warm-gray">Overdue Rentals</span>
              <AlertTriangle className="w-4 h-4" />
            </div>
            <p className="text-2xl font-extrabold text-warm-danger mt-2">{stats.overdueRentals}</p>
          </div>

          <div className="bg-warm-surface border border-warm-border p-4 rounded-2xl shadow-xs">
            <div className="flex items-center justify-between text-terracotta">
              <span className="text-xs font-medium text-warm-gray">Inventory Items</span>
              <Package className="w-4 h-4" />
            </div>
            <p className="text-2xl font-extrabold text-warm-charcoal mt-2">{stats.totalItems}</p>
          </div>

        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center space-x-2 border-b border-warm-border pb-2 overflow-x-auto scrollbar-none">
        
        <button
          onClick={() => handleTabChange('rentals')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all ${
            activeTab === 'rentals'
              ? 'bg-terracotta text-white shadow-xs'
              : 'bg-warm-surface border border-warm-border text-warm-gray hover:text-warm-charcoal hover:bg-warm-muted'
          }`}
        >
          <ClipboardList className="w-4 h-4" />
          <span>Rentals Excel Log</span>
        </button>

        <button
          onClick={() => handleTabChange('inventory')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all ${
            activeTab === 'inventory'
              ? 'bg-terracotta text-white shadow-xs'
              : 'bg-warm-surface border border-warm-border text-warm-gray hover:text-warm-charcoal hover:bg-warm-muted'
          }`}
        >
          <Package className="w-4 h-4" />
          <span>Manage Inventory</span>
        </button>

        <button
          onClick={() => handleTabChange('members')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all ${
            activeTab === 'members'
              ? 'bg-terracotta text-white shadow-xs'
              : 'bg-warm-surface border border-warm-border text-warm-gray hover:text-warm-charcoal hover:bg-warm-muted'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Manage Members</span>
        </button>

        <button
          onClick={() => handleTabChange('automation')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all ${
            activeTab === 'automation'
              ? 'bg-terracotta text-white shadow-xs'
              : 'bg-warm-surface border border-warm-border text-warm-gray hover:text-warm-charcoal hover:bg-warm-muted'
          }`}
        >
          <Mail className="w-4 h-4" />
          <span>Automation Logs</span>
        </button>

      </div>

      {/* Tab Contents */}
      {activeTab === 'rentals' && <RentalManager />}
      {activeTab === 'inventory' && <InventoryManager />}
      {activeTab === 'members' && <MemberManager />}
      
      {activeTab === 'automation' && (
        <div className="space-y-4">

          {/* Overdue Status Panel */}
          <div className="bg-warm-surface border border-warm-border rounded-3xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-warm-charcoal flex items-center gap-2">
                  <Eye className="w-4 h-4 text-terracotta" />
                  Live Overdue Status
                </h3>
                <p className="text-xs text-warm-gray mt-0.5">
                  All unreturned rentals past their due date — shows email history and what will happen on next audit.
                </p>
              </div>
              <button
                onClick={fetchOverdueStatus}
                disabled={loadingStatus}
                className="flex items-center gap-1.5 bg-warm-muted hover:bg-warm-border text-warm-charcoal text-xs font-semibold px-3 py-2 rounded-xl border border-warm-border transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingStatus ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            {overdueStatus ? (
              overdueStatus.rentals.length === 0 ? (
                <div className="text-center py-6">
                  <CheckCircle2 className="w-8 h-8 text-warm-success mx-auto mb-2" />
                  <p className="text-sm font-semibold text-warm-charcoal">No overdue rentals</p>
                  <p className="text-xs text-warm-gray">All borrowers are within their return window.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-3 text-xs text-warm-gray mb-3">
                    <span className="bg-warm-muted px-2 py-1 rounded-lg border border-warm-border font-mono">Schedule: {overdueStatus.cron_schedule}</span>
                    <span className="bg-warm-muted px-2 py-1 rounded-lg border border-warm-border font-mono">Mode: {overdueStatus.overdue_repeat_mode}</span>
                    <span className="bg-warm-muted px-2 py-1 rounded-lg border border-warm-border font-mono">Server date: {overdueStatus.server_date}</span>
                  </div>

                  {/* Table — desktop */}
                  <div className="hidden sm:block overflow-x-auto rounded-2xl border border-warm-border">
                    <table className="w-full text-xs">
                      <thead className="bg-warm-muted text-warm-gray">
                        <tr>
                          <th className="text-left px-4 py-2.5 font-semibold">Member</th>
                          <th className="text-left px-4 py-2.5 font-semibold">Item</th>
                          <th className="text-left px-4 py-2.5 font-semibold">Due Date</th>
                          <th className="text-center px-4 py-2.5 font-semibold">Days Overdue</th>
                          <th className="text-left px-4 py-2.5 font-semibold">Last Email Sent</th>
                          <th className="text-center px-4 py-2.5 font-semibold">Next Audit Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-warm-border">
                        {overdueStatus.rentals.map((r, i) => (
                          <tr key={i} className="bg-warm-surface hover:bg-warm-muted transition-colors">
                            <td className="px-4 py-3">
                              <p className="font-semibold text-warm-charcoal">{r.member_name}</p>
                              <p className="text-warm-gray">{r.member_email}</p>
                            </td>
                            <td className="px-4 py-3 text-warm-charcoal">{r.item_name}</td>
                            <td className="px-4 py-3 text-warm-danger font-mono">{r.return_due_date}</td>
                            <td className="px-4 py-3 text-center">
                              <span className="bg-warm-danger-bg text-warm-danger font-bold px-2 py-0.5 rounded-full">
                                {r.days_overdue}d
                              </span>
                            </td>
                            <td className="px-4 py-3 font-mono text-warm-gray">
                              {r.last_overdue_email_sent || <span className="italic text-warm-subtle">Never</span>}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {r.will_email_be_skipped ? (
                                <span className="flex items-center justify-center gap-1 text-warm-gray">
                                  <XCircle className="w-3.5 h-3.5" />
                                  <span>Skip</span>
                                </span>
                              ) : (
                                <span className="flex items-center justify-center gap-1 text-warm-success font-semibold">
                                  <Send className="w-3.5 h-3.5" />
                                  <span>Will Email</span>
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Cards — mobile */}
                  <div className="sm:hidden space-y-2">
                    {overdueStatus.rentals.map((r, i) => (
                      <div key={i} className="bg-warm-muted border border-warm-border rounded-2xl p-3 space-y-1">
                        <div className="flex justify-between items-start">
                          <p className="font-bold text-warm-charcoal text-xs">{r.member_name}</p>
                          {r.will_email_be_skipped ? (
                            <span className="text-[10px] text-warm-gray flex items-center gap-0.5"><XCircle className="w-3 h-3" />Skip</span>
                          ) : (
                            <span className="text-[10px] text-warm-success font-bold flex items-center gap-0.5"><Send className="w-3 h-3" />Will Email</span>
                          )}
                        </div>
                        <p className="text-xs text-warm-gray">{r.item_name}</p>
                        <p className="text-xs text-warm-danger">Due: {r.return_due_date} ({r.days_overdue}d overdue)</p>
                        <p className="text-[10px] text-warm-subtle">Last notified: {r.last_overdue_email_sent || 'Never'}</p>
                        {r.will_email_be_skipped && r.skip_reason && (
                          <p className="text-[10px] text-warm-gray italic">{r.skip_reason}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )
            ) : (
              <div className="text-center py-6">
                <p className="text-xs text-warm-gray italic">
                  {loadingStatus ? 'Loading overdue status...' : 'Click Refresh to load overdue rental status.'}
                </p>
              </div>
            )}
          </div>

          {/* Cron / Audit Controls */}
          <div className="bg-warm-surface border border-warm-border rounded-3xl p-6 space-y-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-warm-charcoal">Daily Cron Job &amp; Nodemailer Automation</h3>
                <p className="text-xs text-warm-gray">Configured to run daily with automatic return reminders and overdue notice emails via Gmail SMTP.</p>
              </div>
              <button
                onClick={handleManualCron}
                className="bg-terracotta hover:bg-terracotta-hover text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-xs"
              >
                Run Audit Now
              </button>
            </div>

            <div className="bg-warm-muted border border-warm-border rounded-2xl p-4 space-y-3 font-mono text-xs text-warm-charcoal">
              <p className="text-warm-success font-bold">Cron Status: ACTIVE (node-cron) + Startup Check</p>
              <p className="text-warm-gray">SMTP Host: smtp.gmail.com:587 (App Password Auth)</p>
              <p className="text-warm-gray">💡 Overdue check also runs automatically 2s after each server restart.</p>

              {auditLogs ? (
                <div className="mt-4 pt-4 border-t border-warm-border space-y-4">
                  {/* Overdue Check Results */}
                  {auditLogs.overdue_check?.data && (
                    <div className="space-y-2">
                      <p className="text-warm-charcoal font-bold">
                        📋 Overdue Check ({auditLogs.overdue_check.data.total_overdue} item(s) checked):
                      </p>
                      {auditLogs.overdue_check.data.results?.length > 0 ? (
                        auditLogs.overdue_check.data.results.map((r, i) => (
                          <div key={i} className={`p-3 rounded-xl border space-y-1 ${r.email_sent ? 'bg-warm-surface border-warm-success-border' : 'bg-warm-danger-bg border-warm-danger-border'}`}>
                            <div className="flex items-center justify-between">
                              <p className="text-warm-charcoal font-bold">{r.member_name} ({r.member_email})</p>
                              {r.email_sent ? (
                                <span className="text-warm-success flex items-center space-x-1 text-[11px]"><CheckCircle2 className="w-3.5 h-3.5" /><span>Delivered</span></span>
                              ) : (
                                <span className="text-warm-danger flex items-center space-x-1 text-[11px]"><XCircle className="w-3.5 h-3.5" /><span>{r.skipped ? 'Skipped' : 'Failed'}</span></span>
                              )}
                            </div>
                            <p className="text-warm-gray">Item: {r.item_name} | Overdue: {r.days_overdue} day(s)</p>
                            {r.skip_reason && <p className="text-warm-subtle text-[10px] italic">Reason: {r.skip_reason}</p>}
                            {r.message_id && <p className="text-warm-success/80 text-[10px]">Message-ID: {r.message_id}</p>}
                            {r.email_error && <p className="text-warm-danger text-[10px]">Error: {r.email_error}</p>}
                          </div>
                        ))
                      ) : (
                        <p className="text-warm-subtle italic">No overdue notices sent in this run.</p>
                      )}
                    </div>
                  )}

                  {/* Reminder Check Results */}
                  {auditLogs.reminder_check?.data && (
                    <div className="space-y-2 pt-2 border-t border-warm-border">
                      <p className="text-warm-charcoal font-bold">
                        ⏰ Return Reminder Check ({auditLogs.reminder_check.data.total_checked} item(s) checked):
                      </p>
                      {auditLogs.reminder_check.data.results?.length > 0 ? (
                        auditLogs.reminder_check.data.results.map((r, i) => (
                          <div key={i} className={`p-3 rounded-xl border space-y-1 ${r.email_sent ? 'bg-warm-surface border-warm-success-border' : 'bg-warm-danger-bg border-warm-danger-border'}`}>
                            <div className="flex items-center justify-between">
                              <p className="text-warm-charcoal font-bold">{r.member_name} ({r.member_email})</p>
                              {r.email_sent ? (
                                <span className="text-warm-success flex items-center space-x-1 text-[11px]"><CheckCircle2 className="w-3.5 h-3.5" /><span>Delivered</span></span>
                              ) : (
                                <span className="text-warm-danger flex items-center space-x-1 text-[11px]"><XCircle className="w-3.5 h-3.5" /><span>Failed</span></span>
                              )}
                            </div>
                            <p className="text-warm-gray">Item: {r.item_name} | Due Date: {r.return_due_date}</p>
                            {r.message_id && <p className="text-warm-success/80 text-[10px]">Message-ID: {r.message_id}</p>}
                            {r.email_error && <p className="text-warm-danger text-[10px]">Error: {r.email_error}</p>}
                          </div>
                        ))
                      ) : (
                        <p className="text-warm-subtle italic">No upcoming return reminders due today.</p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-warm-subtle italic mt-2">No manual audit log triggered in this session yet. Click "Run Audit Now" to inspect live email generation.</p>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
