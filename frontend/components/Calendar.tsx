'use client';

import { useEffect, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import { Match } from '@/lib/types';
import { getMatches } from '@/lib/api';
import { parseApiDate } from '@/lib/api';

interface CalendarProps {
  saison?: string;
  onDateSelect?: (date: Date) => void;
  onEventClick?: (match: Match) => void;
}

export default function Calendar({ saison, onDateSelect, onEventClick }: CalendarProps) {
  const calendarRef = useRef<any>(null);
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
  const events = matches.map(match => ({
    id: match.id.toString(),
    title: `${match.equipo1} vs ${match.equipo2}`,
    start: parseApiDate(match.date),
    end: new Date(parseApiDate(match.date).getTime() + 2 * 60 * 60 * 1000), // +2h par défaut
    extendedProps: {
      salle: match.salle,
      journee: match.journee,
      saison: match.saison,
    },
    className: 'bg-blue-500 dark:bg-blue-600 text-white border-0',
  }));

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
          ref={calendarRef}
          plugins={[dayGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          locale="fr"
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
          height="auto"
          contentHeight={600}
          aspectRatio={1.5}
          dayMaxEvents={3}
          moreLinkClassNames="text-blue-600 dark:text-blue-400"
          className="text-sm"
          eventClassNames="cursor-pointer hover:opacity-90 transition-opacity"
          dayHeaderClassNames="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-medium py-2"
          dayCellClassNames="border border-gray-200 dark:border-gray-700"
        />
      </div>
      
      <div className="mt-4 text-sm text-gray-500 dark:text-gray-400">
        <span className="inline-flex items-center">
          <span className="w-3 h-3 bg-blue-500 rounded-full mr-2"></span>
          Match programmé
        </span>
      </div>
    </div>
  );
}
