'use client';

import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import Navbar from '@/components/Navbar';
import Calendar from '@/components/Calendar';
import { getMatches, getSaisons, getStats, getTeams } from '@/lib/api';
import { Match, Saison, Team, Stats } from '@/lib/types';
import { parseApiDate } from '@/lib/api';
import Link from 'next/link';

export default function HomePage() {
  const { theme } = useTheme();
  const [matches, setMatches] = useState<Match[]>([]);
  const [saisons, setSaisons] = useState<Saison[]>([]);
  const [selectedSaison, setSelectedSaison] = useState<string>('');
  const [teams, setTeams] = useState<Team[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (selectedSaison) {
      fetchMatches(selectedSaison);
      fetchStats(selectedSaison);
    }
  }, [selectedSaison]);

  const fetchInitialData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Charger les saisons
      const saisonsRes = await getSaisons();
      if (saisonsRes.data) {
        setSaisons(saisonsRes.data);
        // Sélectionner la saison active par défaut
        const activeSaison = saisonsRes.data.find(s => s.active);
        if (activeSaison) {
          setSelectedSaison(activeSaison.nom);
        } else if (saisonsRes.data.length > 0) {
          setSelectedSaison(saisonsRes.data[0].nom);
        }
      }

      // Charger les équipes
      const teamsRes = await getTeams();
      if (teamsRes.data) {
        setTeams(teamsRes.data);
      }

      // Charger les matchs de la saison active
      if (saisonsRes.data) {
        const activeSaison = saisonsRes.data.find(s => s.active);
        const saisonParam = activeSaison ? activeSaison.nom : undefined;
        const matchesRes = await getMatches({ saison: saisonParam, limit: 50 });
        if (matchesRes.data) {
          setMatches(matchesRes.data);
        }
      }
    } catch (err) {
      console.error('Erreur:', err);
      setError('Impossible de charger les données');
    } finally {
      setLoading(false);
    }
  };

  const fetchMatches = async (saison?: string) => {
    setLoading(true);
    try {
      const res = await getMatches({ saison, limit: 50 });
      if (res.data) {
        setMatches(res.data);
      }
    } catch (err) {
      setError('Impossible de charger les matchs');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async (saison?: string) => {
    try {
      const res = await getStats({ saison });
      if (res.data) {
        setStats(res.data);
      }
    } catch (err) {
      console.error('Erreur stats:', err);
    }
  };

  const getTeamColor = (teamName: string) => {
    const team = teams.find(t => t.nom === teamName);
    return team?.couleur || '#6b7280';
  };

  const formatDate = (dateString: string) => {
    const date = parseApiDate(dateString);
    return date.toLocaleDateString('fr-FR', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <Navbar />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            EHR Planning Handball
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Gestion des matchs, salles et classements
          </p>
        </div>

        {/* Stats Overview */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-md p-6">
              <div className="flex items-center">
                <div className="bg-blue-100 dark:bg-blue-900/30 p-3 rounded-lg mr-4">
                  <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Matchs totaux</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.total_matches}</p>
                </div>
              </div>
            </div>
            
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-md p-6">
              <div className="flex items-center">
                <div className="bg-green-100 dark:bg-green-900/30 p-3 rounded-lg mr-4">
                  <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Salles occupées</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {Object.keys(stats.matches_by_salle).length}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-md p-6">
              <div className="flex items-center">
                <div className="bg-purple-100 dark:bg-purple-900/30 p-3 rounded-lg mr-4">
                  <svg className="w-6 h-6 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Jours avec matchs</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {Object.keys(stats.matches_by_day).length}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Saison Selector */}
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-md p-6 mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                Saison en cours
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Sélectionnez une saison pour voir les matchs correspondants
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <select
                value={selectedSaison}
                onChange={(e) => setSelectedSaison(e.target.value)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {saisons.map((saison) => (
                  <option key={saison.nom} value={saison.nom}>
                    {saison.nom} {saison.active && ' (Active)'}
                  </option>
                ))}
              </select>
              <Link
                href="/admin"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition text-sm font-medium"
              >
                Gérer les saisons
              </Link>
            </div>
          </div>
        </div>

        {/* Calendar */}
        <div className="mb-8">
          <Calendar saison={selectedSaison} />
        </div>

        {/* Match List */}
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-md p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Prochains matchs
            </h2>
            <Link
              href="/matches"
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg transition text-sm font-medium"
            >
              Voir tous les matchs
            </Link>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
              <span className="ml-4 text-gray-600 dark:text-gray-400">Chargement...</span>
            </div>
          ) : error ? (
            <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg">
              {error}
            </div>
          ) : matches.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <svg className="w-12 h-12 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p>aucun match trouvé pour cette saison</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Match</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Salle</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Journée</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Score</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                  {matches
                    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                    .map((match) => (
                      <tr key={match.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                          {formatDate(match.date)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center space-x-2">
                            <span 
                              className="badge-team" 
                              style={{ backgroundColor: getTeamColor(match.equipo1) }}
                            >
                              {match.equipo1}
                            </span>
                            <span className="text-gray-500 dark:text-gray-400">vs</span>
                            <span 
                              className="badge-team" 
                              style={{ backgroundColor: getTeamColor(match.equipo2) }}
                            >
                              {match.equipo2}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                          {match.salle}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                          {match.journee}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                          {match.score1 !== undefined && match.score2 !== undefined ? (
                            <span className="font-semibold text-gray-900 dark:text-gray-100">
                              {match.score1} - {match.score2}
                            </span>
                          ) : (
                            <span className="text-gray-400 dark:text-gray-500 text-xs">À jouer</span>
                          )}
                        </td>
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
          © {new Date().getFullYear()} EHR Planning - Powered by Vercel & Turso
        </div>
      </footer>
    </div>
  );
}
