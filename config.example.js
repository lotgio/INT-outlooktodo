// Copy this file to config.js and fill in the IDs from Microsoft Entra.
window.APP_CONFIG = {
  clientId: "PASTE_ENTRA_APPLICATION_CLIENT_ID",
  tenantId: "PASTE_MICROSOFT_365_TENANT_ID",
  redirectUri: "http://localhost:8000",
  apiEndpoint: "https://YOUR-PROJECT-REF.supabase.co/functions/v1/email-archive",
  apiScope: "api://YOUR-API-APP-ID/access_as_user",
  supabaseAnonKey: "YOUR_PUBLIC_ANON_KEY"
};

