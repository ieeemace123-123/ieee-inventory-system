import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { Package, Plus, Search, Edit3, Trash2, CheckCircle, XCircle, AlertCircle, AlertTriangle, FileSpreadsheet, Upload, Download, FileCheck, X } from 'lucide-react';
import toast from 'react-hot-toast';

export default function InventoryManager() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [loading, setLoading] = useState(true);

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  // Bulk Excel Import State
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importFile, setImportFile]             = useState(null);
  const [importLoading, setImportLoading]       = useState(false);
  const [importResult, setImportResult]         = useState(null);
  const [importError, setImportError]           = useState('');

  // Delete Confirmation Modal
  const [deletingItem, setDeletingItem] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: 'Microcontrollers',
    total_qty: 5
  });
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const defaultCategories = [
    'Microcontrollers',
    'Sensors',
    'Actuators & Modules',
    'Testing Instruments',
    'Tools',
    'Power Supplies & Cables',
    'Wireless & IoT Modules'
  ];

  const fetchItems = async () => {
    setLoading(true);
    try {
      const res = await api.get('/items', { params: { search, category: selectedCategory } });
      setItems(res.data);
    } catch (err) {
      toast.error('Failed to load inventory items');
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const res = await api.get('/items/categories');
      const combined = Array.from(new Set([...defaultCategories, ...res.data]));
      setCategories(['All', ...combined]);
    } catch (err) {
      setCategories(['All', ...defaultCategories]);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchItems();
    }, 200);
    return () => clearTimeout(timer);
  }, [search, selectedCategory]);

  const handleOpenAdd = () => {
    setFormData({
      name: '',
      description: '',
      category: 'Microcontrollers',
      total_qty: 5
    });
    setFormError('');
    setIsAddModalOpen(true);
  };

  const handleOpenEdit = (item) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      description: item.description || '',
      category: item.category,
      total_qty: item.total_qty
    });
    setFormError('');
  };

  const handleSaveItem = async (e) => {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);

    try {
      if (editingItem) {
        await api.put(`/items/${editingItem.id}`, formData);
        toast.success('Inventory item updated!');
        setEditingItem(null);
      } else {
        await api.post('/items', formData);
        toast.success('New inventory item added!');
        setIsAddModalOpen(false);
      }
      fetchItems();
      fetchCategories();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Failed to save item details.');
    } finally {
      setSubmitting(false);
    }
  };

  // Opens the custom confirmation modal
  const handleDeleteClick = (item) => {
    setDeletingItem(item);
  };

  const handleConfirmDelete = async () => {
    if (!deletingItem) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/items/${deletingItem.id}`);
      toast.success(`"${deletingItem.name}" has been removed from inventory.`);
      setDeletingItem(null);
      fetchItems();
      fetchCategories();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete item.');
      setDeletingItem(null);
    } finally {
      setDeleteLoading(false);
    }
  };

  // ── Download Sample Inventory Excel Template ───────────────────────────────
  const handleDownloadTemplate = async () => {
    try {
      toast.loading('Generating sample inventory template...', { id: 'inv-template' });
      const res = await api.get('/items/sample-template', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'IEEE_Inventory_Import_Template.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Sample inventory template downloaded!', { id: 'inv-template' });
    } catch (err) {
      toast.error('Failed to download template.', { id: 'inv-template' });
    }
  };

  // ── Import Inventory via Excel Upload ─────────────────────────────────────
  const handleInventoryImport = async (e) => {
    e.preventDefault();
    setImportError('');
    setImportResult(null);

    if (!importFile) {
      setImportError('Please select an Excel file (.xlsx, .xls, .csv) to upload.');
      return;
    }

    const ext = importFile.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext)) {
      setImportError('Invalid file type. Please upload a .xlsx, .xls, or .csv file.');
      return;
    }

    if (importFile.size > 10 * 1024 * 1024) {
      setImportError('File size exceeds the 10MB limit.');
      return;
    }

    const formData = new FormData();
    formData.append('file', importFile);

    setImportLoading(true);
    try {
      const res = await api.post('/items/bulk-import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setImportResult(res.data);
      toast.success(res.data.message || 'Inventory import completed!');
      fetchItems();
      fetchCategories();
    } catch (err) {
      setImportError(err.response?.data?.error || 'Failed to process Excel file import.');
    } finally {
      setImportLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-warm-surface border border-warm-border p-6 rounded-3xl shadow-sm">
        <div>
          <div className="flex items-center space-x-2 text-terracotta text-xs font-semibold uppercase tracking-wider">
            <Package className="w-4 h-4" />
            <span>Inventory Management</span>
          </div>
          <h2 className="text-xl font-bold text-warm-charcoal mt-1">Physical Inventory & Component Stock</h2>
          <p className="text-xs text-warm-gray">Add equipment, update total quantities, and inspect stock availability.</p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => { setImportFile(null); setImportError(''); setImportResult(null); setIsImportModalOpen(true); }}
            className="flex items-center space-x-2 bg-warm-muted hover:bg-warm-border text-warm-charcoal border border-warm-border text-xs font-bold px-4 py-2.5 rounded-xl transition-all shadow-xs"
          >
            <FileSpreadsheet className="w-4 h-4 text-terracotta" />
            <span>Import from Excel</span>
          </button>

          <button
            onClick={handleOpenAdd}
            className="flex items-center space-x-2 bg-terracotta hover:bg-terracotta-hover text-white font-semibold text-xs px-4 py-2.5 rounded-xl shadow-xs transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Inventory Item</span>
          </button>
        </div>
      </div>

      {/* Search & Category Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-warm-subtle absolute left-3.5 top-3.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search items by name or description..."
            className="w-full bg-warm-surface border border-warm-border rounded-2xl py-3 pl-10 pr-4 text-sm text-warm-charcoal placeholder:text-warm-subtle focus:outline-none focus:border-terracotta shadow-xs"
          />
        </div>

        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="bg-warm-surface border border-warm-border rounded-2xl py-3 px-4 text-sm text-warm-charcoal focus:outline-none focus:border-terracotta shadow-xs"
        >
          {categories.map((cat) => (
            <option key={cat} value={cat}>{cat === 'All' ? 'All Categories' : cat}</option>
          ))}
        </select>
      </div>

      {/* Inventory Display: Mobile Cards + Desktop Table */}
      <div className="bg-warm-surface border border-warm-border rounded-3xl overflow-hidden shadow-sm">
        
        {/* Mobile View: Stacked Cards (Visible on screens < md) */}
        <div className="block md:hidden divide-y divide-warm-border-subtle">
          {loading ? (
            <div className="py-8 text-center text-warm-subtle text-xs">Loading inventory items...</div>
          ) : items.length === 0 ? (
            <div className="py-8 text-center text-warm-subtle text-xs">No inventory items match search criteria.</div>
          ) : (
            items.map((item) => {
              const isInStock = item.available_qty > 0;
              return (
                <div key={item.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold text-warm-charcoal text-sm">{item.name}</p>
                      <span className="inline-block bg-warm-muted text-warm-gray text-[11px] px-2 py-0.5 rounded border border-warm-border font-semibold mt-1">
                        {item.category}
                      </span>
                    </div>
                    {isInStock ? (
                      <span className="inline-flex items-center space-x-1 bg-warm-success-bg text-warm-success border border-warm-success-border px-2 py-0.5 rounded-lg text-xs font-bold shrink-0">
                        <CheckCircle className="w-3 h-3" />
                        <span>In Stock</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center space-x-1 bg-warm-danger-bg text-warm-danger border border-warm-danger-border px-2 py-0.5 rounded-lg text-xs font-bold shrink-0">
                        <XCircle className="w-3 h-3" />
                        <span>Out of Stock</span>
                      </span>
                    )}
                  </div>

                  {item.description && (
                    <p className="text-warm-gray text-xs line-clamp-2">{item.description}</p>
                  )}

                  <div className="grid grid-cols-2 gap-2 bg-warm-muted p-2.5 rounded-xl border border-warm-border text-xs">
                    <div>
                      <span className="text-warm-gray">Total Qty:</span> <strong className="text-warm-charcoal">{item.total_qty}</strong>
                    </div>
                    <div>
                      <span className="text-warm-gray">Available:</span> <strong className="text-warm-success">{item.available_qty}</strong>
                    </div>
                  </div>

                  <div className="flex items-center justify-end space-x-2 pt-1">
                    <button
                      onClick={() => handleOpenEdit(item)}
                      className="flex-1 flex items-center justify-center space-x-1 py-2 bg-warm-surface hover:bg-warm-muted text-warm-charcoal text-xs font-semibold rounded-xl border border-warm-border"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </button>
                    <button
                      onClick={() => handleDeleteClick(item)}
                      className="flex-1 flex items-center justify-center space-x-1 py-2 bg-warm-surface hover:bg-warm-danger-bg text-warm-danger text-xs font-semibold rounded-xl border border-warm-border"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
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
                <th className="py-4 px-6">Item Name</th>
                <th className="py-4 px-6">Category</th>
                <th className="py-4 px-6">Total Qty</th>
                <th className="py-4 px-6">Available Qty</th>
                <th className="py-4 px-6">Live Status</th>
                <th className="py-4 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-warm-border-subtle font-medium">
              {loading ? (
                <tr>
                  <td colSpan="6" className="py-8 text-center text-warm-subtle">Loading inventory items...</td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-8 text-center text-warm-subtle">No inventory items match search criteria.</td>
                </tr>
              ) : (
                items.map((item) => {
                  const isInStock = item.available_qty > 0;
                  return (
                    <tr key={item.id} className="hover:bg-warm-surface-hover transition-colors">
                      <td className="py-4 px-6">
                        <p className="font-bold text-warm-charcoal text-sm">{item.name}</p>
                        <p className="text-warm-gray text-xs mt-0.5 line-clamp-1 max-w-xs">{item.description}</p>
                      </td>
                      <td className="py-4 px-6">
                        <span className="bg-warm-muted text-warm-gray px-2.5 py-1 rounded-lg border border-warm-border font-semibold">
                          {item.category}
                        </span>
                      </td>
                      <td className="py-4 px-6 font-bold text-warm-charcoal text-sm">{item.total_qty}</td>
                      <td className="py-4 px-6 font-bold text-warm-success text-sm">{item.available_qty}</td>
                      <td className="py-4 px-6">
                        {isInStock ? (
                          <span className="inline-flex items-center space-x-1 bg-warm-success-bg text-warm-success border border-warm-success-border px-2.5 py-1 rounded-lg font-bold">
                            <CheckCircle className="w-3.5 h-3.5" />
                            <span>In Stock ({item.available_qty})</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 bg-warm-danger-bg text-warm-danger border border-warm-danger-border px-2.5 py-1 rounded-lg font-bold">
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Out of Stock</span>
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-6 text-right space-x-2">
                        <button
                          onClick={() => handleOpenEdit(item)}
                          className="p-2 bg-warm-muted hover:bg-warm-border text-warm-charcoal rounded-xl transition-all"
                          title="Edit Item"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteClick(item)}
                          className="p-2 bg-warm-muted hover:bg-warm-danger-bg text-warm-gray hover:text-warm-danger rounded-xl transition-all"
                          title="Delete Item"
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

      {/* Add / Edit Item Modal */}
      {(isAddModalOpen || editingItem) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-warm-charcoal/40 backdrop-blur-sm">
          <div className="bg-warm-surface border border-warm-border rounded-3xl max-w-md w-full p-6 shadow-xl relative max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-warm-charcoal mb-4">
              {editingItem ? 'Edit Inventory Item' : 'Add New Inventory Item'}
            </h3>

            {formError && (
              <div className="bg-warm-danger-bg border border-warm-danger-border text-warm-danger p-3 rounded-xl mb-4 text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSaveItem} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-warm-charcoal mb-1">Item Name</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Raspberry Pi 4 Model B"
                  className="w-full bg-warm-muted border border-warm-border rounded-xl py-2.5 px-3 text-sm text-warm-charcoal focus:outline-none focus:border-terracotta"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-warm-charcoal mb-1">Category</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full bg-warm-muted border border-warm-border rounded-xl py-2.5 px-3 text-sm text-warm-charcoal focus:outline-none focus:border-terracotta"
                >
                  {defaultCategories.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-warm-charcoal mb-1">Total Quantity Owned</label>
                <input
                  type="number"
                  required
                  min="0"
                  value={formData.total_qty}
                  onChange={(e) => setFormData({ ...formData, total_qty: e.target.value })}
                  className="w-full bg-warm-muted border border-warm-border rounded-xl py-2.5 px-3 text-sm font-bold text-warm-charcoal focus:outline-none focus:border-terracotta"
                />
                {!editingItem && (
                  <p className="text-[11px] text-warm-gray mt-1">Available quantity will automatically equal total quantity for new items.</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-warm-charcoal mb-1">Description & Specifications</label>
                <textarea
                  rows="3"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Technical specs, CPU specs, voltage rating, etc."
                  className="w-full bg-warm-muted border border-warm-border rounded-xl py-2.5 px-3 text-sm text-warm-charcoal focus:outline-none focus:border-terracotta"
                ></textarea>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddModalOpen(false);
                    setEditingItem(null);
                  }}
                  className="px-4 py-2 bg-warm-muted text-warm-charcoal text-xs font-semibold rounded-xl hover:bg-warm-border"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-terracotta hover:bg-terracotta-hover text-white text-xs font-semibold rounded-xl shadow-xs"
                >
                  {submitting ? 'Saving...' : 'Save Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-warm-charcoal/40 backdrop-blur-sm">
          <div className="bg-warm-surface border border-warm-danger-border rounded-3xl max-w-sm w-full p-6 shadow-xl">
            {/* Icon */}
            <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-warm-danger-bg border border-warm-danger-border mx-auto mb-4">
              <AlertTriangle className="w-7 h-7 text-warm-danger" />
            </div>

            <h3 className="text-lg font-bold text-warm-charcoal text-center mb-1">Delete Inventory Item?</h3>
            <p className="text-warm-gray text-xs text-center mb-4">
              Are you sure you want to permanently delete{' '}
              <span className="font-bold text-warm-charcoal">"{deletingItem.name}"</span>{' '}
              from inventory? This action cannot be undone.
            </p>
            {deletingItem.available_qty < deletingItem.total_qty && (
              <div className="bg-warm-danger-bg border border-warm-danger-border rounded-xl p-3 mb-4 text-xs text-warm-danger flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  <strong>Warning:</strong> {deletingItem.total_qty - deletingItem.available_qty} unit(s) of this item are currently rented out. The server will block deletion until all units are returned.
                </span>
              </div>
            )}

            <div className="flex items-center justify-center space-x-3">
              <button
                onClick={() => setDeletingItem(null)}
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
                <span>{deleteLoading ? 'Deleting...' : 'Yes, Delete'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bulk Inventory Excel Import Modal ── */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-warm-charcoal/40 backdrop-blur-sm">
          <div className="bg-warm-surface border border-warm-border rounded-3xl max-w-2xl w-full p-6 shadow-xl relative max-h-[92vh] overflow-y-auto">

            {/* Modal Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-terracotta-light border border-terracotta-border rounded-2xl text-terracotta">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-warm-charcoal">Import Inventory via Excel</h3>
                  <p className="text-xs text-warm-gray">Bulk add new components or update stock of existing items.</p>
                </div>
              </div>
              <button
                onClick={() => setIsImportModalOpen(false)}
                className="p-2 text-warm-gray hover:text-warm-charcoal rounded-xl hover:bg-warm-muted transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Step 1: Template Download Banner */}
            <div className="bg-warm-muted border border-warm-border rounded-2xl p-4 mb-4 flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-xs font-bold text-warm-charcoal">Need the correct column format?</p>
                <p className="text-[11px] text-warm-gray">
                  Expected columns: <code className="text-terracotta font-mono">Component Name</code>, <code className="text-terracotta font-mono">Category</code>, <code className="text-terracotta font-mono">Quantity</code>, <code className="text-terracotta font-mono">Description</code>
                </p>
              </div>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="flex items-center space-x-1.5 bg-warm-surface hover:bg-warm-border text-warm-charcoal text-xs font-semibold px-3 py-2 rounded-xl border border-warm-border transition-all shrink-0 shadow-xs"
              >
                <Download className="w-3.5 h-3.5 text-terracotta" />
                <span>Template .xlsx</span>
              </button>
            </div>

            {/* Error Banner */}
            {importError && (
              <div className="flex items-start space-x-2 bg-warm-danger-bg border border-warm-danger-border text-warm-danger p-3 rounded-xl mb-4 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{importError}</span>
              </div>
            )}

            {/* Upload Form */}
            <form onSubmit={handleInventoryImport} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-warm-charcoal mb-1.5">Select Excel / CSV File</label>
                <div className="relative border-2 border-dashed border-warm-border hover:border-terracotta bg-warm-muted/50 rounded-2xl p-6 text-center transition-colors">
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={e => setImportFile(e.target.files[0] || null)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="space-y-2 pointer-events-none">
                    <Upload className="w-8 h-8 text-warm-subtle mx-auto" />
                    {importFile ? (
                      <div>
                        <p className="text-xs font-bold text-terracotta flex items-center justify-center space-x-1">
                          <FileCheck className="w-4 h-4" />
                          <span>{importFile.name}</span>
                        </p>
                        <p className="text-[10px] text-warm-gray mt-0.5">{(importFile.size / 1024).toFixed(1)} KB — Click or drag to change</p>
                      </div>
                    ) : (
                      <div>
                        <p className="text-xs font-semibold text-warm-charcoal">Click to upload or drag & drop</p>
                        <p className="text-[10px] text-warm-gray">Supports .xlsx, .xls, .csv up to 10MB</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-1">
                <button
                  type="button"
                  onClick={() => setIsImportModalOpen(false)}
                  className="px-4 py-2.5 bg-warm-muted text-warm-charcoal text-xs font-semibold rounded-xl hover:bg-warm-border transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={importLoading || !importFile}
                  className="px-5 py-2.5 bg-terracotta hover:bg-terracotta-hover disabled:opacity-40 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center space-x-2"
                >
                  <Upload className="w-4 h-4" />
                  <span>{importLoading ? 'Importing Items...' : 'Upload & Import Inventory'}</span>
                </button>
              </div>
            </form>

            {/* Summary & Per-Row Breakdown Results */}
            {importResult && (
              <div className="mt-6 pt-5 border-t border-warm-border space-y-4">
                
                {/* Status Message */}
                <div className="bg-warm-muted p-3.5 rounded-2xl border border-warm-border">
                  <p className="text-xs font-bold text-warm-charcoal">{importResult.message}</p>
                </div>

                {/* Summary Stat Badges */}
                {importResult.summary && (
                  <div className="grid grid-cols-4 gap-2 text-center text-xs">
                    <div className="bg-warm-muted border border-warm-border p-2.5 rounded-xl">
                      <p className="text-[10px] text-warm-gray uppercase font-bold">Total Rows</p>
                      <p className="text-lg font-extrabold text-warm-charcoal mt-0.5">{importResult.summary.total_rows}</p>
                    </div>
                    <div className="bg-warm-success-bg border border-warm-success-border p-2.5 rounded-xl">
                      <p className="text-[10px] text-warm-success uppercase font-bold">✅ Added</p>
                      <p className="text-lg font-extrabold text-warm-success mt-0.5">{importResult.summary.added}</p>
                    </div>
                    <div className="bg-terracotta-light border border-terracotta-border p-2.5 rounded-xl">
                      <p className="text-[10px] text-terracotta uppercase font-bold">🔄 Updated</p>
                      <p className="text-lg font-extrabold text-terracotta mt-0.5">{importResult.summary.updated}</p>
                    </div>
                    <div className="bg-warm-danger-bg border border-warm-danger-border p-2.5 rounded-xl">
                      <p className="text-[10px] text-warm-danger uppercase font-bold">❌ Failed</p>
                      <p className="text-lg font-extrabold text-warm-danger mt-0.5">{importResult.summary.failed}</p>
                    </div>
                  </div>
                )}

                {/* Per-Row Detailed Results Table */}
                {importResult.details && importResult.details.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-warm-charcoal mb-2">Per-Row Processing Log:</p>
                    <div className="bg-warm-muted border border-warm-border rounded-2xl overflow-hidden max-h-48 overflow-y-auto">
                      <table className="w-full text-[11px]">
                        <thead>
                          <tr className="border-b border-warm-border bg-warm-surface text-warm-gray">
                            <th className="px-3 py-2 text-left">Row</th>
                            <th className="px-3 py-2 text-left">Item Name</th>
                            <th className="px-3 py-2 text-center">Action</th>
                            <th className="px-3 py-2 text-left">Reason / Details</th>
                          </tr>
                        </thead>
                          <tbody className="divide-y divide-warm-border-subtle">
                          {importResult.details.map((d, idx) => (
                            <tr key={idx} className="hover:bg-warm-surface-hover">
                              <td className="px-3 py-2 text-warm-subtle font-mono">#{d.row_number}</td>
                              <td className="px-3 py-2 text-warm-charcoal font-bold">{d.item_name}</td>
                              <td className="px-3 py-2 text-center">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                                  d.action === 'added'
                                    ? 'bg-warm-success-bg text-warm-success border border-warm-success-border'
                                    : d.action === 'updated'
                                    ? 'bg-terracotta-light text-terracotta border border-terracotta-border'
                                    : 'bg-warm-danger-bg text-warm-danger border border-warm-danger-border'
                                }`}>
                                  {d.action === 'added' ? '✅ Added' : d.action === 'updated' ? '🔄 Updated' : '❌ Failed'}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-warm-gray">{d.reason}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

              </div>
            )}

          </div>
        </div>
      )}

    </div>
  );
}
