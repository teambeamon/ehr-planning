'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import {
  getInventory,
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  getMe
} from '@/lib/api';
import { InventoryItem, InventoryCategory, INVENTORY_CATEGORY_LABELS, INVENTORY_CATEGORY_COLORS } from '@/lib/types';

export default function InventoryPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [token, setToken] = useState<string>('');
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // États pour le modal
  const [showModal, setShowModal] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [formData, setFormData] = useState<{
    name: string;
    category: InventoryCategory | string;
    quantity: number;
    location: string;
    responsible: string;
    notes: string;
  }>({
    name: '',
    category: 'ballons',
    quantity: 1,
    location: '',
    responsible: '',
    notes: '',
  });

  // États pour les filtres
  const [selectedCategory, setSelectedCategory] = useState<string>('tout');
  const [searchQuery, setSearchQuery] = useState<string>('');

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (token) {
      fetchInventory();
    }
  }, [token, selectedCategory, searchQuery]);

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

  const fetchInventory = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await getInventory(token, selectedCategory === 'tout' ? undefined : selectedCategory, searchQuery || undefined);
      if (res.error) {
        setError(res.error);
      } else {
        setInventory(res.data || []);
      }
    } catch (err) {
      setError('Erreur lors du chargement de l\'inventaire');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      setError('Veuillez vous connecter');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      if (editingItem) {
        // Mise à jour
        const res = await updateInventoryItem(editingItem.id, formData, token);
        if (res.error) {
          setError(res.error);
        } else {
          setSuccess(`Article "${formData.name}" mis à jour avec succès`);
          fetchInventory();
          closeModal();
        }
      } else {
        // Création
        const res = await createInventoryItem(formData as any, token);
        if (res.error) {
          setError(res.error);
        } else {
          setSuccess(`Article "${formData.name}" ajouté avec succès`);
          fetchInventory();
          closeModal();
        }
      }
    } catch (err) {
      setError('Erreur réseau');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (itemId: number, itemName: string) => {
    if (!token) {
      setError('Veuillez vous connecter');
      return;
    }
    
    if (!confirm(`Êtes-vous sûr de vouloir supprimer l'article "${itemName}" ?`)) {
      return;
    }
    
    setLoading(true);
    try {
      const res = await deleteInventoryItem(itemId, token);
      if (res.error) {
        setError(res.error);
      } else {
        setSuccess(`Article supprimé avec succès`);
        fetchInventory();
      }
    } catch (err) {
      setError('Erreur réseau');
    } finally {
      setLoading(false);
    }
  };

  const openModal = (item?: InventoryItem) => {
    if (item) {
      setEditingItem(item);
      setFormData({
        name: item.name,
        category: item.category as InventoryCategory,
        quantity: item.quantity,
        location: item.location || '',
        responsible: item.responsible || '',
        notes: item.notes || '',
      });
    } else {
      setEditingItem(null);
      setFormData({
        name: '',
        category: 'ballons',
        quantity: 1,
        location: '',
        responsible: '',
        notes: '',
      });
    }
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingItem(null);
    setFormData({
      name: '',
      category: 'ballons',
      quantity: 1,
      location: '',
      responsible: '',
      notes: '',
    });
  };

  const handleQuantityChange = (change: number) => {
    const newQuantity = formData.quantity + change;
    if (newQuantity >= 0) {
      setFormData({ ...formData, quantity: newQuantity });
    }
  };

  const categories: InventoryCategory[] = [
    'ballons',
    'maillots',
    'dossards',
    'cles',
    'badges',
    'chronometres',
    'buts_portatifs',
    'filets',
    'autre'
  ];

  if (!user) {
    router.push('/admin');
    return null;
  }

  // Vérifier que l'utilisateur est connecté (au moins viewer)
  if (!user.username) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
        <Navbar />
        <main className="max-w-md mx-auto px-4 sm:px-6 lg:px-8 py-24">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg p-8 text-center">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
              Accès refusé
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              Veuillez vous connecter pour accéder à cette page.
            </p>
            <button
              onClick={() => router.push('/admin')}
              className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
            >
              Se connecter
            </button>
          </div>
        </main>
      </div>
    );
  }

  // Calculer les totaux par catégorie
  const getCategoryTotals = () => {
    const totals: Record<string, { count: number; quantity: number }> = {};
    categories.forEach(cat => {
      totals[cat] = { count: 0, quantity: 0 };
    });
    
    inventory.forEach(item => {
      if (totals[item.category]) {
        totals[item.category].count++;
        totals[item.category].quantity += item.quantity;
      }
    });
    
    return totals;
  };

  const categoryTotals = getCategoryTotals();
  const totalItems = inventory.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <Navbar />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Inventaire Matériel
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Gestion du matériel du club de handball
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

        {/* Résumé par catégorie */}
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-md p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Résumé par catégorie
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {categories.map((category) => {
              const label = INVENTORY_CATEGORY_LABELS[category] || category;
              const color = INVENTORY_CATEGORY_COLORS[category] || '#6366f1';
              const total = categoryTotals[category];
              return (
                <div
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className={`p-4 rounded-lg transition cursor-pointer ${selectedCategory === category ? 'ring-2 ring-blue-500' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                  style={{ backgroundColor: `${color}20` }}
                >
                  <div className="font-medium text-gray-900 dark:text-gray-100 text-sm">
                    {label}
                  </div>
                  <div className="text-2xl font-bold text-gray-800 dark:text-gray-200 mt-1">
                    {total?.quantity || 0}
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">
                    {total?.count || 0} article(s)
                  </div>
                </div>
              );
            })}
            <div
              onClick={() => setSelectedCategory('tout')}
              className={`p-4 rounded-lg transition cursor-pointer flex items-center justify-center ${selectedCategory === 'tout' ? 'ring-2 ring-blue-500' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}`}
            >
              <div className="text-center">
                <div className="font-medium text-gray-900 dark:text-gray-100 text-sm">
                  Total
                </div>
                <div className="text-2xl font-bold text-gray-800 dark:text-gray-200 mt-1">
                  {totalItems}
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400">
                  {inventory.length} article(s)
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Filtres */}
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-md p-6 mb-8">
          <div className="flex flex-col md:flex-row gap-4 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Catégorie
              </label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="tout">Toutes les catégories</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {INVENTORY_CATEGORY_LABELS[cat] || cat}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Rechercher
              </label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Nom, lieu, responsable, notes..."
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={() => openModal()}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition flex items-center"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Ajouter
            </button>
          </div>
        </div>

        {/* Liste de l'inventaire */}
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-md p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Liste du matériel ({inventory.length} articles)
            </h2>
            <button
              onClick={() => fetchInventory()}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center"
            >
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h5M20 20v-5h-5M4 20h5v-5M20 4h-5v5" />
              </svg>
              Rafraîchir
            </button>
          </div>

          {inventory.length === 0 ? (
            <div className="text-center py-12">
              <svg className="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
              <p className="text-gray-500 dark:text-gray-400">
                Aucun article trouvé
              </p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
                Ajoutez du matériel en cliquant sur le bouton "Ajouter"
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Article
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Catégorie
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Quantité
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Emplacement
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Responsable
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                  {inventory.map((item) => {
                    const color = INVENTORY_CATEGORY_COLORS[item.category] || '#6366f1';
                    const lowStock = item.quantity <= 2;
                    return (
                      <tr
                        key={item.id}
                        className="hover:bg-gray-50 dark:hover:bg-gray-800/50"
                      >
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="font-medium text-gray-900 dark:text-gray-100">
                            {item.name}
                          </div>
                          {item.notes && (
                            <div className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[200px]" title={item.notes}>
                              {item.notes}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className="px-2 py-1 rounded-full text-xs font-medium"
                            style={{ backgroundColor: `${color}20`, color }}
                          >
                            {INVENTORY_CATEGORY_LABELS[item.category] || item.category}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium ${
                              lowStock
                                ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                            }`}
                          >
                            {item.quantity}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                          {item.location || '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                          {item.responsible || '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => openModal(item)}
                              className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded transition"
                              title="Modifier"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleDelete(item.id, item.name)}
                              className="p-2 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition"
                              title="Supprimer"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
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

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                {editingItem ? 'Modifier Article' : 'Ajouter Article'}
              </h2>
              <button
                onClick={closeModal}
                className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 rounded transition"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Nom*
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="ex: Ballon taille 3"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Catégorie*
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value as InventoryCategory })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500"
                  required
                >
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {INVENTORY_CATEGORY_LABELS[cat] || cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Quantité*
                </label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => handleQuantityChange(-1)}
                    className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition disabled:opacity-50"
                    disabled={formData.quantity <= 0}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  <input
                    type="number"
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 0 })}
                    min="0"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500 text-center"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => handleQuantityChange(1)}
                    className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    </svg>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Emplacement
                </label>
                <input
                  type="text"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="ex: Salle Hettange, Vestiaire 1"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Responsable
                </label>
                <input
                  type="text"
                  value={formData.responsible}
                  onChange={(e) => setFormData({ ...formData, responsible: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="ex: Jean Dupont"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Notes
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                  placeholder="ex: À remplacer prochainement, Numéro de série: XYZ123"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={closeModal}
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
          © {new Date().getFullYear()} EHR Planning - Gestion de l'inventaire
        </div>
      </footer>
    </div>
  );
}
