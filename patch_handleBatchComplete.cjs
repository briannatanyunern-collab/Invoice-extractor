const fs = require('fs');
const content = fs.readFileSync('src/App.tsx', 'utf8');

const regex = /const handleBatchComplete = \(results: BatchItem\[\]\) => \{[\s\S]*?setReviewIndex\(-1\); \/\/ Show Queue view\s*\};/;

const newLogic = `const handleBatchComplete = (results: BatchItem[]) => {
    const headerMap: Record<string, number> = {};
    if (ledgerHeaderRow) {
      ledgerHeaderRow.forEach((h, i) => {
        const norm = h.toLowerCase().replace(/\\s+/g, '').trim();
        if (norm.includes('invoicenumber') || norm.includes('invoice#')) headerMap['invoiceNumber'] = i;
        if (norm.includes('suppliername') || norm.includes('vendorname') || norm.includes('supplier')) headerMap['supplierName'] = i;
      });
    }

    const seenInBatch = new Set<string>();

    const updatedResults = results.map(item => {
      // Only check items that were just successfully extracted. If it already has an error, leave it.
      if (item.status === 'success' && item.data) {
        const invNum = item.data.invoiceNumber?.value?.trim().toLowerCase();
        const supName = item.data.supplierName?.value?.trim().toLowerCase();

        if (invNum && supName) {
          const key = \`\${invNum}|||\${supName}\`;

          // Check within batch
          if (seenInBatch.has(key)) {
            return {
               ...item,
               status: 'duplicate',
               error: '⚠ Needs Attention: duplicate within this batch.'
            } as BatchItem;
          }
          seenInBatch.add(key);

          // Check in Invoice Ledger
          if (headerMap.invoiceNumber !== undefined && headerMap.supplierName !== undefined && rawLedgerRows.length > 0) {
            let isDuplicate = false;
            for (let i = 0; i < rawLedgerRows.length; i++) {
              const row = rawLedgerRows[i];
              const rowInv = (row[headerMap.invoiceNumber] || '').toString().trim().toLowerCase();
              const rowSup = (row[headerMap.supplierName] || '').toString().trim().toLowerCase();
              if (rowInv === invNum && rowSup === supName) {
                isDuplicate = true;
                break;
              }
            }
            if (isDuplicate) {
              return {
                 ...item,
                 status: 'duplicate',
                 error: '⚠ Needs Attention: Possible duplicate of an existing invoice. Review before importing.'
              } as BatchItem;
            }
          }
        }
      }
      return item;
    });

    setBatchResults(updatedResults);
    setReviewIndex(-1); // Show Queue view
  };`;

if (!regex.test(content)) {
  console.log('REGEX DID NOT MATCH!');
  process.exit(1);
}
const updated = content.replace(regex, newLogic);
fs.writeFileSync('src/App.tsx', updated);
