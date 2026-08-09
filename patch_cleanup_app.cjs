const fs = require('fs');
const content = fs.readFileSync('src/App.tsx', 'utf8');

const cleanupEffect = `
  const hasCleanedUp = useRef(false);

  useEffect(() => {
    if (googleAccessToken && !hasCleanedUp.current) {
      hasCleanedUp.current = true;
      fetch('/api/sheets/cleanup-duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: googleAccessToken }),
      })
      .then(res => res.json())
      .then(data => {
        if (data.success && data.removedRows > 0) {
          setSaveSuccessMessage(\`Removed \${data.removedRows} duplicate rows across \${data.removedInvoices} invoices.\`);
          setTimeout(() => setSaveSuccessMessage(null), 10000);
          fetchAllDataWithToken(googleAccessToken);
        }
      })
      .catch(err => console.error('Failed to cleanup duplicates', err));
    }
  }, [googleAccessToken]);

  // Initialize Firebase Auth listener on mount`;

const updated = content.replace('// Initialize Firebase Auth listener on mount', cleanupEffect);
fs.writeFileSync('src/App.tsx', updated);
