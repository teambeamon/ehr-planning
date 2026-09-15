'use client';

import { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import { getMatches, getTeams, deleteMatch, parseApiDate, formatDateForDisplay } from '@/lib/api';
import { Match, Team } from '@/lib/types';
import Link from 'next/link';

export default function MatchesPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    saison: '',
    salle: '',
    team: '',
    journee: '',
  });
  const [allSalles, setAllSalles] = useState<string[]>([]);
  const [allSaisons, setAllSaisons] = useState<string[]>([]);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    // Vérifier si l'utilisateur est connecté (pour les actions admin)
    const storedToken = localStorage.getItem('ehr_token');
    if (storedToken) {
      setToken(storedToken);
    }
    fetchData();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [filters]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      // Charger les équipes
      const teamsRes = await getTeams();
      if (teamsRes.data) {
        setTeams(teamsRes.data);
      }

      // Charger tous les matchs
      const matchesRes = await getMatches({ limit: 500 });
      if (matchesRes.data && Array.isArray(matchesRes.data)) {
        setMatches(matchesRes.data);

        // Extraire les salles et saisons uniques
        const salles = matchesRes.data.map(m => m.salle).filter((v, i, a) => a.indexOf(v) === i);
        const saisons = matchesRes.data.map(m => m.saison).filter((v, i, a) => a.indexOf(v) === i);
        setAllSalles(salles);
        setAllSaisons(saisons);
      }
    } catch (err) {
      console.error('Erreur:', err);
      setError('Impossible de charger les données');
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    // Les filtres sont appliqués côté client sur la liste complète
    // En production, tu peux aussi passer les filtres à l'API
  };

  const handleDeleteMatch = async (matchId: number) => {
    if (!token) {
      alert('Vous devez être connecté pour supprimer un match');
      return;
    }

    if (!confirm('Êtes-vous sûr de vouloir supprimer ce match ?')) {
      return;
    }

    setLoading(true);
    try {
      const res = await deleteMatch(matchId, token);
      if (res.error) {
        setError(res.error);
      } else {
        // Recharger les matchs
        const matchesRes = await getMatches({ limit: 500 });
        if (matchesRes.data) {
          setMatches(matchesRes.data);
        }
      }
    } catch (err) {
      setError('Erreur lors de la suppression');
    } finally {
      setLoading(false);
    }
  };

  const getTeamColor = (teamName: string) => {
    const team = teams.find(t => t.nom === teamName);
    return team?.couleur || '#6b7280';
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

  const filteredMatches = matches.filter((match) => {
    if (filters.saison && match.saison !== filters.saison) return false;
    if (filters.salle && match.salle !== filters.salle) return false;
    if (filters.team) {
      const filterLower = filters.team.toLowerCase().trim();
      const teamNameLower = (match.team_name || '').toLowerCase();
      const opponentLower = (match.opponent || '').toLowerCase();
      if (!teamNameLower.includes(filterLower) && !opponentLower.includes(filterLower)) return false;
    }
    if (filters.journee && match.journee !== filters.journee) return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                Tous les matchs
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">
                {filteredMatches.length} matchs trouvés
              </p>
            </div>
            <Link
              href="/admin"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition text-sm font-medium"
            >
              + Importer des matchs
            </Link>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-md p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Filtres
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Saison
              </label>
              <select
                value={filters.saison}
                onChange={(e) => setFilters({ ...filters, saison: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Toutes les saisons</option>
                {allSaisons.map((saison) => (
                  <option key={saison} value={saison}>{saison}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Salle
              </label>
              <select
                value={filters.salle}
                onChange={(e) => setFilters({ ...filters, salle: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Toutes les salles</option>
                {allSalles.map((salle) => (
                  <option key={salle} value={salle}>{salle}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Équipe
              </label>
              <select
                value={filters.team}
                onChange={(e) => setFilters({ ...filters, team: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Toutes les équipes</option>
                {teams.map((team) => (
                  <option key={team.nom} value={team.nom}>{team.nom}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Journée
              </label>
              <select
                value={filters.journee}
                onChange={(e) => setFilters({ ...filters, journee: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Toutes les journées</option>
                {[...Array(30)].map((_, i) => (
                  <option key={i + 1} value={(i + 1).toString()}>{i + 1}</option>
                ))}
              </select>
            </div>
          </div>
          <button
            onClick={() => setFilters({ saison: '', salle: '', team: '', journee: '' })}
            className="mt-4 px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg transition text-sm"
          >
            Réinitialiser les filtres
          </button>
        </div>

        {/* Match List */}
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-md p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
              <span className="ml-4 text-gray-600 dark:text-gray-400">Chargement...</span>
            </div>
          ) : error ? (
            <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg">
              {error}
            </div>
          ) : filteredMatches.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <svg className="w-12 h-12 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p>Aucun match trouvé avec ces filtres</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-3 py-2 md:px-4 md:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Date</th>
                    <th className="px-3 py-2 md:px-4 md:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Match</th>
                    <th className="px-3 py-2 md:px-4 md:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Salle</th>
                    <th className="hidden md:table-cell px-3 py-2 md:px-4 md:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Journée</th>
                    <th className="hidden lg:table-cell px-3 py-2 md:px-4 md:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Saison</th>
                    <th className="px-3 py-2 md:px-4 md:py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Type</th>
                    {token && (
                      <th className="hidden md:table-cell px-3 py-2 md:px-4 md:py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                  {filteredMatches
                    .sort((a, b) => new Date(a.date_iso).getTime() - new Date(b.date_iso).getTime())
                    .map((match) => (
                      <tr key={match.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="px-3 py-2 md:px-4 md:py-3 whitespace-nowrap text-gray-900 dark:text-gray-100">
                          {formatDate(match.date_iso)}
                        </td>
                        <td className="px-3 py-2 md:px-4 md:py-3 whitespace-nowrap">
                          <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-2">
                            <span 
                              className="badge-team text-xs"
                              style={{ backgroundColor: getTeamColor(match.team_name) }}
                            >
                              {match.team_name}
                            </span>
                            <span className="hidden md:inline text-gray-500 dark:text-gray-400">vs</span>
                            <span className="md:hidden text-gray-500 dark:text-gray-400 text-xs">-</span>
                            <span 
                              className="badge-team text-xs"
                              style={{ backgroundColor: getTeamColor(match.opponent) }}
                            >
                              {match.opponent}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2 md:px-4 md:py-3 whitespace-nowrap text-gray-600 dark:text-gray-400">
                          {match.salle || '-'}
                        </td>
                        <td className="hidden md:table-cell px-3 py-2 md:px-4 md:py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                          {match.journee}
                        </td>
                        <td className="hidden lg:table-cell px-3 py-2 md:px-4 md:py-3 whitespace-nowrap">
                          <span className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded-full text-xs font-medium">
                            {match.saison}
                          </span>
                        </td>
                        <td className="px-3 py-2 md:px-4 md:py-3 whitespace-nowrap text-right">
                          <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                            match.match_type === 'champ' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' :
                            match.match_type === 'coupe' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                            match.match_type === 'amical' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400' :
                            'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-400'
                          }`}>
                            {match.match_type}
                          </span>
                        </td>
                        {token && (
                          <td className="hidden md:table-cell px-3 py-2 md:px-4 md:py-3 whitespace-nowrap text-center">
                            <button
                              onClick={() => handleDeleteMatch(match.id)}
                              className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 transition"
                              title="Supprimer"
                            >
                              <svg className="w-4 h-4 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      <footer className="bg-gray-100 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 mt-12 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm text-gray-500 dark:text-gray-400">
          © {new Date().getFullYear()} EHR Planning - Liste des matchs
        </div>
      </footer>
    </div>
  );
}
