import React, { useCallback, useEffect, useState } from 'react';
import api from '../services/api';
import { ArrowRight, Check, ExternalLink, Package, Search, X } from 'lucide-react';

const VALIDATOR_URL = 'https://services24.ieee.org/membership-validator.html';

export default function PublicCatalog() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/items', { params: { search, category } });
      setItems(response.data);
    } catch {
      setError('Inventory is unavailable right now. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [search, category]);

  useEffect(() => {
    api.get('/items/categories')
      .then(({ data }) => setCategories(data))
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    const timer = setTimeout(fetchItems, 180);
    return () => clearTimeout(timer);
  }, [fetchItems]);

  return (
    <div className="mx-auto max-w-5xl pb-12">
      <section className="border-b border-warm-border py-8 sm:py-12">
        <p className="text-sm font-semibold text-terracotta">IEEE MACE SB</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-warm-charcoal sm:text-4xl">Borrow equipment</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-warm-gray">Find an available item and verify your IEEE membership. An admin will complete the rental.</p>

        <ol className="mt-7 grid max-w-2xl gap-3 text-sm sm:grid-cols-3" aria-label="How to borrow equipment">
          {[
            ['1', 'Choose an item'],
            ['2', 'Verify membership'],
            ['3', 'Complete with admin']
          ].map(([number, label]) => (
            <li key={number} className="flex items-center gap-3 rounded-lg border border-warm-border bg-white px-3 py-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-terracotta-light text-xs font-bold text-terracotta">{number}</span>
              <span className="font-medium text-warm-charcoal">{label}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="pt-7">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-terracotta">Step 1</p>
            <h2 className="mt-1 text-xl font-semibold text-warm-charcoal">Choose an item</h2>
          </div>
        </div>

        <div className="grid gap-3 rounded-xl border border-warm-border bg-white p-3 sm:grid-cols-[1fr_220px]">
          <label className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-warm-subtle" />
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Search equipment"
              className="w-full rounded-lg border border-warm-border bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-terracotta"
            />
          </label>
          <select
            value={category}
            onChange={event => setCategory(event.target.value)}
            aria-label="Filter by category"
            className="rounded-lg border border-warm-border bg-white px-3 py-2.5 text-sm text-warm-charcoal outline-none focus:border-terracotta"
          >
            <option value="All">All categories</option>
            {categories.map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-warm-danger-border bg-warm-danger-bg p-5 text-sm text-warm-danger">
            {error} <button onClick={fetchItems} className="ml-1 font-semibold underline">Try again</button>
          </div>
        ) : loading ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {[1, 2, 3, 4].map(index => <div key={index} className="h-24 animate-pulse rounded-xl border border-warm-border bg-white" />)}
          </div>
        ) : items.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-warm-border bg-white p-8 text-center text-sm text-warm-gray">No matching equipment.</div>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {items.map(item => {
              const available = item.available_qty > 0;
              return (
                <button
                  key={item.id}
                  onClick={() => setSelectedItem(item)}
                  className="group flex items-center justify-between gap-4 rounded-xl border border-warm-border bg-white p-4 text-left transition hover:border-terracotta-border"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-warm-charcoal">{item.name}</p>
                    <p className="mt-1 text-xs text-warm-gray">{item.category}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className={`text-xs font-medium ${available ? 'text-warm-success' : 'text-warm-danger'}`}>
                      {available ? `${item.available_qty} available` : 'Unavailable'}
                    </span>
                    <ArrowRight className="h-4 w-4 text-warm-subtle transition group-hover:translate-x-0.5 group-hover:text-terracotta" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-warm-charcoal/30 p-4" onClick={() => setSelectedItem(null)}>
          <div className="w-full max-w-md rounded-2xl border border-warm-border bg-white p-5" onClick={event => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-terracotta">Item selected</p>
                <h2 className="mt-1 text-xl font-semibold text-warm-charcoal">{selectedItem.name}</h2>
                <p className="mt-1 text-xs text-warm-gray">{selectedItem.category}</p>
              </div>
              <button onClick={() => setSelectedItem(null)} className="rounded-lg p-1.5 text-warm-gray hover:bg-warm-muted" aria-label="Close"><X className="h-4 w-4" /></button>
            </div>

            {selectedItem.description && <p className="mt-4 text-sm leading-6 text-warm-gray">{selectedItem.description}</p>}

            <div className={`mt-5 flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm ${selectedItem.available_qty > 0 ? 'bg-warm-success-bg text-warm-success' : 'bg-warm-danger-bg text-warm-danger'}`}>
              {selectedItem.available_qty > 0 ? <Check className="h-4 w-4" /> : <Package className="h-4 w-4" />}
              {selectedItem.available_qty > 0 ? `${selectedItem.available_qty} currently available` : 'This item is currently unavailable'}
            </div>

            {selectedItem.available_qty > 0 && (
              <div className="mt-5 border-t border-warm-border pt-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-terracotta">Step 2</p>
                <p className="mt-1 text-sm font-semibold text-warm-charcoal">Verify your IEEE membership</p>
                <a href={VALIDATOR_URL} target="_blank" rel="noreferrer" className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-terracotta px-4 py-2.5 text-sm font-semibold text-white hover:bg-terracotta-hover">
                  Open membership validator <ExternalLink className="h-4 w-4" />
                </a>
                <p className="mt-3 text-center text-xs text-warm-gray">Then ask an inventory admin to complete the rental.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
