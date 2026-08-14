import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { LayoutDashboard, LogIn, LogOut, Menu, PackageSearch, X } from 'lucide-react';

export default function Navbar({ currentView, setCurrentView, onOpenLoginModal }) {
  const { admin, isAuthenticated, logout } = useAuth();
  const [open, setOpen] = useState(false);

  const navigate = (view) => {
    setOpen(false);
    if (view === 'admin' && !isAuthenticated) onOpenLoginModal();
    else setCurrentView(view);
  };

  const links = [
    { id: 'public', label: 'Inventory', icon: PackageSearch },
    { id: 'admin', label: 'Admin', icon: LayoutDashboard }
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-warm-border bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <button onClick={() => navigate('public')} className="flex items-center gap-3 text-left">
          <img src="/ieee-mace-logo.png" alt="IEEE MACE SB" className="h-10 w-auto object-contain" />
          <span className="hidden border-l border-warm-border pl-3 text-xs font-medium text-warm-gray sm:block">
            Inventory &amp; member services
          </span>
        </button>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary navigation">
          {links.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => navigate(id)}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                currentView === id ? 'bg-terracotta-light text-terracotta' : 'text-warm-gray hover:bg-warm-muted hover:text-warm-charcoal'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
          <span className="mx-2 h-6 w-px bg-warm-border" />
          {isAuthenticated ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-warm-gray">{admin?.username}</span>
              <button onClick={logout} className="rounded-lg p-2 text-warm-gray hover:bg-warm-muted hover:text-warm-danger" aria-label="Log out">
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button onClick={onOpenLoginModal} className="flex items-center gap-2 rounded-lg bg-terracotta px-3 py-2 text-sm font-semibold text-white hover:bg-terracotta-hover">
              <LogIn className="h-4 w-4" /> Admin login
            </button>
          )}
        </nav>

        <button onClick={() => setOpen(!open)} className="rounded-lg p-2 text-warm-charcoal hover:bg-warm-muted md:hidden" aria-label="Toggle menu">
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-warm-border bg-white p-3 md:hidden">
          <div className="space-y-1">
            {links.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => navigate(id)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-warm-charcoal hover:bg-warm-muted">
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
            <button onClick={isAuthenticated ? logout : onOpenLoginModal} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-terracotta hover:bg-terracotta-light">
              {isAuthenticated ? <LogOut className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
              {isAuthenticated ? 'Log out' : 'Admin login'}
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
