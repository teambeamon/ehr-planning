'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Match } from '@/lib/types';
import { getMatches, parseApiDate } from '@/lib/api';

// Charge FullCalendar dynamiquement
const FullCalendar = dynamic(
  () => import('@fullcalendar/react'),
  { ssr: false }
);

import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';

interface CalendarProps {
  saison?: string;
  onDateSelect?: (date: Date) => void;
  onEventClick?: (match: Match) => void;
}

// Salles EHR connues
// selon les instructions : Jaune=Rodemack, Bleu=Hettange, Orange=Kanfen
const EHR_SALLES = ['Hettange', 'Rodemack', 'Kanfen'];

// Recalculer home a partir du texte si non defini (securite)
const computeHomeFromText = (match: Match): number | null => {
  // Si home est deja defini, on le retourne
  if (match.home === 0 || match.home === 1) {
    return match.home;
  }
  
  // Sinon, on recalcule a partir de match_text
  const text = match.match_text || '';
  const teamName = match.team_name || '';
  const fullText = `${teamName} ${text}`;
  
  // EHR en premier = domicile (1)
  if (fullText.startsWith('EHR') || 
      fullText.includes('EHR -') || 
      fullText.includes('EHR vs') ||
      /^EHR[\s\-]/.test(fullText)) {
    return 1;
  }
  
  // EHR en second = exterieur (0)
  if (fullText.includes('- EHR') ||
      fullText.includes('vs EHR') ||
      /[\s\-]EHR$/.test(fullText) ||
      /EHR$/.test(fullText)) {
    return 0;
  }
  
  // Indetermine
  return null;
};

// Determiner le type de match
const getMatchType = (match: Match) => {
  // Recalculer home si nécessaire
  const home = computeHomeFromText(match);
  
  if (home === 1) {
    // Match a domicile
    if (match.salle && EHR_SALLES.includes(match.salle)) {
      return 'domicile-salle';
    } else if (match.salle && match.salle.trim() !== '') {
      return 'domicile-autre-salle';
    } else {
      return 'domicile-sans-salle';
    }
  } else if (home === 0) {
    // Match a l'exterieur
    return 'exterieur';
  }
  
  // Match neutre ou indetermine
  return 'neutre';
};

// Classe CSS pour chaque type
const getEventClassName = (match: Match) => {
  const type = getMatchType(match);
  const baseClass = 'fc-event-main cursor-pointer hover:opacity-90 transition-all';
  
  switch (type) {
    case 'domicile-salle':
      return `${baseClass} bg-green-500 border-green-500`;
    case 'domicile-autre-salle':
      return `${baseClass} bg-blue-500 border-blue-500`;
    case 'domicile-sans-salle':
      return `${baseClass} bg-orange-500 border-orange-500`;
    case 'exterieur':
      return `${baseClass} bg-red-500 border-red-500`;
    case 'neutre':
    default:
      return `${baseClass} bg-purple-500 border-purple-500`;
  }
};

// Icone pour chaque type
const getMatchIcon = (match: Match) => {
  const type = getMatchType(match);
  switch (type) {
    case 'domicile-salle':
      return '🏠';
    case 'domicile-autre-salle':
      return '🏟️';
    case 'domicile-sans-salle':
      return '❓';
    case 'exterieur':
      return '🚀';
    case 'neutre':
    default:
      return '⚽';
  }
};

export default function Calendar({ saison, onDateSelect, onEventClick }: CalendarProps) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMatches();
  }, [saison]);

  const fetchMatches = async () => {
    setLoading(true);
    try {
      const res = await getMatches({ saison, limit: 500 });
      if (res.data) {
        setMatches(res.data);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des matchs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDateClick = (arg: any) => {
    if (onDateSelect) {
      onDateSelect(new Date(arg.date));
    }
  };

  const handleEventClick = (arg: any) => {
    const matchId = parseInt(arg.event.id);
    const match = matches.find(m => m.id === matchId);
    if (match && onEventClick) {
      onEventClick(match);
    }
  };

  // Convertir les matchs en events FullCalendar
  const events = matches
    .filter(match => match.date_iso)
    .map(match => {
      const startDate = parseApiDate(match.date_iso);
      const endDate = new Date(startDate.getTime() + 2 * 60 * 60 * 1000); // +2h par defaut
      
      // Determiner le titre avec icone
      const icon = getMatchIcon(match);
      
      // Calculer home si necessaire
      const home = computeHomeFromText(match);
      const homeIndicator = home === 1 ? ' (D)' : home === 0 ? ' (E)' : '';
      const salleInfo = match.salle ? ` - ${match.salle}` : '';
      const title = `${icon} ${match.team_name} vs ${match.opponent}${homeIndicator}${salleInfo}`;
      
      return {
        id: match.id.toString(),
        title: title,
        start: startDate,
        end: endDate,
        className: getEventClassName(match),
        extendedProps: {
          salle: match.salle,
          journee: match.journee,
          saison: match.saison,
          match_type: match.match_type,
          home: home,
          team_name: match.team_name,
          opponent: match.opponent
        },
      };
    });

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg p-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Calendrier des matchs
        </h3>
        {loading && (
          <div className="flex items-center space-x-2">
            <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
            <span className="text-sm text-gray-600 dark:text-gray-400">Chargement...</span>
          </div>
        )}
      </div>
      
      <div className="rounded-lg overflow-hidden">
        <FullCalendar
          plugins={[dayGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          locale="fr"
          firstDay={1}
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,dayGridWeek,dayGridDay',
          }}
          buttonText={{
            today: 'Aujourd\'hui',
            month: 'Mois',
            week: 'Semaine',
            day: 'Jour',
          }}
          events={events}
          eventClick={handleEventClick}
          dateClick={handleDateClick}
          height={600}
          dayMaxEvents={3}
          moreLinkClassNames="text-blue-600 dark:text-blue-400"
          dayHeaderClassNames="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-medium py-2"
          dayCellClassNames="border border-gray-200 dark:border-gray-700"
        />
      </div>
      
      {/* Légende avec les codes couleurs et icônes */}
      <div className="mt-4 bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
        <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">Légende :</h4>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
          <div className="flex items-center">
            <span className="w-4 h-4 rounded-full mr-2 bg-green-500 border-2 border-green-600"></span>
            <span className="text-gray-700 dark:text-gray-300">🏠 Domicile (EHR en 1er, salle EHR)</span>
          </div>
          <div className="flex items-center">
            <span className="w-4 h-4 rounded-full mr-2 bg-blue-500 border-2 border-blue-600"></span>
            <span className="text-gray-700 dark:text-gray-300">🏟️ Domicile (autre salle)</span>
          </div>
          <div className="flex items-center">
            <span className="w-4 h-4 rounded-full mr-2 bg-orange-500 border-2 border-orange-600"></span>
            <span className="text-gray-700 dark:text-gray-300">❓ Domicile (salle non définie)</span>
          </div>
          <div className="flex items-center">
            <span className="w-4 h-4 rounded-full mr-2 bg-red-500 border-2 border-red-600"></span>
            <span className="text-gray-700 dark:text-gray-300">🚀 Extérieur (EHR en 2nd)</span>
          </div>
          <div className="flex items-center">
            <span className="w-4 h-4 rounded-full mr-2 bg-purple-500 border-2 border-purple-600"></span>
            <span className="text-gray-700 dark:text-gray-300">⚽ Neutre/Indéterminé</span>
          </div>
        </div>
      </div>
    </div>
  );
}
