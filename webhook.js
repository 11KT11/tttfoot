// Pula kryteriów do losowania osi siatki.
// Każde kryterium ma: typ, label (pokazywany graczowi), i opis dla AI.

export const CRITERIA = [
  // --- KLUBY ---
  { type: 'club', label: 'Inter Mediolan', ai: 'Grał w klubie: Inter Mediolan' },
  { type: 'club', label: 'AC Milan', ai: 'Grał w klubie: AC Milan' },
  { type: 'club', label: 'Real Madryt', ai: 'Grał w klubie: Real Madryt' },
  { type: 'club', label: 'FC Barcelona', ai: 'Grał w klubie: FC Barcelona' },
  { type: 'club', label: 'Manchester United', ai: 'Grał w klubie: Manchester United' },
  { type: 'club', label: 'Bayern Monachium', ai: 'Grał w klubie: Bayern Monachium' },
  { type: 'club', label: 'Juventus', ai: 'Grał w klubie: Juventus' },
  { type: 'club', label: 'Chelsea', ai: 'Grał w klubie: Chelsea FC' },
  { type: 'club', label: 'Liverpool', ai: 'Grał w klubie: Liverpool FC' },
  { type: 'club', label: 'PSG', ai: 'Grał w klubie: Paris Saint-Germain' },

  // --- KRAJE / REPREZENTACJE ---
  { type: 'nation', label: 'Brazylia', ai: 'Grał w reprezentacji: Brazylia' },
  { type: 'nation', label: 'Argentyna', ai: 'Grał w reprezentacji: Argentyna' },
  { type: 'nation', label: 'Francja', ai: 'Grał w reprezentacji: Francja' },
  { type: 'nation', label: 'Niemcy', ai: 'Grał w reprezentacji: Niemcy' },
  { type: 'nation', label: 'Hiszpania', ai: 'Grał w reprezentacji: Hiszpania' },
  { type: 'nation', label: 'Włochy', ai: 'Grał w reprezentacji: Włochy' },
  { type: 'nation', label: 'Anglia', ai: 'Grał w reprezentacji: Anglia' },
  { type: 'nation', label: 'Portugalia', ai: 'Grał w reprezentacji: Portugalia' },
  { type: 'nation', label: 'Holandia', ai: 'Grał w reprezentacji: Holandia' },
  { type: 'nation', label: 'Polska', ai: 'Grał w reprezentacji: Polska' },

  // --- LIGI ---
  { type: 'league', label: 'Serie A', ai: 'Grał w lidze: Serie A (Włochy)' },
  { type: 'league', label: 'Premier League', ai: 'Grał w lidze: Premier League (Anglia)' },
  { type: 'league', label: 'La Liga', ai: 'Grał w lidze: La Liga (Hiszpania)' },
  { type: 'league', label: 'Bundesliga', ai: 'Grał w lidze: Bundesliga (Niemcy)' },
  { type: 'league', label: 'Ligue 1', ai: 'Grał w lidze: Ligue 1 (Francja)' },

  // --- LEPSZA NOGA ---
  { type: 'foot', label: 'Lewonożny', ai: 'Lepsza (dominująca) noga: lewa' },
  { type: 'foot', label: 'Prawonożny', ai: 'Lepsza (dominująca) noga: prawa' },

  // --- TROFEA ---
  { type: 'trophy', label: 'Wygrał Ligę Mistrzów', ai: 'Wygrał Ligę Mistrzów UEFA (Puchar Europy) jako zawodnik' },
  { type: 'trophy', label: 'Mistrz Świata', ai: 'Wygrał Mistrzostwa Świata z reprezentacją' },
  { type: 'trophy', label: 'Złota Piłka', ai: 'Zdobył Złotą Piłkę (Ballon d\'Or)' },
  { type: 'trophy', label: 'Mistrz Europy (EURO)', ai: 'Wygrał Mistrzostwa Europy (EURO) z reprezentacją' },
];

// Wybierz 3 kryteria na wiersze i 3 na kolumny tak, by każda para (wiersz×kolumna)
// miała sens (nie ten sam typ wykluczający się, np. dwie różne nogi).
export function buildGrid() {
  const shuffled = [...CRITERIA].sort(() => Math.random() - 0.5);

  // Heurystyka: unikamy, by oba kryteria pola były tego samego typu
  // (np. dwa kluby = często bardzo trudne; dwie nogi = sprzeczne).
  const rows = [];
  const cols = [];
  for (const c of shuffled) {
    if (rows.length < 3) {
      if (!rows.some(r => r.type === c.type)) rows.push(c);
      continue;
    }
    if (cols.length < 3) {
      // kolumna nie może tworzyć z żadnym wierszem pary tego samego typu
      const clashes = rows.some(r => r.type === c.type);
      if (!clashes && !cols.some(cc => cc.type === c.type)) cols.push(c);
    }
    if (rows.length === 3 && cols.length === 3) break;
  }

  // fallback gdyby heurystyka nie dobrała kompletu
  while (rows.length < 3) rows.push(shuffled.find(c => !rows.includes(c)));
  while (cols.length < 3) cols.push(shuffled.find(c => !cols.includes(c) && !rows.includes(c)));

  return { rows, cols };
}
