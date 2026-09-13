'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import {
  getTeamCoaches,
  createTeamCoach,
  updateTeamCoach,
  deleteTeamCoach,
  getTeamParents,
  createTeamParent,
  updateTeamParent,
  deleteTeamParent,
  getTeams,
  getMe
} from '@/lib/api';
import { TeamCoach, TeamParent, Team, User, ParentRole } from '@/lib/types';

export default function TeamManagementPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string>('');
  const [teams, setTeams] = useState<Team[]>([]);
  const [coaches, setCoaches] = useState<TeamCoach[]>([]);
  const [parents, setParents] = useState<TeamParent[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // États pour le modal Coach
  const [showCoachModal, setShowCoachModal] = useState<boolean>(false);
  const [editingCoach, setEditingCoach] = useState<TeamCoach | null>(null);
  const [coachForm, setCoachForm] = useState<{
    team_name: string;
    coach_name: string;
    coach_order: number;
  }>({
    team_name: '',
    coach_name: '',
    coach_order: 1,
  });

  // États pour le modal Parent
  const [showParentModal, setShowParentModal] = useState<boolean>(false);
  const [editingParent, setEditingParent] = useState<TeamParent | null>(null);
  const [parentForm, setParentForm] = useState<Partial<Omit<TeamParent, 'id' | 'created_at' | 'updated_at'>>>({
    team_name: '',
    parent_name: '',
    role: 'responsable_stable_de_marque',
    phone: '',
    email: '',
  });

  // États pour les filtres
  const [selectedTeam, setSelectedTeam] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'coaches' | 'parents'>('coaches');

  useEffect(() => {
    checkAuth();
    fetchTeams();
  }, []);

  useEffect(() => {
    if (token) {
      fetchCoaches();
      fetchParents();
    }
  }, [token]);

  const checkAuth = async () => {
    const storedToken = localStorage.getItem('ehr_token');
    const storedUser = localStorage.getItem('ehr_user');
    
    if (storedToken && storedUser && storedUser !== 'undefined' && storedUser !== 'null') {
      try {
        const parsedUser = JSON.parse(storedUser);
        if (parsedUser && parsedUser.username) {
          setToken(storedToken);
          setUser(parsedUser);
          
          const res = await getMe(storedToken);
          if (!res.data) {
            handleLogout();
          }
        } else {
          handleLogout();
        }
      } catch (error) {
        handleLogout();
      }
    } else {
      router.push('/admin');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('ehr_token');
    localStorage.removeItem('ehr_user');
    setUser(null);
    setToken('');
    router.push('/admin');
  };

  const fetchTeams = async () => {
    try {
      const res = await getTeams();
      if (res.data) {
        setTeams(res.data);
      }
    } catch (err) {
      console.error('Erreur lors du chargement des équipes:', err);
    }
  };

  const fetchCoaches = async () => {
    if (!token) return;
    try {
      const res = await getTeamCoaches(token, selectedTeam || undefined);
      if (res.data) {
        setCoaches(res.data);
      }
    } catch (err) {
      console.error('Erreur lors du chargement des entraîneurs:', err);
    }
  };

  const fetchParents = async () => {
    if (!token) return;
    try {
      const res = await getTeamParents(token, selectedTeam || undefined);
      if (res.data) {
        setParents(res.data);
      }
    } catch (err) {
      console.error('Erreur lors du chargement des parents:', err);
    }
  };

  const handleCoachSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      setError('Veuillez vous connecter');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      if (editingCoach) {
        // Mise à jour
        const res = await updateTeamCoach(editingCoach.id, coachForm, token);
        if (res.error) {
          setError(res.error);
        } else {
          setSuccess(`Entraîneur ${coachForm.coach_name} mis à jour avec succès`);
          fetchCoaches();
          closeCoachModal();
        }
      } else {
        // Création
        const res = await createTeamCoach(coachForm, token);
        if (res.error) {
          setError(res.error);
        } else {
          setSuccess(`Entraîneur ${coachForm.coach_name} ajouté avec succès`);
          fetchCoaches();
          closeCoachModal();
        }
      }
    } catch (err) {
      setError('Erreur réseau');
    } finally {
      setLoading(false);
    }
  };

  const handleParentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      setError('Veuillez vous connecter');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      if (editingParent) {
        // Mise à jour
        const res = await updateTeamParent(editingParent.id, parentForm, token);
        if (res.error) {
          setError(res.error);
        } else {
          setSuccess(`Parent ${parentForm.parent_name} mis à jour avec succès`);
          fetchParents();
          closeParentModal();
        }
      } else {
        // Création
        const res = await createTeamParent(parentForm as Omit<TeamParent, 'id' | 'created_at' | 'updated_at'>, token);
        if (res.error) {
          setError(res.error);
        } else {
          setSuccess(`Parent ${parentForm.parent_name} ajouté avec succès`);
          fetchParents();
          closeParentModal();
        }
      }
    } catch (err) {
      setError('Erreur réseau');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCoach = async (coachId: number, coachName: string) => {
    if (!token) {
      setError('Veuillez vous connecter');
      return;
    }
    
    if (!confirm(`Êtes-vous sûr de vouloir supprimer l'entraîneur ${coachName} ?`)) {
      return;
    }
    
    setLoading(true);
    try {
      const res = await deleteTeamCoach(coachId, token);
      if (res.error) {
        setError(res.error);
      } else {
        setSuccess(`Entraîneur supprimé avec succès`);
        fetchCoaches();
      }
    } catch (err) {
      setError('Erreur réseau');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteParent = async (parentId: number, parentName: string) => {
    if (!token) {
      setError('Veuillez vous connecter');
      return;
    }
    
    if (!confirm(`Êtes-vous sûr de vouloir supprimer le parent ${parentName} ?`)) {
      return;
    }
    
    setLoading(true);
    try {
      const res = await deleteTeamParent(parentId, token);
      if (res.error) {
        setError(res.error);
      } else {
        setSuccess(`Parent supprimé avec succès`);
        fetchParents();
      }
    } catch (err) {
      setError('Erreur réseau');
    } finally {
      setLoading(false);
    }
  };

  const openCoachModal = (coach?: TeamCoach) => {
    if (coach) {
      setEditingCoach(coach);
      setCoachForm({
        team_name: coach.team_name,
        coach_name: coach.coach_name,
        coach_order: coach.coach_order,
      });
    } else {
      setEditingCoach(null);
      setCoachForm({
        team_name: '',
        coach_name: '',
        coach_order: 1,
      });
    }
    setShowCoachModal(true);
  };

  const closeCoachModal = () => {
    setShowCoachModal(false);
    setEditingCoach(null);
    setCoachForm({
      team_name: '',
      coach_name: '',
      coach_order: 1,
    });
  };

  const openParentModal = (parent?: TeamParent) => {
    if (parent) {
      setEditingParent(parent);
      setParentForm({
        team_name: parent.team_name,
        parent_name: parent.parent_name,
        role: parent.role,
        phone: parent.phone || '',
        email: parent.email || '',
      });
    } else {
      setEditingParent(null);
      setParentForm({
        team_name: '',
        parent_name: '',
        role: 'responsable_stable_de_marque',
        phone: '',
        email: '',
      });
    }
    setShowParentModal(true);
  };

  const closeParentModal = () => {
    setShowParentModal(false);
    setEditingParent(null);
    setParentForm({
      team_name: '',
      parent_name: '',
      role: 'responsable_stable_de_marque',
      phone: '',
      email: '',
    });
  };

  const handleTeamFilterChange = (teamName: string) => {
    setSelectedTeam(teamName);
    if (activeTab === 'coaches') {
      fetchCoaches();
    } else {
      fetchParents();
    }
  };

  const getCoachesByTeam = (teamName: string) => {
    return coaches.filter(c => c.team_name === teamName);
  };

  const getParentsByTeam = (teamName: string) => {
    return parents.filter(p => p.team_name === teamName);
  };

  const ROLE_LABELS: Record<string, string> = {
    'responsable_stable_de_marque': 'Responsable Stable de Marque',
    'responsable_salle': 'Responsable de Salle',
  };

  if (!user) {
    router.push('/admin');
    return null;
  }

  // Vérifier que l'utilisateur est admin
  if (user.role !== 'admin') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
        <Navbar />
        <main className="max-w-md mx-auto px-4 sm:px-6 lg:px-8 py-24">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg p-8 text-center">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
              Accès refusé
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              Vous n'avez pas les droits nécessaires pour accéder à cette page.
            </p>
            <button
              onClick={() => router.push('/')}
              className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
            >
              Retour à l'accueil
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <Navbar />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Gestion des Encadrants
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Gérez les entraîneurs et parents dirigeants par équipe
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-800/30 text-red-700 dark:text-red-400 rounded-lg transition text-sm font-medium"
          >
            Déconnexion
          </button>
        </div>

        {/* Messages */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-4 py-3 rounded-lg mb-6">
            {success}
          </div>
        )}

        {/* Filtre par équipe */}
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-md p-6 mb-8">
          <div className="flex flex-col md:flex-row gap-4 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Filtrer par équipe
              </label>
              <select
                value={selectedTeam}
                onChange={(e) => handleTeamFilterChange(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Toutes les équipes</option>
                {teams.map((team) => (
                  <option key={team.nom} value={team.nom}>
                    {team.nom}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Onglets */}
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-md p-6 mb-8">
          <div className="flex border-b border-gray-200 dark:border-gray-700 mb-6">
            <button
              onClick={() => setActiveTab('coaches')}
              className={`px-4 py-2 text-sm font-medium transition ${
                activeTab === 'coaches'
                  ? 'border-b-2 border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Entraîneurs ({coaches.length})
            </button>
            <button
              onClick={() => setActiveTab('parents')}
              className={`px-4 py-2 text-sm font-medium transition ${
                activeTab === 'parents'
                  ? 'border-b-2 border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Parents Dirigeants ({parents.length})
            </button>
          </div>

          {activeTab === 'coaches' && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Entraîneurs
                </h2>
                <button
                  onClick={() => openCoachModal()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition flex items-center"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Ajouter un entraîneur
                </button>
              </div>

              {selectedTeam ? (
                /* Affichage par équipe */
                <div className="space-y-6">
                  {teams
                    .filter(t => !selectedTeam || t.nom === selectedTeam)
                    .map((team) => {
                      const teamCoaches = getCoachesByTeam(team.nom);
                      return (
                        <div key={team.nom} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                          <div className="flex justify-between items-center mb-4">
                            <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                              {team.nom}
                            </h3>
                            <span className="text-sm text-gray-500 dark:text-gray-400">
                              {teamCoaches.length}/3 entraîneurs
                            </span>
                          </div>
                          {teamCoaches.length === 0 ? (
                            <p className="text-gray-500 dark:text-gray-400 text-center py-4">
                              Aucun entraîneur pour cette équipe
                            </p>
                          ) : (
                            <div className="space-y-3">
                              {teamCoaches.map((coach) => (
                                <div
                                  key={coach.id}
                                  className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                                >
                                  <div>
                                    <div className="font-medium text-gray-900 dark:text-gray-100">
                                      {coach.coach_name}
                                    </div>
                                    <div className="text-sm text-gray-500 dark:text-gray-400">
                                      Ordre: {coach.coach_order}
                                    </div>
                                  </div>
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => openCoachModal(coach)}
                                      className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded transition"
                                      title="Modifier"
                                    >
                                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                      </svg>
                                    </button>
                                    <button
                                      onClick={() => handleDeleteCoach(coach.id, coach.coach_name)}
                                      className="p-2 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition"
                                      title="Supprimer"
                                    >
                                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                      </svg>
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          <button
                            onClick={() => openCoachModal()}
                            className="mt-3 w-full text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center justify-center"
                          >
                            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                            </svg>
                            Ajouter un entraîneur pour {team.nom}
                          </button>
                        </div>
                      );
                    })}
                </div>
              ) : (
                /* Affichage de tous les entraîneurs */
                <div className="space-y-6">
                  {teams.map((team) => {
                    const teamCoaches = getCoachesByTeam(team.nom);
                    if (teamCoaches.length === 0) return null;
                    return (
                      <div key={team.nom} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                        <div className="flex justify-between items-center mb-4">
                          <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                            {team.nom}
                          </h3>
                          <span className="text-sm text-gray-500 dark:text-gray-400">
                            {teamCoaches.length} entraîneur(s)
                          </span>
                        </div>
                        <div className="space-y-3">
                          {teamCoaches.map((coach) => (
                            <div
                              key={coach.id}
                              className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                            >
                              <div>
                                <div className="font-medium text-gray-900 dark:text-gray-100">
                                  {coach.coach_name}
                                </div>
                                <div className="text-sm text-gray-500 dark:text-gray-400">
                                  Ordre: {coach.coach_order}
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => openCoachModal(coach)}
                                  className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded transition"
                                  title="Modifier"
                                >
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                </button>
                                <button
                                  onClick={() => handleDeleteCoach(coach.id, coach.coach_name)}
                                  className="p-2 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition"
                                  title="Supprimer"
                                >
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'parents' && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Parents Dirigeants
                </h2>
                <button
                  onClick={() => openParentModal()}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition flex items-center"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Ajouter un parent
                </button>
              </div>

              {selectedTeam ? (
                /* Affichage par équipe */
                <div className="space-y-6">
                  {teams
                    .filter(t => !selectedTeam || t.nom === selectedTeam)
                    .map((team) => {
                      const teamParentsList = getParentsByTeam(team.nom);
                      return (
                        <div key={team.nom} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                          <div className="flex justify-between items-center mb-4">
                            <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                              {team.nom}
                            </h3>
                            <span className="text-sm text-gray-500 dark:text-gray-400">
                              {teamParentsList.length} parent(s)
                            </span>
                          </div>
                          {teamParentsList.length === 0 ? (
                            <p className="text-gray-500 dark:text-gray-400 text-center py-4">
                              Aucun parent dirigeant pour cette équipe
                            </p>
                          ) : (
                            <div className="space-y-3">
                              {teamParentsList.map((parent) => (
                                <div
                                  key={parent.id}
                                  className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                                >
                                  <div>
                                    <div className="font-medium text-gray-900 dark:text-gray-100">
                                      {parent.parent_name}
                                    </div>
                                    <div className="text-sm text-gray-500 dark:text-gray-400">
                                      {ROLE_LABELS[parent.role] || parent.role}
                                    </div>
                                    {parent.phone && (
                                      <div className="text-xs text-gray-400 dark:text-gray-500">
                                        Tel: {parent.phone}
                                      </div>
                                    )}
                                    {parent.email && (
                                      <div className="text-xs text-gray-400 dark:text-gray-500">
                                        Email: {parent.email}
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => openParentModal(parent)}
                                      className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded transition"
                                      title="Modifier"
                                    >
                                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                      </svg>
                                    </button>
                                    <button
                                      onClick={() => handleDeleteParent(parent.id, parent.parent_name)}
                                      className="p-2 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition"
                                      title="Supprimer"
                                    >
                                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                      </svg>
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          <button
                            onClick={() => openParentModal()}
                            className="mt-3 w-full text-sm text-green-600 dark:text-green-400 hover:underline flex items-center justify-center"
                          >
                            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                            </svg>
                            Ajouter un parent pour {team.nom}
                          </button>
                        </div>
                      );
                    })}
                </div>
              ) : (
                /* Affichage de tous les parents */
                <div className="space-y-6">
                  {teams.map((team) => {
                    const teamParentsList = getParentsByTeam(team.nom);
                    if (teamParentsList.length === 0) return null;
                    return (
                      <div key={team.nom} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                        <div className="flex justify-between items-center mb-4">
                          <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                            {team.nom}
                          </h3>
                          <span className="text-sm text-gray-500 dark:text-gray-400">
                            {teamParentsList.length} parent(s)
                          </span>
                        </div>
                        <div className="space-y-3">
                          {teamParentsList.map((parent) => (
                            <div
                              key={parent.id}
                              className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                            >
                              <div>
                                <div className="font-medium text-gray-900 dark:text-gray-100">
                                  {parent.parent_name}
                                </div>
                                <div className="text-sm text-gray-500 dark:text-gray-400">
                                  {ROLE_LABELS[parent.role] || parent.role}
                                </div>
                                {parent.phone && (
                                  <div className="text-xs text-gray-400 dark:text-gray-500">
                                    Tel: {parent.phone}
                                  </div>
                                )}
                                {parent.email && (
                                  <div className="text-xs text-gray-400 dark:text-gray-500">
                                    Email: {parent.email}
                                  </div>
                                )}
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => openParentModal(parent)}
                                  className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded transition"
                                  title="Modifier"
                                >
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                </button>
                                <button
                                  onClick={() => handleDeleteParent(parent.id, parent.parent_name)}
                                  className="p-2 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition"
                                  title="Supprimer"
                                >
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Modal Coach */}
      {showCoachModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                {editingCoach ? 'Modifier Entraîneur' : 'Ajouter Entraîneur'}
              </h2>
              <button
                onClick={closeCoachModal}
                className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 rounded transition"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleCoachSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Équipe*
                </label>
                <select
                  value={coachForm.team_name}
                  onChange={(e) => setCoachForm({ ...coachForm, team_name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">Sélectionnez une équipe</option>
                  {teams.map((team) => (
                    <option key={team.nom} value={team.nom}>
                      {team.nom}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Nom de l'entraîneur*
                </label>
                <input
                  type="text"
                  value={coachForm.coach_name}
                  onChange={(e) => setCoachForm({ ...coachForm, coach_name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Ordre (1-3)*
                </label>
                <select
                  value={coachForm.coach_order}
                  onChange={(e) => setCoachForm({ ...coachForm, coach_order: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  {[1, 2, 3].map((order) => (
                    <option key={order} value={order}>
                      Entraîneur {order}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={closeCoachModal}
                  className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg transition flex items-center"
                >
                  {loading ? (
                    <>
                      <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                      En cours...
                    </>
                  ) : (
                    'Enregistrer'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Parent */}
      {showParentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                {editingParent ? 'Modifier Parent Dirigeant' : 'Ajouter Parent Dirigeant'}
              </h2>
              <button
                onClick={closeParentModal}
                className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 rounded transition"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleParentSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Équipe*
                </label>
                <select
                  value={parentForm.team_name}
                  onChange={(e) => setParentForm({ ...parentForm, team_name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500"
                  required
                >
                  <option value="">Sélectionnez une équipe</option>
                  {teams.map((team) => (
                    <option key={team.nom} value={team.nom}>
                      {team.nom}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Nom du parent*
                </label>
                <input
                  type="text"
                  value={parentForm.parent_name}
                  onChange={(e) => setParentForm({ ...parentForm, parent_name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Rôle*
                </label>
                <select
                  value={parentForm.role}
                  onChange={(e) => setParentForm({ ...parentForm, role: e.target.value as ParentRole })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500"
                  required
                >
                  <option value="responsable_stable_de_marque">Responsable Stable de Marque</option>
                  <option value="responsable_salle">Responsable de Salle</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Téléphone
                </label>
                <input
                  type="tel"
                  value={parentForm.phone}
                  onChange={(e) => setParentForm({ ...parentForm, phone: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="06 12 34 56 78"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={parentForm.email}
                  onChange={(e) => setParentForm({ ...parentForm, email: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="parent@email.com"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={closeParentModal}
                  className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-medium rounded-lg transition flex items-center"
                >
                  {loading ? (
                    <>
                      <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                      En cours...
                    </>
                  ) : (
                    'Enregistrer'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <footer className="bg-gray-100 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 mt-12 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm text-gray-500 dark:text-gray-400">
          © {new Date().getFullYear()} EHR Planning - Gestion des encadrants
        </div>
      </footer>
    </div>
  );
}
