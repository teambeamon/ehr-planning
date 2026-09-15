'use client';

import { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import { getMatches, formatDateForDisplay } from '@/lib/api';
import { Match } from '@/lib/types';
import Link from 'next/link';

export default function WeekendMatchesPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextWeekendDate, setNextWeekendDate] = useState<string | null>(null);

  useEffect(() => {
    fetchMatches();
  }, []);

  const fetchMatches = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getMatches({ limit: 500 });
      if (res.data && Array.isArray(res.data)) {
        setMatches(res.data);
        findNextWeekend(res.data);
      }
    } catch (err) {
      setError('Impossible de charger les matchs');
    } finally {
      setLoading(false);
    }
  };

  // Vérifier si une date est un week-end (samedi ou dimanche)
  const isWeekend = (dateString: string | undefined | null) => {
    if (!dateString) return false;
    const date = new Date(dateString);
    const day = date.getDay(); // 0 = dimanche, 6 = samedi
    return day === 0 || day === 6;
  };

  // Trouver le prochain week-end avec des matchs
  const findNextWeekend = (allMatches: Match[]) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekendDates: string[] = [];

    for (const match of allMatches) {
      if (!match.date_iso) continue;
      const matchDate = new Date(match.date_iso);
      matchDate.setHours(0, 0, 0, 0);
      if (isWeekend(match.date_iso) && matchDate >= today && !weekendDates.includes(match.date_iso)) {
        weekendDates.push(match.date_iso);
      }
    }

    weekendDates.sort();
    setNextWeekendDate(weekendDates.length > 0 ? weekendDates[0] : null);
  };

  const formatDate = (dateString: string | undefined | null) => {
    if (!dateString) return 'Date invalide';
    return formatDateForDisplay(dateString);
  };

  // Filtrer les matchs du week-end à venir
  const weekendMatches = matches
    .filter((match) => {
      if (!match.date_iso) return false;
      const matchDate = new Date(match.date_iso);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      matchDate.setHours(0, 0, 0, 0);
      return isWeekend(match.date_iso) && matchDate >= today;
    })
    .sort((a, b) => new Date(a.date_iso).getTime() - new Date(b.date_iso).getTime());

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex justify-between items-center flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                Matchs du week-end à venir
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">
                {weekendMatches.length} matchs trouvés pour le week-end
                {nextWeekendDate && (
                  <span className="ml-2 text-sm">
                    <span className="text-gray-500 dark:text-gray-400">- Prochain week-end :</span>
                    <span className="ml-1 font-medium text-green-600 dark:text-green-400">
                      {formatDate(nextWeekendDate)}
                    </span>
                  </span>
                )}
              </p>
            </div>
            <Link
              href="/matches"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition text-sm font-medium"
            >
              Voir tous les matchs
            </Link>
          </div>
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
          ) : weekendMatches.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <svg className="w-12 h-12 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p>Aucun match de week-end à venir trouvé</p>
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
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                  {weekendMatches.map((match) => {
                    const matchDate = new Date(match.date_iso);
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    matchDate.setHours(0, 0, 0, 0);
                    const dateDiff = matchDate.getTime() - today.getTime();
                    const isVerySoon = dateDiff <= 2 * 24 * 60 * 60 * 1000; // Dans les 2 jours

                    return (
                      <tr
                        key={match.id}
                        className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
                          isVerySoon ? 'bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-400 dark:border-yellow-600' : 'bg-green-50 dark:bg-green-900/10'
                        }`}
                      >
                        <td className="px-3 py-2 md:px-4 md:py-3 whitespace-nowrap text-gray-900 dark:text-gray-100">
                          {formatDate(match.date_iso)}
                        </td>
                        <td className="px-3 py-2 md:px-4 md:py-3 whitespace-nowrap">
                          <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-2">
                            <span className="font-medium">{match.team_name}</span>
                            <span className="hidden md:inline text-gray-500 dark:text-gray-400">vs</span>
                            <span className="md:hidden text-gray-500 dark:text-gray-400 text-xs">-</span>
                            <span className="font-medium">{match.opponent}</span>
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
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      <footer className="bg-gray-100 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 mt-12 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm text-gray-500 dark:text-gray-400">
          © {new Date().getFullYear()} EHR Planning - Matchs du week-end
        </div>
      </footer>
    </div>
  );
}
