'use client';

import { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import { getMatches, getSaisons, getSalles, parseApiDate, formatDateForDisplay } from '@/lib/api';
import { Match, Saison } from '@/lib/types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export default function SallesPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [salles, setSalles] = useState<string[]>([]);
  const [saisons, setSaisons] = useState<Saison[]>([]);
  const [selectedSaison, setSelectedSaison] = useState<string>('');
  const [selectedSalle, setSelectedSalle] = useState<string>('toutes');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (selectedSaison) {
      fetchMatches(selectedSaison);
    }
  }, [selectedSaison, selectedSalle]);

  const fetchInitialData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const saisonsRes = await getSaisons();
      if (saisonsRes.data) {
        setSaisons(saisonsRes.data);
        const activeSaison = saisonsRes.data.find(s => s.active);
        if (activeSaison) {
          setSelectedSaison(activeSaison.nom);
        } else if (saisonsRes.data.length > 0) {
          setSelectedSaison(saisonsRes.data[0].nom);
        }
      }

      const sallesRes = await getSalles();
      if (sallesRes.data) {
        setSalles(['toutes', ...sallesRes.data]);
      }
    } catch (err) {
      console.error('Erreur:', err);
      setError('Impossible de charger les donnees initiales');
    } finally {
      setLoading(false);
    }
  };

  const fetchMatches = async (saison: string) => {
    setLoading(true);
    setError(null);
    
    try {
      const res = await getMatches({ saison, limit: 1000 });
      if (res.data) {
        setMatches(res.data);
      }
    } catch (err) {
      console.error('Erreur:', err);
      setError('Impossible de charger les matchs');
    } finally {
      setLoading(false);
    }
  };

  const filteredMatches = selectedSalle === 'toutes' 
    ? matches 
    : matches.filter(m => m.salle === selectedSalle);

  const matchesByDate = filteredMatches.reduce((acc, match) => {
    const date = match.date_iso;
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(match);
    return acc;
  }, {} as Record<string, Match[]>);

  const weekEndsWithMatches: {date: string, matchs: Match[], total: number}[] = [];
  
  Object.keys(matchesByDate).sort().forEach(dateIso => {
    const date = new Date(dateIso);
    const dayOfWeek = date.getDay();
    
    if (dayOfWeek === 6 || dayOfWeek === 0) {
      const saturday = new Date(date);
      if (dayOfWeek === 0) {
        saturday.setDate(date.getDate() - 1);
      }
      
      const saturdayIso = saturday.toISOString().split('T')[0];
      const sundayIso = new Date(saturday);
      sundayIso.setDate(saturday.getDate() + 1);
      const sundayIsoStr = sundayIso.toISOString().split('T')[0];
      
      const existing = weekEndsWithMatches.find(w => 
        w.date === saturdayIso || w.date === sundayIsoStr
      );
      
      if (existing) {
        existing.matchs.push(...matchesByDate[dateIso]);
        existing.total = existing.matchs.length;
      } else {
        weekEndsWithMatches.push({
          date: saturdayIso,
          matchs: [...matchesByDate[dateIso]],
          total: matchesByDate[dateIso].length
        });
      }
    }
  });

  const buvetteOpportunities = weekEndsWithMatches.filter(w => w.total >= 2);

  const matchesBySalle = filteredMatches.reduce((acc, match) => {
    const salle = match.salle || 'Inconnue';
    if (!acc[salle]) {
      acc[salle] = { count: 0, matchs: [] };
    }
    acc[salle].count++;
    acc[salle].matchs.push(match);
    return acc;
  }, {} as Record<string, { count: number, matchs: Match[] }>);

  const COLORS = [
    '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', 
    '#06b6d4', '#84cc16', '#eab308', '#ec4899', '#6366f1'
  ];

  const chartData = Object.entries(matchesBySalle)
    .map(([salle, data]) => ({
      name: salle,
      matchs: data.count,
    }))
    .sort((a, b) => b.matchs - a.matchs);

  const formatDate = (dateIso: string) => {
    const date = new Date(dateIso);
    return date.toLocaleDateString('fr-FR', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getSalleColor = (salle: string, index: number) => {
    return COLORS[index % COLORS.length];
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Gestion des Salles & Buvettes
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Analysez l'utilisation des salles et identifiez les opportunites pour organiser des buvettes
          </p>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-md p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Filtres
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Saison
              </label>
              <select
                value={selectedSaison}
                onChange={(e) => setSelectedSaison(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Selectionnez une saison</option>
                {saisons.map((saison) => (
                  <option key={saison.nom} value={saison.nom}>
                    {saison.nom} {saison.active && ' (Active)'}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Salle
              </label>
              <select
                value={selectedSalle}
                onChange={(e) => setSelectedSalle(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {salles.map((salle) => (
                  <option key={salle} value={salle}>{salle || 'Toutes'}</option>
                ))}
              </select>
            </div>

            <div className="flex items-end">
              <div className="bg-blue-50 dark:bg-blue-900/30 p-3 rounded-lg w-full">
                <p className="text-sm text-blue-700 dark:text-blue-300 font-medium">
                  {Object.keys(matchesBySalle).length} salles
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                  {filteredMatches.length} matchs
                </p>
              </div>
            </div>
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
        ) : (
          <>
            {buvetteOpportunities.length > 0 && (
              <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-xl p-6 mb-8">
                <div className="flex items-center mb-4">
                  <div className="bg-green-100 dark:bg-green-900/30 p-2 rounded-lg mr-3">
                    <svg className="w-6 h-6 text-green-700 dark:text-green-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-green-800 dark:text-green-200">
                      Opportunites de Buvettes
                    </h2>
                    <p className="text-sm text-green-700 dark:text-green-300">
                      {buvetteOpportunities.length} week-end(s) avec 2 matchs ou plus
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {buvetteOpportunities.map((weekend, index) => {
                    const saturday = new Date(weekend.date);
                    const sunday = new Date(saturday);
                    sunday.setDate(saturday.getDate() + 1);
                    
                    const saturdayMatches = weekend.matchs.filter(m => {
                      const matchDate = new Date(m.date_iso);
                      return matchDate.toISOString().split('T')[0] === weekend.date;
                    });
                    
                    const sundayMatches = weekend.matchs.filter(m => {
                      const matchDate = new Date(m.date_iso);
                      return matchDate.toISOString().split('T')[0] === sunday.toISOString().split('T')[0];
                    });

                    return (
                      <div key={weekend.date} className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-green-200 dark:border-green-800">
                        <div className="flex justify-between items-start mb-2">
                          <h3 className="font-semibold text-green-800 dark:text-green-200">
                            Week-end du {formatDate(weekend.date)}
                          </h3>
                          <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 text-xs font-bold rounded-full">
                            {weekend.total} matchs
                          </span>
                        </div>
                        
                        <div className="space-y-2">
                          {saturdayMatches.length > 0 && (
                            <div className="text-sm">
                              <span className="font-medium text-gray-600 dark:text-gray-400">Samedi :</span>
                              <ul className="mt-1 space-y-1">
                                {saturdayMatches.map((match, idx) => (
                                  <li key={idx} className="text-xs text-gray-700 dark:text-gray-300 pl-3">
                                    - {match.time_str} - {match.team_name} vs {match.opponent}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          
                          {sundayMatches.length > 0 && (
                            <div className="text-sm">
                              <span className="font-medium text-gray-600 dark:text-gray-400">Dimanche :</span>
                              <ul className="mt-1 space-y-1">
                                {sundayMatches.map((match, idx) => (
                                  <li key={idx} className="text-xs text-gray-700 dark:text-gray-300 pl-3">
                                    - {match.time_str} - {match.team_name} vs {match.opponent}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>

                        <div className="mt-3 pt-3 border-t border-green-100 dark:border-green-800 text-xs text-green-700 dark:text-green-300">
                          Good spot pour une buvette !
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-md p-6 mb-8">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Statistiques par Salle
              </h2>

              <div className="h-64 mb-8">
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
                      formatter={(value: any, name: any) => [value !== undefined && value !== null ? `${value} matchs` : '0 matchs', name]}
                    />
                    <Bar dataKey="matchs" fill="#3b82f6">
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                        Salle
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                        Nombre de matchs
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                        Details
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                    {Object.entries(matchesBySalle)
                      .sort(([, a], [, b]) => b.count - a.count)
                      .map(([salle, data], index) => (
                        <tr key={salle} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                            {salle || 'Inconnue'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-center text-sm font-bold text-gray-900 dark:text-gray-100">
                            {data.count}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {data.count > 0 && (
                              <details className="text-sm">
                                <summary className="cursor-pointer text-blue-600 dark:text-blue-400 hover:underline">
                                  Voir les {data.count} matchs
                                </summary>
                                <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="text-left text-gray-500 dark:text-gray-400">
                                        <th className="pr-2">Date</th>
                                        <th className="pr-2">Match</th>
                                        <th>Journee</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {data.matchs
                                        .sort((a, b) => new Date(a.date_iso).getTime() - new Date(b.date_iso).getTime())
                                        .map((match, idx) => (
                                          <tr key={idx} className="border-t border-gray-200 dark:border-gray-700">
                                            <td className="py-1 pr-2">{formatDate(match.date_iso)}</td>
                                            <td className="py-1 pr-2">{match.time_str} - {match.team_name}</td>
                                            <td className="py-1">{match.journee}</td>
                                          </tr>
                                        ))}
                                    </tbody>
                                  </table>
                                </div>
                              </details>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>

            {weekEndsWithMatches.length > 0 && (
              <div className="bg-white dark:bg-gray-900 rounded-xl shadow-md p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                  Tous les Week-ends avec Matchs
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {weekEndsWithMatches
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                    .map((weekend) => {
                      const saturday = new Date(weekend.date);
                      const sunday = new Date(saturday);
                      sunday.setDate(saturday.getDate() + 1);
                      
                      const saturdayMatches = weekend.matchs.filter(m => 
                        new Date(m.date_iso).toISOString().split('T')[0] === weekend.date
                      );
                      
                      const sundayMatches = weekend.matchs.filter(m => 
                        new Date(m.date_iso).toISOString().split('T')[0] === sunday.toISOString().split('T')[0]
                      );

                      const isBuvetteOpportunity = weekend.total >= 2;

                      return (
                        <div 
                          key={weekend.date}
                          className={`rounded-lg p-4 border-2 ${
                            isBuvetteOpportunity 
                              ? 'border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20' 
                              : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800'
                          }`}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                              {formatDate(weekend.date)}
                            </h3>
                            <span className={`px-2 py-1 text-xs font-bold rounded-full ${
                              isBuvetteOpportunity 
                                ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200' 
                                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                            }`}>
                              {weekend.total} matchs
                            </span>
                          </div>
                          
                          <div className="space-y-2 text-sm">
                            {saturdayMatches.length > 0 && (
                              <div>
                                <span className="font-medium text-gray-600 dark:text-gray-400">Samedi :</span>
                                <ul className="mt-1">
                                  {saturdayMatches.map((match, idx) => (
                                    <li key={idx} className="text-xs text-gray-700 dark:text-gray-300 pl-3">
                                      - {match.time_str} - {match.team_name} vs {match.opponent}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            
                            {sundayMatches.length > 0 && (
                              <div>
                                <span className="font-medium text-gray-600 dark:text-gray-400">Dimanche :</span>
                                <ul className="mt-1">
                                  {sundayMatches.map((match, idx) => (
                                    <li key={idx} className="text-xs text-gray-700 dark:text-gray-300 pl-3">
                                      - {match.time_str} - {match.team_name} vs {match.opponent}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>

                          {isBuvetteOpportunity && (
                            <div className="mt-3 pt-2 border-t border-green-200 dark:border-green-700">
                              <p className="text-xs text-green-700 dark:text-green-300 italic">
                                Good spot pour une buvette !
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {buvetteOpportunities.length === 0 && weekEndsWithMatches.length === 0 && selectedSaison && (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                <p>Aucun match trouve pour cette saison et cette salle</p>
              </div>
            )}
          </>
        )}
      </main>

      <footer className="bg-gray-100 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 mt-12 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm text-gray-500 dark:text-gray-400">
          &copy; {new Date().getFullYear()} EHR Planning - Gestion des Salles & Buvettes
        </div>
      </footer>
    </div>
  );
}
