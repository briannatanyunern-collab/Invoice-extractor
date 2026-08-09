const fs = require('fs');
const content = fs.readFileSync('src/App.tsx', 'utf8');

const regex = /<BatchProcessor\s*files=\{batchFiles\}\s*onComplete=\{handleBatchComplete\}\s*onCancel=\{cancelBatch\}\s*\/>\s*\)\s*:\s*\(/;
const newRender = `<BatchProcessor
                files={batchFiles}
                onComplete={handleBatchComplete}
                onCancel={cancelBatch}
              />
            ) : reviewIndex === -1 ? (
              <BatchReviewQueue
                items={batchResults}
                onImportReady={handleImportReady}
                onReviewItem={(index) => loadReviewItem(batchResults[index], index)}
                onCancel={cancelBatch}
                isSaving={isSaving}
              />
            ) : (`;

const updated = content.replace(regex, newRender);
if (updated === content) {
   console.log("No match found for BatchReviewQueue insertion.");
   process.exit(1);
}

// Add import
const importRegex = /import \{ BatchProcessor, BatchItem \} from '.\/components\/BatchProcessor';/;
const newImport = `import { BatchProcessor, BatchItem } from './components/BatchProcessor';\nimport { BatchReviewQueue } from './components/BatchReviewQueue';`;
const updated2 = updated.replace(importRegex, newImport);

fs.writeFileSync('src/App.tsx', updated2);
