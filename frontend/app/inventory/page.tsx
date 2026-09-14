'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { getInventory, createInventoryItem, updateInventoryItem, deleteInventoryItem, getMe, getTeams } from '@/lib/api';
import { InventoryItem, InventoryCategory, INVENTORY_CATEGORY_LABELS, INVENTORY_CATEGORY_COLORS, User } from '@/lib/types';

const conditions = [
  { value: 'tout', label: 'Toutes' },
  { value: 'neuf', label: 'Neuf' },
  { value: 'bon', label: 'Bon' },
  { value: 'use', label: 'Usagé' },
  { value: 'a_remplacer', label: 'À remplacer' },
  { value: 'hors_service', label: 'Hors service' }
];

const categories: InventoryCategory[] = ['ballons', 'maillots', 'dossards', 'cles', 'badges', 'chronometres', 'buts_portatifs', 'filets', 'autre'];

export default function InventoryPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string>('');
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [teams, setTeams] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState<boolean>(false);
  const [showModal, setShowModal] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [formData, setFormData] = useState<Partial<InventoryItem>>({
    name: '', category: 'ballons', quantity: 1, location: '', responsible: '', notes: '',
    purchase_date: '', purchase_year: new Date().getFullYear(), cost: 0, team_owner: '',
    item_condition: 'neuf', serial_number: '', supplier: '', warranty_until: '', assigned_to: ''
  });
  const [selectedCategory, setSelectedCategory] = useState<string>('tout');
  const [selectedTeam, setSelectedTeam] = useState<string>('tout');
  const [selectedYear, setSelectedYear] = useState<string>('tout');
  const [selectedCondition, setSelectedCondition] = useState<string>('tout');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [supplierFilter, setSupplierFilter] = useState<string>('');
  const [showReport, setShowReport] = useState<string | null>(null);
  const [reportData, setReportData] = useState<any>(null);
  const [reportLoading, setReportLoading] = useState<boolean>(false);

  const years = useMemo(() => {
    const y = new Set<number>();
    inventory.forEach(item => { if (item.purchase_year) y.add(item.purchase_year); });
    return Array.from(y).sort((a, b) => b - a);
  }, [inventory]);

  const suppliers = useMemo(() => {
    const s = new Set<string>();
    inventory.forEach(item => { if (item.supplier) s.add(item.supplier); });
    return Array.from(s).sort();
  }, [inventory]);

  useEffect(() => { checkAuth(); fetchTeams(); }, []);
  useEffect(() => { if (token) fetchInventory(); }, [token, selectedCategory, selectedTeam, selectedYear, selectedCondition, searchQuery, supplierFilter]);

  const checkAuth = async () => {
    const storedToken = localStorage.getItem('ehr_token');
    const storedUser = localStorage.getItem('ehr_user');
    if (storedToken && storedUser && storedUser !== 'undefined' && storedUser !== 'null') {
      try {
        const parsedUser = JSON.parse(storedUser);
        if (parsedUser && parsedUser.username) {
          setToken(storedToken); setUser(parsedUser);
          const res = await getMe(storedToken);
          if (!res.data) { handleLogout(); return; }
          setAuthChecked(true); return;
        }
      } catch (error) {}
    }
    handleLogout();
  };

  const fetchTeams = async () => {
    try { const res = await getTeams(); if (res.data) setTeams(res.data.map(t => t.nom)); }
    catch (err) {}
  };

  const handleLogout = () => {
    localStorage.removeItem('ehr_token'); localStorage.removeItem('ehr_user');
    setUser(null); setToken(''); router.push('/login');
  };

  const fetchInventory = async () => {
    if (!token) return; setLoading(true);
    try {
      const res = await getInventory(token, selectedCategory === 'tout' ? undefined : selectedCategory, searchQuery || undefined,
        selectedTeam === 'tout' ? undefined : selectedTeam, selectedYear === 'tout' ? undefined : selectedYear,
        selectedCondition === 'tout' ? undefined : selectedCondition, supplierFilter || undefined);
      if (res.error) setError(res.error); else setInventory(res.data || []);
    } catch (err) { setError('Erreur chargement'); }
    finally { setLoading(false); }
  };

  const fetchReport = async (reportType: string) => {
    if (!token) return; setReportLoading(true);
    try {
      if (reportType === 'summary') {
        const totalItems = inventory.length;
        const totalQuantity = inventory.reduce((sum, item) => sum + (item.quantity || 0), 0);
        const totalValue = inventory.reduce((sum, item) => sum + ((item.cost || 0) * (item.quantity || 0)), 0);
        const avgCost = inventory.length > 0 ? totalValue / totalItems : 0;
        setReportData({ totalItems, totalQuantity, totalValue: Math.round(totalValue * 100) / 100, avgCost: Math.round(avgCost * 100) / 100, itemsToReplace: inventory.filter(i => i.item_condition === 'a_remplacer' || i.item_condition === 'hors_service').length, itemsWithWarranty: inventory.filter(i => i.warranty_until).length });
      } else if (reportType === 'by_team') {
        const byTeam: Record<string, { items: number; quantity: number; value: number }> = {};
        inventory.forEach(item => {
          const team = item.team_owner || 'Non assigné';
          if (!byTeam[team]) byTeam[team] = { items: 0, quantity: 0, value: 0 };
          byTeam[team].items++; byTeam[team].quantity += (item.quantity || 0); byTeam[team].value += ((item.cost || 0) * (item.quantity || 0));
        });
        setReportData(Object.entries(byTeam).map(([t, d]) => ({ team: t, items: d.items, quantity: d.quantity, value: Math.round(d.value * 100) / 100 })));
      } else if (reportType === 'by_category') {
        const byCat: Record<string, { items: number; quantity: number; value: number }> = {};
        inventory.forEach(item => {
          const cat = item.category || 'autre';
          if (!byCat[cat]) byCat[cat] = { items: 0, quantity: 0, value: 0 };
          byCat[cat].items++; byCat[cat].quantity += (item.quantity || 0); byCat[cat].value += ((item.cost || 0) * (item.quantity || 0));
        });
        setReportData(Object.entries(byCat).map(([c, d]) => ({ category: c, items: d.items, quantity: d.quantity, value: Math.round(d.value * 100) / 100 })));
      } else if (reportType === 'by_year') {
        const byYear: Record<number, { items: number; quantity: number; value: number }> = {};
        inventory.forEach(item => {
          const year = item.purchase_year; if (year) {
            if (!byYear[year]) byYear[year] = { items: 0, quantity: 0, value: 0 };
            byYear[year].items++; byYear[year].quantity += (item.quantity || 0); byYear[year].value += ((item.cost || 0) * (item.quantity || 0));
          }
        });
        setReportData(Object.entries(byYear).sort(([a], [b]) => Number(b) - Number(a)).map(([y, d]) => ({ year: Number(y), items: d.items, quantity: d.quantity, value: Math.round(d.value * 100) / 100 })));
      } else if (reportType === 'by_condition') {
        const byCond: Record<string, { items: number; quantity: number; value: number }> = {};
        inventory.forEach(item => {
          const cond = item.item_condition || 'inconnu';
          if (!byCond[cond]) byCond[cond] = { items: 0, quantity: 0, value: 0 };
          byCond[cond].items++; byCond[cond].quantity += (item.quantity || 0); byCond[cond].value += ((item.cost || 0) * (item.quantity || 0));
        });
        setReportData(Object.entries(byCond).map(([c, d]) => ({ condition: c, items: d.items, quantity: d.quantity, value: Math.round(d.value * 100) / 100 })));
      } else if (reportType === 'to_replace') {
        setReportData(inventory.filter(item => item.item_condition === 'a_remplacer' || item.item_condition === 'hors_service'));
      } else if (reportType === 'warranty_expiring') {
        const now = new Date(); const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        setReportData(inventory.filter(item => {
          if (!item.warranty_until) return false; const wd = new Date(item.warranty_until);
          return wd >= now && wd <= in30Days;
        }));
      }
    } catch (err) { setError('Erreur rapport'); }
    finally { setReportLoading(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!token) { setError('Connectez-vous'); return; }
    if (!formData.name || !formData.name.trim()) { setError('Le nom est obligatoire'); return; }
    setLoading(true); setError(null);
    try {
      if (editingItem) {
        const res = await updateInventoryItem(editingItem.id, formData, token);
        if (res.error) setError(res.error); else { setSuccess(`"${formData.name}" mis à jour`); fetchInventory(); closeModal(); }
      } else {
        const res = await createInventoryItem(formData as any, token);
        if (res.error) setError(res.error); else { setSuccess(`"${formData.name}" ajouté`); fetchInventory(); closeModal(); }
      }
    } catch (err) { setError('Erreur'); } finally { setLoading(false); }
  };

  const handleDelete = async (itemId: number, itemName: string) => {
    if (!token) { setError('Connectez-vous'); return; }
    if (!confirm(`Supprimer "${itemName}" ?`)) return;
    setLoading(true);
    try { const res = await deleteInventoryItem(itemId, token);
      if (res.error) setError(res.error); else { setSuccess('Supprimé'); fetchInventory(); }
    } catch (err) { setError('Erreur'); } finally { setLoading(false); }
  };

  const openModal = (item?: InventoryItem) => {
    setEditingItem(item || null);
    const defaultData = { name: '', category: 'ballons', quantity: 1, location: '', responsible: '', notes: '', purchase_date: '', purchase_year: new Date().getFullYear(), cost: 0, team_owner: '', item_condition: 'neuf', serial_number: '', supplier: '', warranty_until: '', assigned_to: '' };
    setFormData(item ? { ...item, name: item.name || '', category: item.category || 'ballons', quantity: item.quantity || 1, location: item.location || '', responsible: item.responsible || '', notes: item.notes || '', purchase_date: item.purchase_date || '', purchase_year: item.purchase_year || new Date().getFullYear(), cost: item.cost || 0, team_owner: item.team_owner || '', item_condition: item.item_condition || 'neuf', serial_number: item.serial_number || '', supplier: item.supplier || '', warranty_until: item.warranty_until || '', assigned_to: item.assigned_to || '' } : defaultData);
    setShowModal(true);
  };

  const closeModal = () => { setShowModal(false); setEditingItem(null); setFormData({ name: '', category: 'ballons', quantity: 1, location: '', responsible: '', notes: '', purchase_date: '', purchase_year: new Date().getFullYear(), cost: 0, team_owner: '', item_condition: 'neuf', serial_number: '', supplier: '', warranty_until: '', assigned_to: '' }); };

  const handleQuantityChange = (change: number) => {
    const current = formData.quantity || 0; const newQ = current + change;
    if (newQ >= 0) setFormData({ ...formData, quantity: newQ });
  };

  const getConditionColor = (cond: string) => {
    switch (cond) {
      case 'neuf': return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400';
      case 'bon': return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400';
      case 'use': return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400';
      case 'a_remplacer': return 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400';
      case 'hors_service': return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400';
      default: return 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300';
    }
  };

  const getConditionLabel = (cond: string) => {
    const c = conditions.find(x => x.value === cond); return c ? c.label : cond;
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value);
  };

  const totalItems = inventory.length;
  const totalQuantity = inventory.reduce((sum, i) => sum + (i.quantity || 0), 0);
  const totalValue = inventory.reduce((sum, i) => sum + ((i.cost || 0) * (i.quantity || 0)), 0);
  const itemsToReplace = inventory.filter(i => i.item_condition === 'a_remplacer' || i.item_condition === 'hors_service').length;
  const itemsWithWarranty = inventory.filter(i => i.warranty_until).length;

  if (!authChecked) return <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center"><div className="animate-spin h-12 w-12 border-4 border-blue-500 border-t-transparent rounded-full"></div></div>;
  if (!user) { router.push('/login?redirect=/inventory'); return null; }

  const categoryTotals = () => {
    const totals: Record<string, { count: number; quantity: number; value: number }> = {};
    categories.forEach(c => { totals[c] = { count: 0, quantity: 0, value: 0 }; });
    inventory.forEach(item => {
      const c = item.category || 'autre';
      if (totals[c]) { totals[c].count++; totals[c].quantity += (item.quantity || 0); totals[c].value += ((item.cost || 0) * (item.quantity || 0)); }
    });
    return totals;
  };

  const catTotals = categoryTotals();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 md:py-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 md:mb-8 gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">Inventaire Matériel</h1>
            <p className="text-gray-600 dark:text-gray-400 text-sm md:text-base">Gestion complète du matériel du club</p>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            <button onClick={() => setShowReport('summary')} className="px-2.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium rounded-lg transition flex items-center">Rapports <svg className="w-3.5 h-3.5 ml-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg></button>
            <button onClick={() => openModal()} className="px-2.5 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg transition flex items-center">Ajouter <svg className="w-3.5 h-3.5 ml-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg></button>
            <button onClick={handleLogout} className="px-2.5 py-1.5 bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-800/30 text-red-700 dark:text-red-400 rounded-lg transition text-xs font-medium">Déconnexion</button>
          </div>
        </div>

        {error && <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>}
        {success && <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-4 py-3 rounded-lg mb-4 text-sm">{success}</div>}
        {loading && !showReport && <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400 px-4 py-3 rounded-lg mb-4 flex items-center text-sm"><div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full mr-2"></div>Chargement...</div>}

        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-md p-4 md:p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Tableau de bord</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 dark:from-blue-700 dark:to-blue-800 rounded-lg p-3 md:p-4 text-white text-center">
              <div className="text-xl md:text-2xl font-bold">{totalItems}</div>
              <div className="text-xs md:text-sm opacity-90">Articles</div>
            </div>
            <div className="bg-gradient-to-br from-green-500 to-green-600 dark:from-green-700 dark:to-green-800 rounded-lg p-3 md:p-4 text-white text-center">
              <div className="text-xl md:text-2xl font-bold">{totalQuantity}</div>
              <div className="text-xs md:text-sm opacity-90">Quantité</div>
            </div>
            <div className="bg-gradient-to-br from-purple-500 to-purple-600 dark:from-purple-700 dark:to-purple-800 rounded-lg p-3 md:p-4 text-white text-center">
              <div className="text-xl md:text-2xl font-bold">{formatCurrency(totalValue)}</div>
              <div className="text-xs md:text-sm opacity-90">Valeur</div>
            </div>
            <div className="bg-gradient-to-br from-orange-500 to-orange-600 dark:from-orange-700 dark:to-orange-800 rounded-lg p-3 md:p-4 text-white text-center">
              <div className="text-xl md:text-2xl font-bold">{itemsToReplace}</div>
              <div className="text-xs md:text-sm opacity-90">À remplacer</div>
            </div>
            <div className="bg-gradient-to-br from-cyan-500 to-cyan-600 dark:from-cyan-700 dark:to-cyan-800 rounded-lg p-3 md:p-4 text-white text-center">
              <div className="text-xl md:text-2xl font-bold">{itemsWithWarranty}</div>
              <div className="text-xs md:text-sm opacity-90">Sous garantie</div>
            </div>
            <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 dark:from-indigo-700 dark:to-indigo-800 rounded-lg p-3 md:p-4 text-white text-center">
              <div className="text-xl md:text-2xl font-bold">{categories.length}</div>
              <div className="text-xs md:text-sm opacity-90">Catégories</div>
            </div>
          </div>
        </div>

        {showReport && <div className="bg-white dark:bg-gray-900 rounded-xl shadow-md p-4 md:p-6 mb-6">
          <div className="flex justify-between items-center mb-4 md:mb-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {showReport === 'summary' ? 'Résumé global' : showReport === 'by_team' ? 'Par équipe' : showReport === 'by_category' ? 'Par catégorie' : showReport === 'by_year' ? 'Par année' : showReport === 'by_condition' ? 'Par condition' : showReport === 'to_replace' ? 'À remplacer' : 'Garanties expirant'}
            </h2>
            <button onClick={() => setShowReport(null)} className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 rounded transition"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg></button>
          </div>
          {reportLoading ? <div className="flex justify-center py-8"><div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full"></div></div> : <>
            {showReport === 'summary' && reportData && <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 text-center"><h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2 text-sm">Articles</h3><p className="text-2xl md:text-3xl font-bold text-blue-600 dark:text-blue-400">{reportData.totalItems}</p></div>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 text-center"><h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2 text-sm">Quantité</h3><p className="text-2xl md:text-3xl font-bold text-green-600 dark:text-green-400">{reportData.totalQuantity}</p></div>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 text-center"><h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2 text-sm">Valeur</h3><p className="text-2xl md:text-3xl font-bold text-purple-600 dark:text-purple-400">{formatCurrency(reportData.totalValue)}</p></div>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 text-center"><h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2 text-sm">Coût moyen</h3><p className="text-2xl md:text-3xl font-bold text-cyan-600 dark:text-cyan-400">{formatCurrency(reportData.avgCost)}</p></div>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 text-center"><h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2 text-sm">À remplacer</h3><p className="text-2xl md:text-3xl font-bold text-orange-600 dark:text-orange-400">{reportData.itemsToReplace}</p></div>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 text-center"><h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2 text-sm">Sous garantie</h3><p className="text-2xl md:text-3xl font-bold text-indigo-600 dark:text-indigo-400">{reportData.itemsWithWarranty}</p></div>
            </div>}
            {(showReport === 'by_team' || showReport === 'by_category' || showReport === 'by_year' || showReport === 'by_condition') && reportData && 
              <div className="overflow-x-auto"><table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800"><tr>
                  {showReport === 'by_team' && <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Équipe</th>}
                  {showReport === 'by_category' && <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Catégorie</th>}
                  {showReport === 'by_year' && <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Année</th>}
                  {showReport === 'by_condition' && <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Condition</th>}
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Articles</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Quantité</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Valeur</th></tr></thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                  {reportData.map((row: any, i: number) => <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-3 py-2 whitespace-nowrap font-medium text-gray-900 dark:text-gray-100">{row.team || row.category || row.year || row.condition}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">{row.items || 0}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">{row.quantity || 0}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-right font-medium text-gray-900 dark:text-gray-100">{formatCurrency(row.value || 0)}</td></tr>)}
                </tbody></table></div>}
            {(showReport === 'to_replace' || showReport === 'warranty_expiring') && reportData && 
              <div className="overflow-x-auto"><table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800"><tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Article</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Catégorie</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Équipe</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Condition</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Valeur</th></tr></thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                  {reportData.map((item: InventoryItem) => {
                    const itemValue = (item.cost || 0) * (item.quantity || 0);
                    return <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-3 py-2 whitespace-nowrap"><div className="font-medium text-gray-900 dark:text-gray-100">{item.name}</div>{item.serial_number && <div className="text-xs text-gray-500 dark:text-gray-400">N°: {item.serial_number}</div>}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">{INVENTORY_CATEGORY_LABELS[item.category as InventoryCategory] || item.category}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">{item.team_owner || '-'}</td>
                      <td className="px-3 py-2 whitespace-nowrap"><span className={`px-2 py-1 rounded-full text-xs font-medium ${getConditionColor(item.item_condition || '')}`}>{getConditionLabel(item.item_condition || '')}</span></td>
                      <td className="px-3 py-2 whitespace-nowrap text-right font-medium text-gray-900 dark:text-gray-100">{formatCurrency(itemValue)}</td></tr>;
                  })}
                </tbody></table></div>}
          </>}
        </div>}

        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-md p-4 md:p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Filtres</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Catégorie</label>
              <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="tout">Toutes</option>{categories.map(c => <option key={c} value={c}>{INVENTORY_CATEGORY_LABELS[c] || c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Équipe</label>
              <select value={selectedTeam} onChange={(e) => setSelectedTeam(e.target.value)} className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="tout">Toutes</option>{teams.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Année</label>
              <select value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="tout">Toutes</option>{years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Condition</label>
              <select value={selectedCondition} onChange={(e) => setSelectedCondition(e.target.value)} className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
                {conditions.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Fournisseur</label>
              <select value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)} className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Tous</option>{suppliers.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Rechercher</label>
              <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Nom, N° série..." className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"/>
            </div>
          </div>
          <div className="mt-2"><button onClick={() => { setSelectedCategory('tout'); setSelectedTeam('tout'); setSelectedYear('tout'); setSelectedCondition('tout'); setSearchQuery(''); setSupplierFilter(''); }} className="px-2 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg transition text-xs">Effacer filtres</button></div>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-md p-4 md:p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Par catégorie</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
            {categories.map(c => {
              const label = INVENTORY_CATEGORY_LABELS[c] || c;
              const color = INVENTORY_CATEGORY_COLORS[c] || '#6366f1';
              const t = catTotals[c];
              return <div key={c} onClick={() => setSelectedCategory(c)} className={`p-2 rounded-lg transition cursor-pointer text-center ${selectedCategory === c ? 'ring-2 ring-blue-500' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}`} style={{backgroundColor: `${color}20`}}>
                <div className="font-medium text-gray-900 dark:text-gray-100 text-xs truncate">{label}</div>
                <div className="text-lg md:text-xl font-bold text-gray-800 dark:text-gray-200 mt-0.5">{t?.quantity || 0}</div>
                <div className="text-xs text-gray-600 dark:text-gray-400">{t?.count || 0} art.</div>
                <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{formatCurrency(t?.value || 0)}</div>
              </div>;
            })}
            <div onClick={() => setSelectedCategory('tout')} className={`p-2 rounded-lg transition cursor-pointer flex items-center justify-center ${selectedCategory === 'tout' ? 'ring-2 ring-blue-500' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
              <div className="text-center">
                <div className="font-medium text-gray-900 dark:text-gray-100 text-xs">Total</div>
                <div className="text-lg md:text-xl font-bold text-gray-800 dark:text-gray-200 mt-0.5">{totalQuantity}</div>
                <div className="text-xs text-gray-600 dark:text-gray-400">{totalItems} art.</div>
                <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{formatCurrency(totalValue)}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-md p-3 md:p-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-3 gap-2">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Liste ({inventory.length} articles)</h2>
            <button onClick={() => fetchInventory()} className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center">
              <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h5M20 20v-5h-5M4 20h5v-5M20 4h-5v5"/></svg>
              Rafraîchir
            </button>
          </div>
          {inventory.length === 0 ? <div className="text-center py-12"><svg className="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg><p className="text-gray-500 dark:text-gray-400">Aucun article</p></div> :
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-3 py-2 md:px-4 md:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Article</th>
                    <th className="px-3 py-2 md:px-4 md:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Catégorie</th>
                    <th className="hidden lg:table-cell px-3 py-2 md:px-4 md:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Équipe</th>
                    <th className="px-3 py-2 md:px-4 md:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Qté</th>
                    <th className="hidden md:table-cell px-3 py-2 md:px-4 md:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Coût</th>
                    <th className="hidden md:table-cell px-3 py-2 md:px-4 md:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Valeur</th>
                    <th className="hidden lg:table-cell px-3 py-2 md:px-4 md:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Condition</th>
                    <th className="px-3 py-2 md:px-4 md:py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                  {inventory.map(item => {
                    const lowStock = (item.quantity || 0) <= 2; 
                    const color = INVENTORY_CATEGORY_COLORS[item.category as InventoryCategory] || '#6366f1';
                    const itemValue = (item.cost || 0) * (item.quantity || 0);
                    return <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-3 py-2 md:px-4 md:py-3 whitespace-nowrap">
                        <div className="font-medium text-gray-900 dark:text-gray-100">{item.name}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[150px]">
                          {item.serial_number && `N°: ${item.serial_number}`}
                          {item.supplier && (item.serial_number ? ` | ${item.supplier}` : item.supplier)}
                          {item.purchase_year && !item.serial_number && !item.supplier && item.purchase_year}
                        </div>
                      </td>
                      <td className="px-3 py-2 md:px-4 md:py-3 whitespace-nowrap">
                        <span className="px-2 py-1 rounded-full text-xs font-medium" style={{backgroundColor: `${color}20`, color}}>
                          {INVENTORY_CATEGORY_LABELS[item.category as InventoryCategory] || item.category}
                        </span>
                      </td>
                      <td className="hidden lg:table-cell px-3 py-2 md:px-4 md:py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                        {item.team_owner || '-'}
                      </td>
                      <td className="px-3 py-2 md:px-4 md:py-3 whitespace-nowrap">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          lowStock ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' : 
                          'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                        }`}>
                          {item.quantity || 0}
                        </span>
                      </td>
                      <td className="hidden md:table-cell px-3 py-2 md:px-4 md:py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                        {formatCurrency(item.cost || 0)}
                      </td>
                      <td className="hidden md:table-cell px-3 py-2 md:px-4 md:py-3 whitespace-nowrap font-medium text-gray-900 dark:text-gray-100">
                        {formatCurrency(itemValue)}
                      </td>
                      <td className="hidden lg:table-cell px-3 py-2 md:px-4 md:py-3 whitespace-nowrap">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getConditionColor(item.item_condition || '')}`}>
                          {getConditionLabel(item.item_condition || '')}
                        </span>
                      </td>
                      <td className="px-3 py-2 md:px-4 md:py-3 whitespace-nowrap text-right">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => openModal(item)} className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded transition" title="Modifier">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                          </button>
                          <button onClick={() => handleDelete(item.id, item.name)} className="p-2 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition" title="Supprimer">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                          </button>
                        </div>
                      </td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>}
        </div>

        {showModal && <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 md:p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg w-full max-w-md p-3 md:p-6 overflow-y-auto max-h-[90vh]">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{editingItem ? 'Modifier' : 'Ajouter'} Article</h2>
              <button onClick={closeModal} className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 rounded transition"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-3 text-sm">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nom *</label>
                <input type="text" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Ballon taille 3" required/>
              </div>
              
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Catégorie *</label>
                  <select value={formData.category} onChange={(e) => setFormData({...formData, category: e.target.value as InventoryCategory})} className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" required>
                    {categories.map(c => <option key={c} value={c}>{INVENTORY_CATEGORY_LABELS[c] || c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Équipe</label>
                  <select value={formData.team_owner} onChange={(e) => setFormData({...formData, team_owner: e.target.value})} className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">Non assigné</option>{teams.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Condition *</label>
                  <select value={formData.item_condition} onChange={(e) => setFormData({...formData, item_condition: e.target.value})} className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" required>
                    {conditions.filter(c => c.value !== 'tout').map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Quantité *</label>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => handleQuantityChange(-1)} className="p-1.5 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition disabled:opacity-50" disabled={(formData.quantity || 0) <= 0}>
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
                    </button>
                    <input type="number" value={formData.quantity || 0} onChange={(e) => setFormData({...formData, quantity: parseInt(e.target.value) || 0})} min="0" className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 text-center" required/>
                    <button type="button" onClick={() => handleQuantityChange(1)} className="p-1.5 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7"/></svg>
                    </button>
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Emplacement</label>
                  <input type="text" value={formData.location} onChange={(e) => setFormData({...formData, location: e.target.value})} className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Salle Hettange"/>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Responsable</label>
                  <input type="text" value={formData.responsible} onChange={(e) => setFormData({...formData, responsible: e.target.value})} className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Jean Dupont"/>
                </div>
              </div>
              <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">Détails d'achat</h3>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Coût (€)</label>
                    <input type="number" value={formData.cost || 0} onChange={(e) => setFormData({...formData, cost: parseFloat(e.target.value) || 0})} step="0.01" min="0" className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="0.00"/>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Fournisseur</label>
                    <input type="text" value={formData.supplier} onChange={(e) => setFormData({...formData, supplier: e.target.value})} className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Decathlon"/>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Année</label>
                    <input type="number" value={formData.purchase_year || ''} onChange={(e) => setFormData({...formData, purchase_year: parseInt(e.target.value) || undefined})} min="1900" max="2100" className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="2024"/>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Date achat</label>
                    <input type="date" value={formData.purchase_date} onChange={(e) => setFormData({...formData, purchase_date: e.target.value})} className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"/>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">N° série</label>
                    <input type="text" value={formData.serial_number} onChange={(e) => setFormData({...formData, serial_number: e.target.value})} className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="SN12345"/>
                  </div>
                </div>
                <div className="mt-2">
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Garantie jusqu'au</label>
                  <input type="date" value={formData.warranty_until} onChange={(e) => setFormData({...formData, warranty_until: e.target.value})} className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"/>
                </div>
                <div className="mt-2">
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Assigné à</label>
                  <input type="text" value={formData.assigned_to} onChange={(e) => setFormData({...formData, assigned_to: e.target.value})} className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Équipe Senior"/>
                </div>
              </div>
              <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">Notes</h3>
                <textarea value={formData.notes} onChange={(e) => setFormData({...formData, notes: e.target.value})} rows={3} className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" placeholder="À remplacer, stock limité..."/>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-gray-200 dark:border-gray-700">
                <button type="button" onClick={closeModal} className="px-3 py-1.5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition text-sm">Annuler</button>
                <button type="submit" disabled={loading} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg transition flex items-center text-sm">
                  {loading ? <><div className="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full mr-1.5"></div>En cours...</> : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>}
      </main>
    </div>
  );
}
