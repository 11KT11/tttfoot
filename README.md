# ⚽ Footy Grid — Piłkarskie Kółko-Krzyżyk (Messenger, PvP)

Gra typu "football grid". Plansza 3×3, gdzie każde pole to przecięcie dwóch
kryteriów (np. **Inter × Brazylia**). Gracz wpisuje na czacie piłkarza, który
spełnia OBA kryteria — **Claude (AI) weryfikuje odpowiedź na żywo**. Kto pierwszy
ustawi 3 pola w linii, wygrywa (jak w kółko-krzyżyk).

- 🔵 = gracz, który stworzył pokój (HOME)
- 🔴 = gracz, który dołączył (AWAY)
- ⬜ = wolne pole

Kryteria w puli: kluby, kraje/reprezentacje, ligi, lepsza noga, trofea
(Liga Mistrzów, Mistrz Świata, Złota Piłka, EURO). Patrz `api/criteria.js`.

---

## Jak się gra
1. Jeden gracz: `NOWA` → dostaje kod (np. `K7Q2M`).
2. Drugi gracz: `GRAJ K7Q2M`.
3. Na swoją turę wpisz: **numer pola + piłkarz**, np. `1 Ronaldo`.
4. AI sprawdza. Jeśli pasuje i piłkarz nie był użyty → zajmujesz pole.
   Jeśli nie pasuje → wciąż twój ruch, próbuj dalej.
5. `SIATKA` — pokaż planszę, `STOP` — koniec, `MENU` — pomoc.

Każdy piłkarz może być użyty tylko raz w meczu.

---

## Konfiguracja — Vercel

1. Konto na https://vercel.com, wrzuć ten folder na GitHub, zaimportuj projekt.
2. **Storage → KV** → utwórz bazę i połącz z projektem (auto-dodaje zmienne KV).
3. **Settings → Environment Variables**, dodaj:
   - `VERIFY_TOKEN` = dowolny wymyślony ciąg (np. `footy123`)
   - `PAGE_ACCESS_TOKEN` = (z konfiguracji Meta, krok B5 — dodaj i zrób redeploy)
   - `ANTHROPIC_API_KEY` = twój klucz z https://console.anthropic.com
     (potrzebny do weryfikacji odpowiedzi przez AI)
4. Deploy. Webhook URL: `https://TWOJ-PROJEKT.vercel.app/api/webhook`

> Uwaga: weryfikacja używa modelu `claude-sonnet-4-6`. Każdy ruch = 1 zapytanie
> do API (kilka groszy). Klucz API i jego rozliczenie zarządzasz w konsoli Anthropic.

---

## Konfiguracja — Meta / Messenger (dev mode)

1. https://developers.facebook.com → **My Apps → Create App** → typ **Business**.
2. Potrzebujesz **strony na Facebooku** (darmowa, dowolna) — bot jest do niej podpięty.
3. **Add Product → Messenger → Set up**.
4. **Generate token** → wybierz stronę → skopiuj **Page Access Token** →
   wklej do Vercel jako `PAGE_ACCESS_TOKEN`, zrób redeploy.
5. **Configure webhooks**:
   - Callback URL: `https://TWOJ-PROJEKT.vercel.app/api/webhook`
   - Verify token: ten sam `VERIFY_TOKEN` co w Vercel
   - **Verify and Save**
6. Subskrybuj pola webhooka: **messages**, **messaging_postbacks**.
7. Zasubskrybuj stronę do aplikacji.

### Granie w dev mode (bez App Review)
- Bot działa od razu dla ciebie (admina aplikacji).
- Żeby znajomy mógł grać: **App Roles / Roles** → dodaj go jako **Tester**
  (akceptuje zaproszenie). Potem może pisać do strony.
- Publiczny dostęp (każdy) = wymaga **App Review** od Meta — tylko jeśli zechcesz.

---

## Pliki
- `api/webhook.js` — webhook, logika gry, weryfikacja AI, rendering.
- `api/criteria.js` — pula kryteriów + generator siatki.

## Pomysły na rozbudowę
- **Sprawiedliwość weryfikacji**: dodać tryb hybrydowy (cache odpowiedzi + AI fallback).
- **Trudność**: ważyć losowanie, by unikać niemożliwych pól (np. dwie reprezentacje).
- **Ładniejsza plansza**: Messenger button template zamiast tekstu.
- **Tryb vs AI**: bot jako drugi gracz (Claude wybiera piłkarza i pole).
- **Limit czasu** na ruch / podpowiedzi.
