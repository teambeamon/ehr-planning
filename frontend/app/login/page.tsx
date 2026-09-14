'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { login, getMe } from '@/lib/api';
import { User } from '@/lib/types';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || '/';
  
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);

  // Vérifier si déjà connecté
  useEffect(() => {
    const checkAuth = async () => {
      const storedToken = localStorage.getItem('ehr_token');
      const storedUser = localStorage.getItem('ehr_user');
      
      if (storedToken && storedUser) {
        try {
          const parsedUser = JSON.parse(storedUser);
          if (parsedUser && parsedUser.username) {
            // Vérifier le token
            const res = await getMe(storedToken);
            if (res.data) {
              router.push(redirect);
              return;
            }
          }
        } catch (e) {
          // Token invalide, continuer
        }
      }
    };
    checkAuth();
  }, [redirect, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    const res = await login(username, password);
    if (res.error) {
      setError(res.error);
      setLoading(false);
      return;
    }
    
    if (res.data?.token) {
      // Créer un objet User
      const userData: User = {
        username: res.data.username,
        role: res.data.role as 'admin' | 'user',
        token: res.data.token
      };
      
      setUser(userData);
      localStorage.setItem('ehr_token', res.data.token);
      localStorage.setItem('ehr_user', JSON.stringify(userData));
      
      // Rediriger vers la page demandée ou l'accueil
      router.push(redirect);
    } else {
      setError('Réponse du serveur invalide');
      setLoading(false);
    }
  };

  // Si déjà authentifié (via l'useEffect), on redirige
  // Sinon, on affiche le formulaire
  
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <Navbar />
      
      <main className="max-w-md mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-ehr-blue dark:bg-ehr-dark rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-white font-bold text-2xl">EHR</span>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Connexion
            </h2>
            <p className="text-gray-500 dark:text-gray-400 mt-2">
              Identifiez-vous pour accéder à toutes les fonctionnalités
            </p>
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            {/* Username */}
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Identifiant
              </label>
              <input
                type="text"
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Votre identifiant"
                required
                autoComplete="username"
                autoFocus
              />
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Mot de passe
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Votre mot de passe"
                required
                autoComplete="current-password"
              />
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-2 px-4 rounded-lg transition flex items-center justify-center"
            >
              {loading ? (
                <>
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                  Connexion en cours...
                </>
              ) : (
                'Se connecter'
              )}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Problème de connexion ? Contactez l'administrateur.
            </p>
          </div>
        </div>
      </main>

      <footer className="bg-gray-100 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 mt-12 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm text-gray-500 dark:text-gray-400">
          © {new Date().getFullYear()} EHR Planning - Connexion
        </div>
      </footer>
    </div>
  );
}
