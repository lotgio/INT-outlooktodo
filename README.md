# Posta in agenda

La app legge le email archiviate in Supabase. Power Automate resta il collegamento a Outlook e invia a Supabase le email nuove e lo storico. To Do, categorie, urgenze, completamento e calendario delle scadenze sono gestiti dentro questa app: non vengono creati elementi in Microsoft To Do o nel Calendario Outlook.

## Accesso e dati

L’app pubblica usa un link temporaneo Supabase Auth via email. La Edge Function verifica la sessione Supabase e consente la lettura dell’archivio e delle attività soltanto all’indirizzo impostato nel secret `APP_USER_EMAIL`. La chiave pubblica `SUPABASE_ANON_KEY` può essere inclusa nella pagina; non pubblicare mai la service-role key o `INGEST_SECRET`.

## Configurare Supabase

1. In Supabase **Authentication → URL Configuration**, imposta il Site URL e aggiungi ai Redirect URLs `https://lotgio.github.io/INT-outlooktodo/` e, per sviluppo locale, `http://localhost:8000/**`.
2. In **Edge Functions → Secrets**, aggiungi `APP_USER_EMAIL` con l’indirizzo autorizzato ad accedere all’archivio. I secret esistenti `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `INGEST_SECRET` e `CORS_ORIGINS` restano necessari. `CORS_ORIGINS` deve includere `https://lotgio.github.io` e `http://localhost:8000`.
3. Esegui la migrazione `202611060003_internal_agenda.sql` nel SQL Editor Supabase.
4. Pubblica la versione aggiornata della Edge Function `email-archive` da `outputs/outlook-supabase-bridge/supabase/functions/email-archive/index.ts`. Il trigger Power Automate continua a usare la stessa rotta e `INGEST_SECRET`.

## Pubblicazione GitHub Pages

Il workflow `.github/workflows/pages.yml` pubblica il sito a ogni push su `main`. In GitHub **Settings → Secrets and variables → Actions → Variables** servono soltanto:

- `ARCHIVE_API_ENDPOINT` — URL completo della Edge Function `email-archive`.
- `SUPABASE_ANON_KEY` — chiave pubblica anon/publishable del progetto.

La configurazione viene generata durante il deploy; `config.js` locale resta escluso da Git. La pagina GitHub è pubblica, ma i dati email sono restituiti dalla funzione solo dopo autenticazione e verifica dell’indirizzo autorizzato.

## Uso

Avvia `start.ps1` e apri `http://localhost:8000`, oppure usa la versione pubblicata su GitHub Pages. Accedi via link email; crea attività dalle email archiviate o con **Nuova attività**, assegna scadenza, categoria e urgenza. La sezione **Calendario** mostra le attività aperte con scadenza. Il completamento e le attività sono salvati in `agenda_tasks` su Supabase, separati da To Do e Calendario Microsoft.

