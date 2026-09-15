'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { login, getMe, getSaisons, setCurrentSaison, getMatches, importMatches, previewFile, getAppInfo, getImportProgress, incrementVersion, formatDateForDisplay, LoginResponse } from '@/lib/api';
import { User, Saison, Match } from '@/lib/types';

export default function AdminPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [saisons, setSaisons] = useState<Saison[]>([]);
  const [currentSaison, setCurrentSaisonState] = useState<string>('');
  const [newSaison, setNewSaison] = useState<string>('');
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [token, setToken] = useState<string>('');
  const [matches, setMatches] = useState<Match[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<{name: string; size: number; type: string; rows?: any[]; dates?: string[]; teams?: string[]; date_count?: number; team_count?: number} | null>(null);
  const [importProgress, setImportProgress] = useState<number>(0);
  const [isPreviewing, setIsPreviewing] = useState<boolean>(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [appInfo, setAppInfo] = useState<{ version: string; app_version_code?: string; beta?: boolean; last_updated?: string; last_commit?: string; deploy_message?: string; last_import?: any; turso_connected?: boolean } | null>(null);
  const [currentImportId, setCurrentImportId] = useState<string | null>(null);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    checkAuth();
    fetchAppInfo();
    fetchSaisons();
  }, []);

  // Nettoyer le polling lors du démontage
  useEffect(() => {
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [pollingInterval]);

  useEffect(() => {
    if (user?.token) {
      fetchMatches();
    }
  }, [user]);

  const checkAuth = async () => {
    const storedToken = localStorage.getItem('ehr_token');
    const storedUser = localStorage.getItem('ehr_user');
    
    if (storedToken && storedUser && storedUser !== 'undefined' && storedUser !== 'null') {
      try {
        const parsedUser = JSON.parse(storedUser);
        if (parsedUser && parsedUser.username) {
          setToken(storedToken);
          setUser(parsedUser);
          
          // Vérifier que le token est valide
          const res = await getMe(storedToken);
          if (!res.data) {
            localStorage.removeItem('ehr_token');
            localStorage.removeItem('ehr_user');
            setUser(null);
            setToken('');
          }
        } else {
          localStorage.removeItem('ehr_token');
          localStorage.removeItem('ehr_user');
          setUser(null);
          setToken('');
        }
      } catch (error) {
        console.error('Erreur de parsing des données utilisateur:', error);
        localStorage.removeItem('ehr_token');
        localStorage.removeItem('ehr_user');
        setUser(null);
        setToken('');
      }
    }
  };

  const fetchAppInfo = async () => {
    const res = await getAppInfo();
    if (res.data) {
      setAppInfo(res.data);
    }
  };

  const fetchSaisons = async () => {
    const res = await getSaisons();
    if (res.error) {
      setError(`Erreur lors du chargement des saisons: ${res.error}`);
      return;
    }
    if (res.data) {
      setSaisons(res.data);
      const active = res.data.find(s => s.active);
      if (active) {
        setCurrentSaisonState(active.nom);
      } else if (res.data.length > 0) {
        // Si aucune saison n'est marquée comme active, prendre la première
        setCurrentSaisonState(res.data[0].nom);
      }
    }
  };

  const fetchMatches = async () => {
    if (!token) return;
    const res = await getMatches({ limit: 20 });
    if (res.data) {
      setMatches(res.data);
    }
  };

  // Fonction pour vérifier la progression de l'import
  const checkImportProgress = async () => {
    if (!currentImportId || !token) return;
    
    try {
      const res = await getImportProgress(currentImportId, token);
      if (res.data) {
        setImportProgress(res.data.progress || 0);
        
        // Si l'import est terminé ou en erreur, arrêter le polling
        if (res.data.status === 'completed' || res.data.status === 'error' || res.data.status === 'not_found') {
          if (pollingInterval) {
            clearInterval(pollingInterval);
            setPollingInterval(null);
          }
          if (res.data.status === 'completed') {
            setImportProgress(100);
            fetchMatches();
          }
        }
      }
    } catch (err) {
      console.error('Erreur lors de la vérification de la progression:', err);
    }
  };

  // Démarrer le polling de la progression
  const startProgressPolling = (importId: string) => {
    setCurrentImportId(importId);
    setImportProgress(0);
    
    // Arrêter tout polling existant
    if (pollingInterval) {
      clearInterval(pollingInterval);
      setPollingInterval(null);
    }
    
    // Démarrer un nouveau polling toutes les 500ms
    const interval = setInterval(() => {
      checkImportProgress();
    }, 500);
    setPollingInterval(interval);
  };

  // Arrêter le polling
  const stopProgressPolling = () => {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      setPollingInterval(null);
    }
    setCurrentImportId(null);
  };

  // Incrémenter la version et enregistrer un déploiement
  const handleDeployVersion = async (commitMessage: string = '') => {
    if (!token) {
      setError('Veuillez vous connecter');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const res = await incrementVersion(token, commitMessage || 'Déploiement automatique');
      if (res.error) {
        setError(res.error);
      } else {
        setSuccess(`Version incrémentée: ${res.data?.version} à ${res.data?.last_updated}`);
        // Rafraîchir les infos de l'app
        setTimeout(() => {
          fetchAppInfo();
          setSuccess(null);
        }, 2000);
      }
    } catch (err) {
      console.error('Erreur lors de l\'incrément de version:', err);
      setError('Erreur réseau');
    } finally {
      setLoading(false);
    }
  };

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
      // Le backend retourne {token: string, username: string, role: string}
      // Créer un objet User à partir de LoginResponse
      const userData: User = {
        username: res.data.username,
        role: res.data.role as 'admin' | 'user',
        token: res.data.token
      };
      
      setUser(userData);
      setToken(res.data.token);
      localStorage.setItem('ehr_token', res.data.token);
      localStorage.setItem('ehr_user', JSON.stringify(userData));
      setSuccess('Connecté avec succès !');
      setTimeout(() => setSuccess(null), 3000);
    } else {
      setError('Réponse du serveur invalide');
    }
    setLoading(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('ehr_token');
    localStorage.removeItem('ehr_user');
    setUser(null);
    setToken('');
    setUsername('');
    setPassword('');
    router.push('/login');
  };

  const handleSetSaison = async () => {
    if (!token) {
      setError('Veuillez vous connecter');
      return;
    }
    if (!currentSaison) {
      setError('Veuillez sélectionner une saison');
      return;
    }
    
    // Vérifier le format de la saison (AAAA-AAAA)
    if (!/^\d{4}-\d{4}$/.test(currentSaison)) {
      setError('Format de saison invalide. Utilisez AAAA-AAAA (ex: 2026-2027)');
      return;
    }
    
    setLoading(true);
    setError(null);
    const res = await setCurrentSaison(currentSaison, token);
    if (res.error) {
      setError(res.error);
    } else {
      setSuccess(`Saison ${currentSaison} activée avec succès !`);
      fetchSaisons();
      setTimeout(() => setSuccess(null), 3000);
    }
    setLoading(false);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) {
      setFile(null);
      setFilePreview(null);
      return;
    }
    
    // Vérifier l'extension du fichier
    const validExtensions = ['.xlsx', '.xls'];
    const fileExtension = selectedFile.name.slice(selectedFile.name.lastIndexOf('.')).toLowerCase();
    if (!validExtensions.includes(fileExtension)) {
      setError('Veuillez sélectionner un fichier Excel (.xlsx ou .xls)');
      setFile(null);
      setFilePreview(null);
      return;
    }
    
    setFile(selectedFile);
    setError(null);
    
    // Prévisualisation des métadonnées du fichier
    setFilePreview({
      name: selectedFile.name,
      size: selectedFile.size,
      type: selectedFile.type,
      rows: [] // On ne peut pas parser Excel sans bibliothèque
    });
  };

  const handlePreviewFile = async () => {
    if (!file || !token) return;
    
    setIsPreviewing(true);
    setError(null);
    
    try {
      const res = await previewFile(file, token);
      if (res.error) {
        setError(res.error);
        // Afficher au moins les infos de base
        setFilePreview(prev => prev ? {
          ...prev,
          rows: [
            { message: `Erreur: ${res.error}` },
            { message: `Nom: ${file.name}` },
            { message: `Taille: ${(file.size / 1024 / 1024).toFixed(2)} Mo` }
          ]
        } : null);
      } else if (res.data) {
        setFilePreview(prev => prev ? {
          ...prev,
          dates: res.data?.dates || [],
          teams: res.data?.teams || [],
          date_count: res.data?.date_count || 0,
          team_count: res.data?.team_count || 0,
          rows: [
            { type: 'info', label: 'Fichier', value: file.name },
            { type: 'info', label: 'Taille', value: `${(file.size / 1024 / 1024).toFixed(2)} Mo` },
            { type: 'info', label: 'Dates trouvées', value: res.data?.date_count || 0 },
            { type: 'info', label: 'Équipes trouvées', value: res.data?.team_count || 0 },
            ...(res.data?.dates?.slice(0, 10) || []).map((date: string, index: number) => (
              { type: 'date', label: `Date ${index + 1}`, value: date }
            )),
            ...(res.data?.teams?.slice(0, 10) || []).map((team: string, index: number) => (
              { type: 'team', label: `Équipe ${index + 1}`, value: team }
            ))
          ]
        } : null);
      }
    } catch (err) {
      setError('Impossible de prévisualiser le fichier');
      setFilePreview(prev => prev ? {
        ...prev,
        rows: [
          { message: 'Erreur de connexion au serveur' },
          { message: `Nom: ${file.name}` },
          { message: `Taille: ${(file.size / 1024 / 1024).toFixed(2)} Mo` }
        ]
      } : null);
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !token) {
      setError('Veuillez sélectionner un fichier et vous connecter');
      return;
    }
    
    // Vérifier l'extension du fichier
    const validExtensions = ['.xlsx', '.xls'];
    const fileExtension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!validExtensions.includes(fileExtension)) {
      setError('Veuillez sélectionner un fichier Excel (.xlsx ou .xls)');
      return;
    }
    
    setLoading(true);
    setError(null);
    setImportProgress(0);
    stopProgressPolling();
    
    try {
      const res = await importMatches(file, token);
      
      if (res.error) {
        setError(res.error);
        setImportProgress(0);
      } else {
        // Si on a un import_id, démarrer le polling
        if (res.data?.import_id) {
          startProgressPolling(res.data.import_id);
        } else {
          // Sinon, afficher 100% directement
          setImportProgress(100);
        }
        
        const created = res.data?.created || 0;
        const updated = res.data?.updated || 0;
        const skipped = res.data?.skipped || 0;
        const total = res.data?.total_matches || (created + updated + skipped);
        const processed = res.data?.processed_matches || (created + updated + skipped);
        
        setSuccess(`Import démarré ! ${created} créés, ${updated} mis à jour, ${skipped} ignorés (${processed}/${total} traités)`);
        
        // Réinitialiser après un délai (si pas de polling)
        if (!res.data?.import_id) {
          setTimeout(() => {
            setImportProgress(0);
            setFile(null);
            setFilePreview(null);
            fetchMatches();
          }, 2000);
        }
        
        setTimeout(() => setSuccess(null), 5000);
      }
    } catch (err) {
      console.error('Erreur lors de l\'import:', err);
      setError('Erreur réseau lors de l\'import');
      setImportProgress(0);
      stopProgressPolling();
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string | undefined | null) => {
    if (!dateString) return 'Date invalide';
    return formatDateForDisplay(dateString);
  };

  // Trouver la date du prochain match pour la mise en évidence
  const getNextMatchDate = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let nextDate = null;
    let minDiff = Infinity;
    
    for (const match of matches) {
      if (!match.date_iso) continue;
      const matchDate = new Date(match.date_iso);
      matchDate.setHours(0, 0, 0, 0);
      if (matchDate >= today) {
        const diff = matchDate.getTime() - today.getTime();
        if (diff < minDiff) {
          minDiff = diff;
          nextDate = match.date_iso;
        }
      }
    }
    return nextDate;
  };

  const nextMatchDate = getNextMatchDate();

  if (!user) {
    router.push('/login?redirect=/admin');
    return null;
  }
  // Panneau admin (connecté)
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <Navbar />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Panneau d\'administration
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Bienvenue, <span className="font-medium">{user.username}</span> ({user.role})
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-800/30 text-red-700 dark:text-red-400 rounded-lg transition text-sm font-medium"
          >
            Déconnexion
          </button>
        </div>

        {/* App Info */}
        {appInfo && (
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-md p-6 mb-8">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Informations Application</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="flex items-center">
                <span className="text-sm text-gray-500 dark:text-gray-400 mr-2">Version :</span>
                <span className="font-mono text-sm bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">{appInfo.version}</span>
              </div>
              {appInfo.app_version_code && (
                <div className="flex items-center">
                  <span className="text-sm text-gray-500 dark:text-gray-400 mr-2">Code :</span>
                  <span className="font-mono text-sm bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 px-2 py-1 rounded">{appInfo.app_version_code}</span>
                </div>
              )}
              {appInfo.last_updated && (
                <div className="flex items-center">
                  <span className="text-sm text-gray-500 dark:text-gray-400 mr-2">Dernière MAJ :</span>
                  <span className="font-mono text-sm bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                    {formatDateForDisplay(appInfo.last_updated)}
                  </span>
                </div>
              )}
              {appInfo.deploy_message && (
                <div className="flex items-center">
                  <span className="text-sm text-gray-500 dark:text-gray-400 mr-2">Message :</span>
                  <span className="font-mono text-sm bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded truncate max-w-[200px]" title={appInfo.deploy_message}>
                    {appInfo.deploy_message}
                  </span>
                </div>
              )}
              {appInfo.turso_connected !== undefined ? (
                <div className="flex items-center">
                  <span className="text-sm text-gray-500 dark:text-gray-400 mr-2">Turso :</span>
                  <span className={`font-mono text-sm px-2 py-1 rounded ${
                    appInfo.turso_connected ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                  }`}>
                    {appInfo.turso_connected ? 'Connecté' : 'Déconnecté'}
                  </span>
                </div>
              ) : appInfo.beta !== undefined && (
                <div className="flex items-center">
                  <span className="text-sm text-gray-500 dark:text-gray-400 mr-2">Mode :</span>
                  <span className="font-mono text-sm bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-1 rounded">
                    {appInfo.beta ? 'Développement' : 'Production'}
                  </span>
                </div>
              )}
              <div className="flex items-center">
                <span className="text-sm text-gray-500 dark:text-gray-400 mr-2">Env :</span>
                <span className="font-mono text-sm bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-1 rounded">
                  {process.env.NODE_ENV || 'production'}
                </span>
              </div>
            </div>
            {/* Bouton pour incrémenter la version */}
            {user?.role === 'admin' && (
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => handleDeployVersion('Nouveau déploiement')}
                  disabled={loading}
                  className="text-sm bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Incrémentation...' : 'Incrémenter Version'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Gestion des saisons */}
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-md p-6 mb-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Gestion des saisons
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Saison active
              </label>
              <select
                value={currentSaison}
                onChange={(e) => setCurrentSaisonState(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {saisons.map((saison) => (
                  <option key={saison.nom} value={saison.nom}>
                    {saison.nom} {saison.active && ' (Active)'}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={handleSetSaison}
                disabled={loading || !currentSaison}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-2 px-4 rounded-lg transition flex items-center justify-center"
              >
                {loading ? (
                  <>
                    <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                    En cours...
                  </>
                ) : (
                  'Définir comme active'
                )}
              </button>
            </div>
          </div>

          {success && (
            <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-4 py-3 rounded-lg mb-4">
              {success}
            </div>
          )}
          {error && (
            <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg mb-4">
              {error}
            </div>
          )}
        </div>

        {/* Import Excel */}
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-md p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Import de matchs (Excel)
          </h2>
          
          <form onSubmit={handleImport} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Fichier Excel (.xlsx)
              </label>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="block w-full text-sm text-gray-500 dark:text-gray-400
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-lg file:border-0
                  file:text-sm file:font-medium
                  file:bg-blue-600 file:text-white
                  hover:file:bg-blue-700
                  dark:file:bg-blue-700 dark:file:hover:bg-blue-600"
              />
              {file && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Fichier sélectionné : {file.name}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || !file}
              className="bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-medium py-2 px-4 rounded-lg transition flex items-center"
            >
              {loading ? (
                <>
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                  Import en cours...
                </>
              ) : (
                'Importer les matchs'
              )}
            </button>
          </form>

          <p className="text-sm text-gray-500 dark:text-gray-400 mt-4">
            Format attendu : Colonnes "Date", "Équipe 1", "Équipe 2", "Salle", "Journée"
          </p>
        </div>

        {/* Derniers matchs importés */}
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-md p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Derniers matchs ({matches.length})
            </h2>
            {matches.length > 0 && (
              <button
                onClick={() => fetchMatches()}
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center"
              >
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h5M20 20v-5h-5M4 20h5v-5M20 4h-5v5" />
                </svg>
                Rafraîchir
              </button>
            )}
          </div>
          
          {/* Résumé des dates */}
          {matches.length > 0 && (
            <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Résumé des dates
              </h3>
              <div className="text-sm">
                {(() => {
                  const validMatches = matches.filter(m => m.date_iso);
                  if (validMatches.length === 0) return <p>Aucune date valide</p>;
                  
                  const dates = validMatches.map(m => m.date_iso || '');
                  // Filtrer les dates valides et uniques
                  const uniqueDates: string[] = [];
                  const seen = new Set<string>();
                  dates.forEach(d => {
                    if (d && !seen.has(d)) {
                      seen.add(d);
                      uniqueDates.push(d);
                    }
                  });
                  uniqueDates.sort();
                  
                  if (uniqueDates.length === 0) {
                    return <p>Aucune date valide</p>;
                  }
                  
                  // Trouver min et max dates
                  let minDate = new Date(uniqueDates[0]);
                  let maxDate = new Date(uniqueDates[0]);
                  uniqueDates.forEach(d => {
                    const date = new Date(d);
                    if (date.getTime() < minDate.getTime()) minDate = date;
                    if (date.getTime() > maxDate.getTime()) maxDate = date;
                  });
                  
                  return (
                    <div className="space-y-1">
                      <p><strong>Période :</strong> {formatDateForDisplay(minDate.toISOString().split('T')[0])} → {formatDateForDisplay(maxDate.toISOString().split('T')[0])}</p>
                      <p><strong>Nombre de dates uniques :</strong> {uniqueDates.length}</p>
                      <p><strong>Total matchs :</strong> {validMatches.length}</p>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {matches.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-center py-4">
              Aucun match trouvé
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Date</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Match</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase hidden lg:table-cell">Salle</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase hidden lg:table-cell">Journée</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                  {matches
                    .filter(m => m.date_iso) // Filtrer les matchs sans date
                    .sort((a, b) => new Date(b.date_iso || '').getTime() - new Date(a.date_iso || '').getTime())
                    .slice(0, 10)
                    .map((match) => {
                      const isNextMatch = match.date_iso === nextMatchDate;
                      return (
                      <tr key={match.id} className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 ${isNextMatch ? 'bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-400 dark:border-yellow-600' : ''}`}>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                          {formatDate(match.date_iso)}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm">
                          <span className="font-medium">{match.team_name}</span> vs <span className="font-medium">{match.opponent}</span>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400 hidden lg:table-cell">
                          {match.salle}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400 hidden lg:table-cell">
                          {match.journee}
                        </td>
                      </tr>
                    }));
                    }
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      <footer className="bg-gray-100 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 mt-12 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm text-gray-500 dark:text-gray-400">
          © {new Date().getFullYear()} EHR Planning - Panneau d\'administration
        </div>
      </footer>
    </div>
  );
}
