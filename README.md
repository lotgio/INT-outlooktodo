# Posta in agenda — app con archivio Supabase

La web app legge email e attività da Supabase. Power Automate resta l’acquisitore Outlook e invia i nuovi messaggi e lo storico a Supabase. La pagina aggiorna email e attività ogni 60 secondi mentre è aperta. Microsoft To Do e Calendario restano collegati tramite Microsoft Graph.

## Configurazione

1. `config.js` contiene già endpoint, client ID, tenant ID e chiave pubblica del progetto corrente. La chiave anonima è destinata al browser; non sostituirla con una service-role key.
2. `apiScope` deve corrispondere allo scope Entra `api://<client-id>/access_as_user` esposto dall’API archivio.
3. Servono `Tasks.ReadWrite` e `Calendars.ReadWrite` su Microsoft Graph per le funzioni To Do e calendario. L’acquisizione e la lettura delle email non usano permessi Graph per Outlook o SharePoint.
4. Avvia il server locale eseguendo `start.ps1`, poi apri `http://localhost:8000` e accedi con l’account aziendale.

## Pubblicazione su GitHub Pages

Il workflow in `.github/workflows/pages.yml` pubblica automaticamente il sito a ogni push su `main`. `config.js` è escluso da Git e viene ricreato durante la pubblicazione usando variabili del repository.

Per il repository pubblico `lotgio/INT-outlooktodo`, l’indirizzo del sito sarà `https://lotgio.github.io/INT-outlooktodo/`. Nel repository, aggiungi queste Actions variables in **Settings → Secrets and variables → Actions → Variables**; copia i valori corrispondenti dal tuo `config.js` locale:

- `ENTRA_CLIENT_ID` — Client ID dell’app Microsoft Entra.
- `MICROSOFT_TENANT_ID` — Tenant ID.
- `ARCHIVE_API_ENDPOINT` — URL della Edge Function Supabase.
- `ARCHIVE_API_SCOPE` — scope API Entra.
- `SUPABASE_ANON_KEY` — chiave anonima/public Supabase. Non usare mai la service-role key.

Poi abilita **Settings → Pages → Build and deployment → GitHub Actions**. Nel portale Entra aggiungi `https://lotgio.github.io/INT-outlooktodo/` tra i redirect URI della piattaforma Single-page application. Nel secret `CORS_ORIGINS` della Edge Function Supabase aggiungi `https://lotgio.github.io` (solo origine, senza percorso), separandolo con una virgola dagli eventuali valori già presenti. Dopo aver salvato le impostazioni, esegui o rilancia il workflow `Publish Posta in agenda` dalla scheda **Actions**.

Il repository contiene il codice del sito; la configurazione locale non viene caricata. Le variabili passate al workflow vengono comunque inserite nel JavaScript pubblicato, quindi devono contenere solo configurazione client pubblica, mai segreti di servizio o credenziali di ingestione. Il sito GitHub Pages sarà accessibile via URL a chiunque; l’accesso ai dati deve restare protetto dall’autenticazione Microsoft e dalla Edge Function Supabase.

La configurazione cloud completa è nel progetto `outputs/outlook-supabase-bridge`. La Edge Function verifica il token Microsoft e legge l’archivio `emails`; le attività vengono archiviate in `agenda_tasks`, con isolamento per account. Le chiavi di servizio restano nella funzione Supabase.

## Limiti

- L’app sincronizza mentre la pagina è aperta; il flusso Power Automate deve restare attivo per acquisire nuove email.
- Il browser mantiene una copia locale delle attività per rendere l’interfaccia più reattiva e migrare eventuali attività già esistenti; Supabase è la fonte condivisa tra dispositivi.
- La creazione To Do e calendario sono due operazioni separate; se una fallisce, potrebbe essere necessario completare l’altra manualmente.
- Non inserire la service-role key Supabase o il segreto di ingestione nel codice del browser.

