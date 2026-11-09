# Posta in agenda

La app legge le email archiviate in Supabase. Power Automate resta il collegamento a Outlook e invia a Supabase le email nuove e lo storico. Attività, scadenze, calendario, classificazione, clienti, team e lista delle email scartate sono gestiti nell’app, separati da Microsoft To Do e Calendario Outlook.

## Aggiornamento archivio Supabase

Per questa versione occorre prima aggiornare il database e la funzione:

1. Esegui in SQL Editor `202611090001_mail_classification.sql`.
2. Esegui in SQL Editor `202611100001_task_description.sql` per aggiungere la descrizione persistente alle attività.
3. Esegui in SQL Editor anche `20261109_app_clients.sql`: importa nell’elenco protetto solo i nomi cliente distinti dello snapshot commesse dell’app INT-apptaskBI-clean. Non contiene commesse, descrizioni, ore o importi. Lo script è idempotente e si può rilanciare.
4. Esegui in SQL Editor anche `202611100002_task_sender_saved_views.sql` per salvare il mittente sulle attività esistenti e creare le viste personalizzate.
5. Sostituisci il codice della Edge Function `email-archive` con `supabase/functions/email-archive/index.ts` nel repository GitHub e pubblica la funzione. La riclassificazione propagata alle attività collegate richiede questa versione aggiornata.
6. In Edge Function Secrets verifica `APP_USER_EMAIL` con l’indirizzo autorizzato e `CORS_ORIGINS` con `https://lotgio.github.io` (aggiungi `http://localhost:8000` solo per test locale).

La procedura dettagliata è in `outputs/outlook-supabase-bridge/README.md`. Non modificare il trigger Power Automate: continua a chiamare lo stesso endpoint e a usare `INGEST_SECRET`.

## Pubblicazione GitHub Pages

Il workflow `.github/workflows/pages.yml` pubblica a ogni push su `main`; richiede le variabili `ARCHIVE_API_ENDPOINT` e `SUPABASE_ANON_KEY` in **Settings → Secrets and variables → Actions → Variables**. `config.js` è generato durante il deploy e resta escluso da Git. La chiave pubblica può stare nel browser; non pubblicare mai service-role key, `INGEST_SECRET` o l’elenco clienti importato.

## Uso

Accedi via link email. Da ogni email puoi creare un’attività con descrizione e classificarla liberamente per categoria, cliente e assegnatario, oppure scartarla. Dalla lista o dalla vista per scadenza puoi modificare titolo, descrizione, scadenza, urgenza e classificazione; i cambi di categoria, cliente e assegnatario si riflettono anche sulla mail collegata. Se riclassifichi un messaggio che ha già un’attività, la classificazione si aggiorna anche sull’attività collegata. Le email scartate si possono ripristinare dalla sezione **Scartate**. La sezione **Team** consente di gestire manualmente persone e gruppi. I nuovi clienti digitati in una classificazione vengono aggiunti all’elenco. Nella vista **Attività** puoi filtrare per testo, categoria, cliente, assegnatario, urgenza e stato; i KPI grafici mostrano risultati filtrati, attività aperte, completate, in ritardo e con urgenza alta. Scegli Elenco, Kanban, scadenze o calendario, raggruppa per i campi disponibili e seleziona quali campi mostrare. Salva layout, filtri, raggruppamento e campi visibili come viste personali in Supabase. La vista **Per scadenza** raggruppa le attività aperte in scadute, oggi, prossimi 7 giorni, più avanti e senza scadenza. Cerca email per oggetto, mittente, cliente o assegnatario.
