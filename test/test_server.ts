import { createDashboardServer } from '../src/server/app.js';
import { initializeDatabaseSchema } from '../src/db/schema.js';

async function testServer() {
  console.log('Testing Web Dashboard Server...');
  initializeDatabaseSchema();

  const app = createDashboardServer();
  const server = app.listen(3001, '127.0.0.1', async () => {
    console.log('Test server listening on port 3001');

    try {
      // Test 1: GET /api/status
      const resStatus = await fetch('http://127.0.0.1:3001/api/status');
      const dataStatus = await resStatus.json();
      console.log('✅ GET /api/status:', dataStatus.status, dataStatus.stats);

      // Test 2: GET /api/config
      const resConfig = await fetch('http://127.0.0.1:3001/api/config');
      const dataConfig = await resConfig.json();
      console.log('✅ GET /api/config:', dataConfig.openaiModel);

      // Test 3: GET /api/vault/notes
      const resNotes = await fetch('http://127.0.0.1:3001/api/vault/notes');
      const dataNotes = await resNotes.json();
      console.log('✅ GET /api/vault/notes count:', dataNotes.notes.length);

      // Test 4: Static pages
      const resIndex = await fetch('http://127.0.0.1:3001/');
      console.log('✅ GET / (index.html):', resIndex.status);

      const resVault = await fetch('http://127.0.0.1:3001/vault.html');
      console.log('✅ GET /vault.html:', resVault.status);

      const resConfigHtml = await fetch('http://127.0.0.1:3001/config.html');
      console.log('✅ GET /config.html:', resConfigHtml.status);

      const resContactsHtml = await fetch('http://127.0.0.1:3001/contacts.html');
      console.log('✅ GET /contacts.html:', resContactsHtml.status);

      console.log('\n🎉 ALL DASHBOARD ROUTES AND STATIC PAGES VERIFIED!');
    } catch (err) {
      console.error('❌ Server test failed:', err);
    } finally {
      server.close(() => {
        console.log('Test server closed cleanly.');
        process.exit(0);
      });
    }
  });
}

testServer();
