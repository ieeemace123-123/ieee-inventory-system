import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { Check, ExternalLink, Package, RefreshCw, Search, X } from 'lucide-react';

const VALIDATOR_URL = 'https://services24.ieee.org/membership-validator.html';

export default function PublicCatalog() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/items', { params: { search, category } });
      setItems(response.data);
    } finally {
      setLoading(false);
    }
  }, [search, category]);

  useEffect(() => {
    api.get('/items/categories').then(({ data }) => setCategories(['All', ...data]));
  }, []);

  useEffect(() => {
    const timer = setTimeout(fetchItems, 180);
    return () => clearTimeout(timer);
  }, [fetchItems]);

  const availableCount = useMemo(() => items.filter(item => item.available_qty > 0).length, [items]);

  return (
    <div className="space-y-6 pb-10">
      <section className="grid gap-5 border-b border-warm-border pb-6 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <p className="mb-2 text-sm font-semibold text-terracotta">IEEE MACE SB</p>
          <h1 className="max-w-3xl text-3xl font-bold tracking-tight text-warm-charcoal sm:text-4xl">Equipment, without the clutter.</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-warm-gray">Check live availability for components and lab equipment managed by the IEEE MACE Student Branch.</p>
        </div>
        <a href={VALIDATOR_URL} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-lg border border-terracotta-border bg-terracotta-light px-4 py-2.5 text-sm font-semibold text-terracotta hover:bg-white">
          Verify IEEE membership <ExternalLink className="h-4 w-4" />
        </a>
      </section>

      <div className="flex flex-wrap items-center gap-3 text-sm text-warm-gray">
        <span><strong className="text-warm-charcoal">{items.length}</strong> item types</span>
        <span className="text-warm-border">•</span>
        <span><strong className="text-warm-success">{availableCount}</strong> currently available</span>
      </div>

      <section className="grid gap-3 md:grid-cols-[minmax(240px,1fr)_auto]">
        <label className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-warm-subtle" />
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search inventory" className="w-full rounded-lg border border-warm-border bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-terracotta" />
        </label>
        <div className="flex items-center gap-2 overflow-x-auto">
          {categories.map(value => (
            <button key={value} onClick={() => setCategory(value)} className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium ${category === value ? 'bg-terracotta text-white' : 'border border-warm-border bg-white text-warm-gray hover:bg-warm-muted'}`}>
              {value}
            </button>
          ))}
          <button onClick={fetchItems} className="rounded-lg border border-warm-border p-2 text-warm-gray hover:bg-warm-muted" aria-label="Refresh inventory">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </section>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map(index => <div key={index} className="h-36 animate-pulse rounded-xl border border-warm-border bg-white" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-warm-border bg-white p-10 text-center text-sm text-warm-gray">No items match the current filters.</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map(item => (
            <button key={item.id} onClick={() => setSelectedItem(item)} className="group rounded-xl border border-warm-border bg-white p-4 text-left transition hover:border-terracotta-border">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-warm-charcoal">{item.name}</p>
                  <p className="mt-1 text-xs text-warm-gray">{item.category}</p>
                </div>
                <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold ${item.available_qty > 0 ? 'bg-warm-success-bg text-warm-success' : 'bg-warm-danger-bg text-warm-danger'}`}>
                  {item.available_qty > 0 ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                  {item.available_qty > 0 ? `${item.available_qty} available` : 'Unavailable'}
                </span>
              </div>
              <p className="mt-4 line-clamp-2 text-xs leading-5 text-warm-gray">{item.description || 'No description available.'}</p>
            </button>
          ))}
        </div>
      )}

      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-warm-charcoal/30 p-4" onClick={() => setSelectedItem(null)}>
          <div className="w-full max-w-md rounded-xl border border-warm-border bg-white p-5" onClick={event => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium text-terracotta">{selectedItem.category}</p>
                <h2 className="mt-1 text-xl font-bold text-warm-charcoal">{selectedItem.name}</h2>
              </div>
              <button onClick={() => setSelectedItem(null)} className="rounded-lg p-1.5 text-warm-gray hover:bg-warm-muted"><X className="h-4 w-4" /></button>
            </div>
            <p className="mt-4 text-sm leading-6 text-warm-gray">{selectedItem.description || 'No description available.'}</p>
            <div className="mt-5 flex items-center gap-2 border-t border-warm-border pt-4 text-sm">
              <Package className="h-4 w-4 text-terracotta" />
              <strong>{selectedItem.available_qty}</strong> available of {selectedItem.total_qty}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
