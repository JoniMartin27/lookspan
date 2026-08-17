import { openDatabase } from './database.js';
import { migrate } from './migrations.js';

// Keep the executable wrapper separate from the library module so bundlers do
// not trigger migration side effects when they inline the storage package.
const db = openDatabase({ path: process.env.LOOKSPAN_DB });
const result = migrate(db);
console.log(
  `[lookspan/storage] migrations applied: ${result.applied.length === 0 ? 'none' : result.applied.join(', ')} (schema v${result.current})`,
);
db.close();
