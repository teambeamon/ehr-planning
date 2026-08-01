'use client';

import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import Link from 'next/link';
import { getMe, logout } from '@/lib/api';
import { User } from '@/lib/types';

export default function Navbar() {
  const { theme, setTheme } = useTheme();
  const [user, setUser] = useState<User | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    // Vérifier si l'utilisateur est connecté
    const token = localStorage.getItem('ehr_token');
    if (token) {
      getMe(token).then((res) => {
        if (res.data) setUser(res.data);
      });
    }
  }, []);

  const handleLogout = async () => {
    const token = localStorage.getItem('ehr_token');
    if (token) {
      await logout(token);
      localStorage.removeItem('ehr_token');
      localStorage.removeItem('ehr_user');
      setUser(null);
    }
  };

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  if (!isMounted) return null;

  return (
    <nav className="bg-ehr-blue dark:bg-ehr-dark shadow-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Logo */}
          <div className="flex items-center">
            <Link href="/" className="flex items-center space-x-2">
              <div className="w-10 h-10 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center">
                <span className="text-ehr-blue dark:text-white font-bold text-lg">EHR</span>
              </div>
              <div className="hidden sm:block">
                <span className="text-white dark:text-gray-200 font-semibold text-xl">Planning</span>
                <span className="text-ehr-light dark:text-gray-400 text-sm block -mt-1">Handball</span>
              </div>
            </Link>
          </div>

          {/* Menu Desktop */}
          <div className="hidden md:flex items-center space-x-8">
            <Link href="/" className="text-white dark:text-gray-300 hover:text-ehr-light dark:hover:text-gray-100 transition px-3 py-2 rounded-md text-sm font-medium">
              Accueil
            </Link>
            <Link href="/matches" className="text-white dark:text-gray-300 hover:text-ehr-light dark:hover:text-gray-100 transition px-3 py-2 rounded-md text-sm font-medium">
              Matchs
            </Link>
            <Link href="/salles" className="text-white dark:text-gray-300 hover:text-ehr-light dark:hover:text-gray-100 transition px-3 py-2 rounded-md text-sm font-medium">
              Salles
            </Link>
            <Link href="/classements" className="text-white dark:text-gray-300 hover:text-ehr-light dark:hover:text-gray-100 transition px-3 py-2 rounded-md text-sm font-medium">
              Classements
            </Link>
            
            {user && (
              <Link href="/admin" className="text-white dark:text-gray-300 hover:text-ehr-light dark:hover:text-gray-100 transition px-3 py-2 rounded-md text-sm font-medium bg-blue-600 dark:bg-blue-700">
                Admin
              </Link>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center space-x-4">
            {/* Toggle Theme */}
            <button
              onClick={toggleTheme}
              className="text-white dark:text-gray-300 hover:text-ehr-light dark:hover:text-gray-100 p-2 rounded-full transition"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>

            {/* User Auth */}
            {user ? (
              <div className="flex items-center space-x-4">
                <span className="text-white dark:text-gray-300 text-sm">
                  {user.username} ({user.role})
                </span>
                <button
                  onClick={handleLogout}
                  className="text-white dark:text-gray-300 hover:text-red-300 dark:hover:text-red-400 transition px-3 py-2 rounded-md text-sm font-medium"
                >
                  Déconnexion
                </button>
              </div>
            ) : (
              <Link href="/admin" className="text-white dark:text-gray-300 hover:text-ehr-light dark:hover:text-gray-100 transition px-3 py-2 rounded-md text-sm font-medium">
                Connexion
              </Link>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <button className="text-white dark:text-gray-300 p-2 rounded-md" aria-label="Open menu">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
