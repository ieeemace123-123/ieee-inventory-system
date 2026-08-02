import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { Search, Filter, Cpu, CheckCircle, XCircle, Box, Info, RefreshCw } from 'lucide-react';

export default function PublicCatalog({ onOpenLoginModal }) {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState(null);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const res = await api.get('/items', {
        params: { search, category: selectedCategory }
      });
      setItems(res.data);
    } catch (err) {
      console.error('Error loading public inventory items:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const res = await api.get('/items/categories');
      setCategories(['All', ...res.data]);
    } catch (err) {
      console.error('Error fetching categories:', err);
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

  const totalInStock = items.filter(i => i.available_qty > 0).length;

  return (
    <div className="space-y-8 pb-12">
      
      {/* Hero Banner */}
      <div className="bg-gradient-to-br from-warm-surface via-warm-muted to-warm-bg border border-warm-border rounded-3xl p-6 sm:p-8 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-terracotta/5 rounded-full blur-3xl -z-10 pointer-events-none"></div>
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="max-w-2xl space-y-4">
            <div className="inline-flex items-center space-x-2 bg-terracotta-light border border-terracotta-border px-3 py-1 rounded-full text-xs font-semibold text-terracotta">
              <Cpu className="w-3.5 h-3.5" />
              <span>IEEE Student Branch Equipment Repository</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-warm-charcoal tracking-tight">
              Explore Physical Components & Equipment for Rental
            </h2>
            <p className="text-sm text-warm-gray leading-relaxed">
              Browse our lab's physical inventory of microcontrollers, sensors, testing instruments, and tools available for registered IEEE branch members. Check real-time stock availability below.
            </p>
          </div>
        </div>

        {/* Live Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-8 pt-6 border-t border-warm-border">
          <div className="bg-warm-surface border border-warm-border p-4 rounded-2xl shadow-xs">
            <p className="text-xs text-warm-gray font-medium">Total Inventory Types</p>
            <p className="text-2xl font-bold text-warm-charcoal mt-1">{items.length}</p>
          </div>
          <div className="bg-warm-surface border border-warm-border p-4 rounded-2xl shadow-xs">
            <p className="text-xs text-warm-gray font-medium">Ready in Stock</p>
            <p className="text-2xl font-bold text-warm-success mt-1">{totalInStock}</p>
          </div>
          <div className="col-span-2 sm:col-span-1 bg-warm-surface border border-warm-border p-4 rounded-2xl shadow-xs">
            <p className="text-xs text-warm-gray font-medium">Active Categories</p>
            <p className="text-2xl font-bold text-terracotta mt-1">{categories.length > 1 ? categories.length - 1 : 0}</p>
          </div>
        </div>
      </div>

      {/* Search & Filter Controls */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-warm-subtle absolute left-3.5 top-3.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search items by name, model, or description..."
            className="w-full bg-warm-surface border border-warm-border rounded-2xl py-3 pl-10 pr-4 text-sm text-warm-charcoal placeholder:text-warm-subtle focus:outline-none focus:border-terracotta focus:ring-1 focus:ring-terracotta transition-all shadow-xs"
          />
        </div>

        {/* Refresh & Filters */}
        <div className="flex items-center space-x-2">
          <button
            onClick={fetchItems}
            className="p-3 bg-warm-surface border border-warm-border hover:bg-warm-muted text-warm-gray hover:text-warm-charcoal rounded-2xl transition-all shadow-xs"
            title="Refresh Live Stock"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <div className="flex items-center space-x-1.5 overflow-x-auto py-1 scrollbar-none">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-all ${
                  selectedCategory === cat
                    ? 'bg-terracotta text-white shadow-xs'
                    : 'bg-warm-surface border border-warm-border text-warm-gray hover:text-warm-charcoal hover:bg-warm-muted'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

      </div>

      {/* Item Cards Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="bg-warm-surface border border-warm-border rounded-2xl p-5 h-64 animate-pulse"></div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="bg-warm-surface border border-warm-border rounded-3xl p-12 text-center max-w-md mx-auto shadow-xs">
          <Box className="w-12 h-12 text-warm-subtle mx-auto mb-3" />
          <h3 className="text-lg font-bold text-warm-charcoal">No Inventory Items Found</h3>
          <p className="text-xs text-warm-gray mt-1">Try adjusting your search keywords or category filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {items.map((item) => {
            const isInStock = item.available_qty > 0;
            return (
              <div
                key={item.id}
                className="bg-warm-surface border border-warm-border hover:border-terracotta-border rounded-2xl p-5 flex flex-col justify-between transition-all hover:shadow-md group"
              >
                <div>
                  
                  {/* Category Pill & Status Badge */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="text-[11px] font-semibold bg-warm-muted text-warm-gray px-2.5 py-1 rounded-lg border border-warm-border truncate">
                      {item.category}
                    </span>

                    {isInStock ? (
                      <span className="inline-flex items-center space-x-1 bg-warm-success-bg text-warm-success border border-warm-success-border text-xs font-semibold px-2.5 py-1 rounded-lg shrink-0">
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>In Stock ({item.available_qty})</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center space-x-1 bg-warm-danger-bg text-warm-danger border border-warm-danger-border text-xs font-semibold px-2.5 py-1 rounded-lg shrink-0">
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Out of Stock</span>
                      </span>
                    )}
                  </div>

                  {/* Title */}
                  <h3 className="text-base font-bold text-warm-charcoal group-hover:text-terracotta transition-colors line-clamp-1">
                    {item.name}
                  </h3>

                  {/* Description */}
                  <p className="text-xs text-warm-gray mt-2 line-clamp-3 leading-relaxed">
                    {item.description || 'No detailed specifications provided.'}
                  </p>

                </div>

                {/* Footer details & Action */}
                <div className="pt-4 mt-4 border-t border-warm-border-subtle flex items-center justify-between text-xs">
                  <div className="text-warm-subtle font-mono">
                    Total Qty: <span className="text-warm-charcoal font-semibold">{item.total_qty}</span>
                  </div>

                  <button
                    onClick={() => setSelectedItem(item)}
                    className="flex items-center space-x-1 text-terracotta hover:text-terracotta-hover font-semibold hover:underline"
                  >
                    <Info className="w-3.5 h-3.5" />
                    <span>View Spec</span>
                  </button>
                </div>

              </div>
            );
          })}
        </div>
      )}

      {/* Item Detail Modal */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-warm-charcoal/40 backdrop-blur-sm animate-fadeIn">
          <div className="bg-warm-surface border border-warm-border rounded-3xl max-w-lg w-full p-6 shadow-xl relative">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-xs font-medium bg-terracotta-light text-terracotta px-2.5 py-1 rounded-lg border border-terracotta-border">
                  {selectedItem.category}
                </span>
                <h3 className="text-xl font-bold text-warm-charcoal mt-2">{selectedItem.name}</h3>
              </div>
              <button
                onClick={() => setSelectedItem(null)}
                className="text-warm-gray hover:text-warm-charcoal p-1"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <h4 className="text-xs font-semibold text-warm-gray uppercase tracking-wider">Description & Details</h4>
                <p className="text-sm text-warm-charcoal mt-1 leading-relaxed bg-warm-muted p-3 rounded-xl border border-warm-border">
                  {selectedItem.description || 'No additional specifications listed.'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-warm-muted p-3 rounded-xl border border-warm-border">
                  <p className="text-xs text-warm-gray">Current Stock Status</p>
                  <p className={`text-sm font-bold mt-1 ${selectedItem.available_qty > 0 ? 'text-warm-success' : 'text-warm-danger'}`}>
                    {selectedItem.available_qty > 0 ? `In Stock (${selectedItem.available_qty} available)` : 'Out of Stock'}
                  </p>
                </div>
                <div className="bg-warm-muted p-3 rounded-xl border border-warm-border">
                  <p className="text-xs text-warm-gray">Total Owned Units</p>
                  <p className="text-sm font-bold text-warm-charcoal mt-1">{selectedItem.total_qty} Units</p>
                </div>
              </div>

              <div className="bg-terracotta-light border border-terracotta-border rounded-xl p-3 text-xs text-terracotta">
                💡 To rent this component, please contact an IEEE Admin with your registered IEEE Membership ID.
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setSelectedItem(null)}
                className="bg-warm-muted hover:bg-warm-border text-warm-charcoal text-xs font-semibold px-4 py-2 rounded-xl transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
