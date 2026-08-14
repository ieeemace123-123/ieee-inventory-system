import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import PublicCatalog from './components/PublicCatalog';
import AdminDashboard from './components/admin/AdminDashboard';
import AdminLoginModal from './components/AdminLoginModal';
import { Toaster } from 'react-hot-toast';
import { LoaderCircle } from 'lucide-react';

// Protected Route Guard for Admin Portal
function ProtectedAdminRoute({ children, onUnauthorized }) {
  const { isAuthenticated, loading } = useAuth();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      console.warn('[ProtectedAdminRoute] ⛔ Access Denied: Unauthenticated attempt to render Admin Portal. Redirecting to Public Catalog.');
      onUnauthorized();
    }
  }, [isAuthenticated, loading, onUnauthorized]);

  if (loading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center text-warm-gray">
        <LoaderCircle className="mb-3 h-6 w-6 animate-spin text-terracotta" />
        <p className="text-sm font-semibold text-warm-charcoal">Checking session…</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null; // Block rendering of Admin Portal and any child API calls
  }

  return children;
}

function MainApp() {
  // Restore currentView from localStorage or default to 'public'
  const [currentView, setCurrentView] = useState(() => {
    return localStorage.getItem('ieee_current_view') || 'public';
  });

  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const { isAuthenticated, loading } = useAuth();

  // Helper to change view and persist to localStorage
  const changeView = (view) => {
    localStorage.setItem('ieee_current_view', view);
    setCurrentView(view);
  };

  // Synchronize view state once auth verification loading completes
  useEffect(() => {
    if (!loading) {
      const savedView = localStorage.getItem('ieee_current_view');
      if (!isAuthenticated && savedView === 'admin') {
        console.log('[MainApp] 🔒 Unauthenticated user on admin view. Redirecting to public catalog.');
        changeView('public');
      } else if (isAuthenticated && savedView === 'admin') {
        console.log('[MainApp] 🛡️ Valid admin session restored. Staying on Admin Portal.');
        setCurrentView('admin');
      }
    }
  }, [isAuthenticated, loading]);

  // Loading screen during initial auth verification (prevents view flash on page refresh)
  if (loading) {
    return (
      <div className="min-h-screen bg-warm-bg flex flex-col items-center justify-center text-warm-gray">
        <LoaderCircle className="mb-3 h-6 w-6 animate-spin text-terracotta" />
        <p className="text-sm font-semibold text-warm-charcoal">Checking session…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-warm-bg text-warm-charcoal flex flex-col font-sans">
      
      {/* Toast Notifications */}
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#FFFFFF',
            color: '#2B2724',
            border: '1px solid #E8E2D9',
            borderRadius: '1rem',
            fontSize: '0.875rem',
            boxShadow: '0 4px 12px rgba(43, 39, 36, 0.08)'
          }
        }}
      />

      {/* Header Navbar */}
      <Navbar
        currentView={currentView}
        setCurrentView={(view) => {
          if (view === 'admin' && !isAuthenticated) {
            setIsLoginModalOpen(true);
          } else {
            changeView(view);
          }
        }}
        onOpenLoginModal={() => setIsLoginModalOpen(true)}
      />

      {/* Main Content View Container */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-8 pt-6 sm:px-6 lg:px-8">
        {currentView === 'admin' ? (
          <ProtectedAdminRoute
            onUnauthorized={() => {
              changeView('public');
            }}
          >
            <AdminDashboard />
          </ProtectedAdminRoute>
        ) : (
          <PublicCatalog onOpenLoginModal={() => setIsLoginModalOpen(true)} />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-warm-border bg-warm-surface py-6 text-center text-xs text-warm-gray">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-center gap-2">
          <p>© {new Date().getFullYear()} IEEE MACE SB · Inventory and member services</p>
        </div>
      </footer>

      {/* Admin Login Dialog */}
      <AdminLoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        onSuccess={() => changeView('admin')}
      />

    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}
