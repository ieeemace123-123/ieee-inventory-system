import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { X, Lock, User, Key, AlertCircle, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';

export default function AdminLoginModal({ isOpen, onClose, onSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { login } = useAuth();

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    console.log(`[AdminLoginModal] 🚀 Submitting login form: username="${username}"`);

    try {
      await login(username, password);
      toast.success('Admin authentication successful! Welcome to portal.');
      if (onSuccess) onSuccess();
      if (onClose) onClose();
    } catch (err) {
      console.error('[AdminLoginModal] ❌ Login submission failed:', err);
      const message = err.response?.data?.error || err.message || 'Invalid credentials. Please try again.';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-warm-charcoal/40 backdrop-blur-sm animate-fadeIn">
      <div className="bg-warm-surface border border-warm-border rounded-2xl max-w-md w-full p-6 shadow-xl relative overflow-hidden max-h-[90vh] overflow-y-auto">
        
        {/* Decorative Top Gradient Line */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-terracotta via-amber-500 to-terracotta"></div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-warm-gray hover:text-warm-charcoal hover:bg-warm-muted rounded-lg transition-all"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center space-x-3 mb-6">
          <div className="p-3 bg-terracotta-light text-terracotta rounded-xl border border-terracotta-border">
            <Lock className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-warm-charcoal">Admin Authentication</h2>
            <p className="text-xs text-warm-gray">Access protected inventory management portal</p>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="bg-warm-danger-bg border border-warm-danger-border text-warm-danger p-3 rounded-xl mb-4 text-xs flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-warm-charcoal mb-1">Admin Username</label>
            <div className="relative">
              <User className="w-4 h-4 text-warm-subtle absolute left-3 top-3" />
              <input
                type="text"
                required
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  if (error) setError('');
                }}
                placeholder="Username"
                className="w-full bg-warm-muted border border-warm-border rounded-xl py-2.5 pl-9 pr-4 text-sm text-warm-charcoal placeholder:text-warm-subtle focus:outline-none focus:border-terracotta focus:ring-1 focus:ring-terracotta transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-warm-charcoal mb-1">Password</label>
            <div className="relative">
              <Key className="w-4 h-4 text-warm-subtle absolute left-3 top-3" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError('');
                }}
                placeholder="Password"
                className="w-full bg-warm-muted border border-warm-border rounded-xl py-2.5 pl-9 pr-10 text-sm text-warm-charcoal placeholder:text-warm-subtle focus:outline-none focus:border-terracotta focus:ring-1 focus:ring-terracotta transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-3 text-warm-subtle hover:text-warm-charcoal transition-all"
                title={showPassword ? 'Hide Password' : 'Show Password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-terracotta hover:bg-terracotta-hover text-white font-semibold text-sm py-2.5 rounded-xl shadow-xs transition-all disabled:opacity-50 mt-2 flex items-center justify-center space-x-2"
          >
            {loading ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
            ) : (
              <span>Sign In to Admin Portal</span>
            )}
          </button>
        </form>

      </div>
    </div>
  );
}
