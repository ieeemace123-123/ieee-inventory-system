import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { ShieldCheck, LogIn, LogOut, Cpu, LayoutDashboard, Store, Menu, X } from 'lucide-react';

export default function Navbar({ currentView, setCurrentView, onOpenLoginModal }) {
  const { admin, isAuthenticated, logout } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleNavigate = (view) => {
    setCurrentView(view);
    setIsMobileMenuOpen(false);
  };

  return (
    <header className="bg-warm-surface/90 backdrop-blur-md border-b border-warm-border sticky top-0 z-40 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20">
          
          {/* Logo & Title */}
          <div className="flex items-center space-x-2.5 sm:space-x-3 cursor-pointer select-none" onClick={() => handleNavigate('public')}>
            <div className="p-2 sm:p-2.5 bg-terracotta-light text-terracotta rounded-xl border border-terracotta-border shadow-xs shrink-0">
              <Cpu className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-extrabold text-warm-charcoal truncate">
                IEEE Inventory Rental
              </h1>
              <p className="text-[10px] sm:text-xs text-warm-gray truncate hidden sm:block">MACE Component Lab</p>
            </div>
          </div>

          {/* Desktop Navigation & Controls (hidden on mobile/tablet) */}
          <div className="hidden md:flex items-center space-x-3">
            
            {/* View Switcher */}
            <div className="flex items-center bg-warm-muted p-1 rounded-xl border border-warm-border">
              <button
                onClick={() => setCurrentView('public')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  currentView === 'public'
                    ? 'bg-terracotta text-white shadow-xs'
                    : 'text-warm-gray hover:text-warm-charcoal'
                }`}
              >
                <Store className="w-3.5 h-3.5" />
                <span>Public Catalog</span>
              </button>

              <button
                onClick={() => {
                  if (isAuthenticated) {
                    setCurrentView('admin');
                  } else {
                    onOpenLoginModal();
                  }
                }}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  currentView === 'admin'
                    ? 'bg-terracotta text-white shadow-xs'
                    : 'text-warm-gray hover:text-warm-charcoal'
                }`}
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                <span>Admin Portal</span>
                {isAuthenticated && (
                  <span className="w-2 h-2 rounded-full bg-warm-success animate-pulse"></span>
                )}
              </button>
            </div>

            {/* Auth Action */}
            {isAuthenticated ? (
              <div className="flex items-center space-x-2 pl-2 border-l border-warm-border">
                <div className="flex items-center space-x-1.5 bg-warm-success-bg text-warm-success px-2.5 py-1 rounded-lg border border-warm-success-border text-xs">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span className="font-medium">Admin: {admin?.username}</span>
                </div>
                <button
                  onClick={logout}
                  className="p-2 text-warm-gray hover:text-warm-danger hover:bg-warm-danger-bg rounded-lg border border-transparent hover:border-warm-danger-border transition-all"
                  title="Logout Admin"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={onOpenLoginModal}
                className="flex items-center space-x-1.5 bg-terracotta hover:bg-terracotta-hover text-white text-xs font-semibold px-3.5 py-2 rounded-xl shadow-xs border border-terracotta-border transition-all hover:scale-105 active:scale-95"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Admin Login</span>
              </button>
            )}

          </div>

          {/* Hamburger Menu Button (visible on mobile & tablet: < md) */}
          <div className="flex items-center md:hidden">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2 rounded-xl bg-warm-muted text-warm-charcoal hover:bg-warm-border border border-warm-border focus:outline-none"
              aria-label="Toggle Navigation Menu"
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>

        </div>
      </div>

      {/* Mobile & Tablet Collapsible Drawer */}
      {isMobileMenuOpen && (
        <div className="md:hidden border-t border-warm-border bg-warm-surface px-4 pt-3 pb-4 space-y-3 shadow-lg animate-in slide-in-from-top-2 duration-200">
          <div className="flex flex-col space-y-2">
            <button
              onClick={() => handleNavigate('public')}
              className={`flex items-center justify-between w-full px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                currentView === 'public'
                  ? 'bg-terracotta text-white shadow-xs'
                  : 'bg-warm-muted text-warm-gray hover:bg-warm-border hover:text-warm-charcoal'
              }`}
            >
              <div className="flex items-center space-x-2">
                <Store className="w-4 h-4" />
                <span>Public Catalog</span>
              </div>
              {currentView === 'public' && <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-md">Active</span>}
            </button>

            <button
              onClick={() => {
                setIsMobileMenuOpen(false);
                if (isAuthenticated) {
                  setCurrentView('admin');
                } else {
                  onOpenLoginModal();
                }
              }}
              className={`flex items-center justify-between w-full px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                currentView === 'admin'
                  ? 'bg-terracotta text-white shadow-xs'
                  : 'bg-warm-muted text-warm-gray hover:bg-warm-border hover:text-warm-charcoal'
              }`}
            >
              <div className="flex items-center space-x-2">
                <LayoutDashboard className="w-4 h-4" />
                <span>Admin Portal</span>
              </div>
              {isAuthenticated ? (
                <span className="flex items-center space-x-1 text-[10px] text-warm-success bg-warm-success-bg px-2 py-0.5 rounded-md border border-warm-success-border">
                  <span className="w-1.5 h-1.5 rounded-full bg-warm-success animate-pulse"></span>
                  <span>LoggedIn</span>
                </span>
              ) : (
                <span className="text-[10px] text-warm-subtle bg-warm-muted px-2 py-0.5 rounded-md">Login Required</span>
              )}
            </button>
          </div>

          {/* Auth Status & Login/Logout in Mobile Menu */}
          <div className="pt-2 border-t border-warm-border">
            {isAuthenticated ? (
              <div className="flex items-center justify-between bg-warm-muted p-3 rounded-xl border border-warm-border">
                <div className="flex items-center space-x-2 text-warm-success text-xs">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span className="font-semibold truncate">Admin: {admin?.username}</span>
                </div>
                <button
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    logout();
                  }}
                  className="flex items-center space-x-1 px-3 py-1.5 bg-warm-danger-bg hover:bg-warm-danger-border/30 text-warm-danger rounded-lg border border-warm-danger-border text-xs font-semibold"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Logout</span>
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  onOpenLoginModal();
                }}
                className="flex items-center justify-center space-x-2 w-full bg-terracotta hover:bg-terracotta-hover text-white text-xs font-bold py-2.5 rounded-xl shadow-xs"
              >
                <LogIn className="w-4 h-4" />
                <span>Admin Login</span>
              </button>
            )}
          </div>

        </div>
      )}
    </header>
  );
}
