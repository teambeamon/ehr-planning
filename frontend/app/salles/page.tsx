'use client';

import { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import { getStatsBySalle, getSalles } from '@/lib/api';
import { StatsSalle } from '@/lib/types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export default function SallesPage() {
  const [stats, setStats] = useState<StatsSalle[]>([]);
  const [salles, setSalles] = useState<string[]>([]);
  const [selectedSaison, setSelectedSaison] = useState<string>('');
  const [allSaisons, setAllSaisons] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSalles();
  }, []);

  useEffect(() => {
    if (selectedSaison) {
      fetchStats(selectedSaison);
    }
  }, [selectedSaison]);

  const fetchSalles = async () => {
    setLoading(true);
    try {
      const res = await getSalles();
      if (res.data) {
        setSalles(res.data);
      }
    } catch (err) {
      setError('Impossible de charger les salles');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async (saison: string) => {
    setLoading(true);
    try {
      const res = await getStatsBySalle({ saison });
      if (res.data) {
        setStats(res.data);
        // Extraire les saisons
        const saisons = res.data.map(s => s.saison);
        setAllSaisons(Array.from(new Set(saisons)));
      }
    } catch (err) {
      setError('Impossible de charger les statistiques');
    } finally {
      setLoading(false);
    }
  };

  // Couleurs pour le graphique
  const COLORS = [
    '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', 
    '#06b6d4', '#84cc16', '#eab308', '#ec4899', '#6366f1'
  ];

  // Préparer les données pour le graphique
  const chartData = stats.map((stat) => ({
    name: stat.salle,
    matchs: stat.total_matches,
    ...stat.days_distribution
  }));

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Statistiques par salle
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Analyse de l'utilisation des salles par saison
          </p>
        </div>

        {/* Saison Selector */}
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-md p-6 mb-8">
          <div className="flex items-center space-x-4">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Saison :
            </label>
            <select
              value={selectedSaison}
              onChange={(e) => setSelectedSaison(e.target.value)}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Sélectionnez une saison</option>
              {allSaisons.map((saison) => (
                <option key={saison} value={saison}>{saison}</option>
              ))}
            </select>
          </div>
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
        ) : stats.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            <p>Sélectionnez une saison pour voir les statistiques</p>
          </div>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <div className="bg-white dark:bg-gray-900 rounded-xl shadow-md p-6">
                <div className="flex items-center mb-2">
                  <div className="bg-blue-100 dark:bg-blue-900/30 p-2 rounded-lg mr-3">
                    <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Salles actives</p>
                    <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{stats.length}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-900 rounded-xl shadow-md p-6">
                <div className="flex items-center mb-2">
                  <div className="bg-green-100 dark:bg-green-900/30 p-2 rounded-lg mr-3">
                    <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Matchs totaux</p>
                    <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
                      {stats.reduce((sum, s) => sum + s.total_matches, 0)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-900 rounded-xl shadow-md p-6">
                <div className="flex items-center mb-2">
                  <div className="bg-purple-100 dark:bg-purple-900/30 p-2 rounded-lg mr-3">
                    <svg className="w-5 h-5 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Max matchs/jour</p>
                    <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
                      {Math.max(...stats.map(s => s.max_matches_per_day), 0)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Chart */}
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-md p-6 mb-8">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Nombre de matchs par salle
              </h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis 
                      dataKey="name" 
                      stroke="#6b7280"
                      tickFormatter={(value) => value.length > 12 ? value.substring(0, 10) + '...' : value}
                    />
                    <YAxis stroke="#6b7280" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1f2937',
                        border: 'none',
                        borderRadius: '0.5rem',
                      }}
                      formatter={(value: any) => value !== undefined ? [`${value} matchs`, ''] : ['', '']}
                    />
                    <Bar dataKey="matchs" fill="#3b82f6">
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Detailed Table */}
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-md p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Détails par salle
              </h2>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Salle</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Total Matchs</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Répartition</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Max/Jour</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                    {stats.map((stat, index) => (
                      <tr key={stat.salle} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                          {stat.salle}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium text-gray-900 dark:text-gray-100">
                          {stat.total_matches}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-center">
                          <div className="flex flex-wrap gap-1 justify-center">
                            {Object.entries(stat.days_distribution).map(([nb, count]) => (
                              count > 0 && (
                                <span 
                                  key={nb}
                                  className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded-full text-xs font-medium"
                                  style={{ backgroundColor: COLORS[index % COLORS.length] + '20' }}
                                >
                                  {nb} match{parseInt(nb) > 1 ? 's' : ''} : {count} jour{count > 1 ? 's' : ''}
                                </span>
                              )
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium text-gray-600 dark:text-gray-400">
                          {stat.max_matches_per_day}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </main>

      <footer className="bg-gray-100 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 mt-12 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm text-gray-500 dark:text-gray-400">
          © {new Date().getFullYear()} EHR Planning - Statistiques par salle
        </div>
      </footer>
    </div>
  );
}
