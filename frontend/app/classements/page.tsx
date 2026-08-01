'use client';

import { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import { getMatches, getTeams } from '@/lib/api';
import { Match, Team } from '@/lib/types';

export default function ClassementsPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      const [matchesRes, teamsRes] = await Promise.all([
        getMatches({ limit: 500 }),
        getTeams()
      ]);

      if (matchesRes.data) {
        setMatches(matchesRes.data);
      }
      if (teamsRes.data) {
        setTeams(teamsRes.data);
      }
    } catch (err) {
      console.error('Erreur:', err);
      setError('Impossible de charger les données');
    } finally {
      setLoading(false);
    }
  };

  // Calculer les statistiques par équipe
  const getTeamStats = () => {
    const stats: Record<string, {
      joues: number;
      victoires: number;
      nuls: number;
      defaites: number;
      pointsPour: number;
      pointsContre: number;
      difference: number;
      points: number;
    }> = {};

    // Initialiser toutes les équipes
    teams.forEach(team => {
      stats[team.nom] = {
        joues: 0,
        victoires: 0,
        nuls: 0,
        defaites: 0,
        pointsPour: 0,
        pointsContre: 0,
        difference: 0,
        points: 0,
      };
    });

    // Parcourir tous les matchs
    matches.forEach(match => {
      if (match.score1 === undefined || match.score2 === undefined) return;

      const team1 = match.equipo1;
      const team2 = match.equipo2;

      // Initialiser si pas encore présent
      if (!stats[team1]) {
        stats[team1] = {
          joues: 0, victoires: 0, nuls: 0, defaites: 0,
          pointsPour: 0, pointsContre: 0, difference: 0, points: 0
        };
      }
      if (!stats[team2]) {
        stats[team2] = {
          joues: 0, victoires: 0, nuls: 0, defaites: 0,
          pointsPour: 0, pointsContre: 0, difference: 0, points: 0
        };
      }

      // Mettre à jour les stats
      stats[team1].joues++;
      stats[team2].joues++;

      // Seuls les matchs avec scores sont comptabilisés
      if (typeof match.score1 === 'number' && typeof match.score2 === 'number') {
        stats[team1].pointsPour += match.score1;
        stats[team1].pointsContre += match.score2;
        stats[team1].difference += match.score1 - match.score2;

        stats[team2].pointsPour += match.score2;
        stats[team2].pointsContre += match.score1;
        stats[team2].difference += match.score2 - match.score1;

        if (match.score1 > match.score2) {
          stats[team1].victoires++;
          stats[team1].points += 3;
          stats[team2].defaites++;
        } else if (match.score1 < match.score2) {
          stats[team2].victoires++;
          stats[team2].points += 3;
          stats[team1].defaites++;
        } else {
          stats[team1].nuls++;
          stats[team2].nuls++;
          stats[team1].points += 1;
          stats[team2].points += 1;
        }
      }
    });

    return stats;
  };

  // Trier les équipes par points, puis par différence
  const sortedTeams = () => {
    const stats = getTeamStats();
    return Object.entries(stats).sort((a, b) => {
      // Par points (descendant)
      if (b[1].points !== a[1].points) return b[1].points - a[1].points;
      // Par différence (descendant)
      if (b[1].difference !== a[1].difference) return b[1].difference - a[1].difference;
      // Par points pour (descendant)
      return b[1].pointsPour - a[1].pointsPour;
    });
  };

  const getTeamColor = (teamName: string) => {
    const team = teams.find(t => t.nom === teamName);
    return team?.couleur || '#6b7280';
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Classements
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Classement des équipes par points
          </p>
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
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-md p-6">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Position</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Équipe</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Joués</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">V-N-D</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">BP</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">BC</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Diff</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Points</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                  {sortedTeams().map(([teamName, stats], index) => (
                    <tr key={teamName} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                        {index + 1}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center space-x-3">
                          <span 
                            className="w-4 h-4 rounded-full" 
                            style={{ backgroundColor: getTeamColor(teamName) }}
                          ></span>
                          <span className="font-medium text-gray-900 dark:text-gray-100">{teamName}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center text-sm">
                        {stats.joues}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        <span className="flex justify-center space-x-2">
                          <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full text-xs font-medium">
                            {stats.victoires}
                          </span>
                          <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-400 rounded-full text-xs font-medium">
                            {stats.nuls}
                          </span>
                          <span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-full text-xs font-medium">
                            {stats.defaites}
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center text-sm font-medium">
                        {stats.pointsPour}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center text-sm font-medium">
                        {stats.pointsContre}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center text-sm">
                        <span className={`font-medium ${stats.difference >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                          {stats.difference >= 0 ? '+' : ''}{stats.difference}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center text-sm font-bold text-gray-900 dark:text-gray-100">
                        {stats.points}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 text-sm text-gray-500 dark:text-gray-400">
              <p>
                <strong>Légende :</strong> J = Joués, V-N-D = Victoires-Nuls-Défaites, BP = Buts Pour, BC = Buts Contre, Diff = Différence, Points = 3 points/win, 1 point/nul
              </p>
            </div>
          </div>
        )}
      </main>

      <footer className="bg-gray-100 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 mt-12 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm text-gray-500 dark:text-gray-400">
          © {new Date().getFullYear()} EHR Planning - Classements
        </div>
      </footer>
    </div>
  );
}
