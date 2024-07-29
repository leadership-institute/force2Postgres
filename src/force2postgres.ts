import fs from 'fs/promises';
import path from 'path';
import { Command } from 'commander';
import { authenticateSalesforce } from './salesforceAuth';
import { fetchObjectMetadata, fetchAllObjects } from './metadataFetcher';
import { formatOutputFiles, resetMainReadme } from './fileFormatter';

import {
  generateDDL,
  generatePicklistDDL,
  generatePicklistUpdates,
  generateObjectMarkdown,
  updateMainReadme,
} from './ddlGenerator';
import {
  readLocalTableDefinition,
  generateAlterTableStatements,
} from './sqlComparer';

async function ensureOutputDirs(objectName: string) {
  const outputDir = path.join(process.cwd(), 'outputs', objectName);
  await fs.mkdir(outputDir, { recursive: true });
  return outputDir;
}

async function processObject(
  conn: any,
  objectName: string,
  allObjects: string[]
): Promise<string> {
  const outputDir = await ensureOutputDirs(objectName);
  const metadata = await fetchObjectMetadata(conn, objectName);

  // Save raw Salesforce metadata to a JSON file
  await fs.writeFile(
    path.join(outputDir, `${objectName.toLowerCase()}_metadata.json`),
    JSON.stringify(metadata, null, 2)
  );

  // Read local table definition
  const localTable = await readLocalTableDefinition(objectName);

  // Generate or update CREATE TABLE statement
  const createStatement = generateDDL(objectName, metadata, allObjects);
  await fs.writeFile(
    path.join(outputDir, `${objectName.toLowerCase()}_create.sql`),
    createStatement
  );

  // Generate ALTER TABLE statements
  const alterStatements = generateAlterTableStatements(
    objectName,
    metadata,
    localTable,
    allObjects
  );

  // Generate picklist DDL (current state)
  const picklistDDL = generatePicklistDDL(objectName, metadata);
  if (picklistDDL) {
    await fs.writeFile(
      path.join(outputDir, `${objectName.toLowerCase()}_picklist.sql`),
      picklistDDL
    );
  }

  // Generate picklist updates
  const picklistUpdates = await generatePicklistUpdates(objectName, metadata);

  // Generate comprehensive Markdown file
  const markdownContent = generateObjectMarkdown(
    objectName,
    metadata,
    allObjects
  );
  await fs.writeFile(
    path.join(outputDir, `${objectName.toLowerCase()}.md`),
    markdownContent
  );

  // Combine all updates
  let updates = '';
  if (alterStatements) updates += alterStatements + '\n';
  if (picklistUpdates) updates += picklistUpdates + '\n';

  return updates;
}

async function force2postgres(
  objectNames: string[],
  allFlag: boolean
): Promise<void> {
  try {
    const sfConn = await authenticateSalesforce();
    const allObjects = await fetchAllObjects(sfConn);

    let objectsToProcess = objectNames;
    if (allFlag) {
      objectsToProcess = allObjects;
    }

    let allUpdates = '';
    let processedObjects: string[] = [];
    for (const objectName of objectsToProcess) {
      const updates = await processObject(sfConn, objectName, allObjects);
      allUpdates += updates;
      processedObjects.push(objectName);
    }

    if (allUpdates) {
      const timestamp = Date.now();
      const updatesFilePath = path.join(
        process.cwd(),
        'outputs',
        `updates_${timestamp}.sql`
      );
      await fs.writeFile(updatesFilePath, allUpdates);
    } else {
    }

    // Format all files in the output directory
    await formatOutputFiles();

    // Update the main README with the table details
    await updateMainReadme(processedObjects);
  } catch (error) {
    console.error('Error:', error);
  }
}

async function cleanupOutputs() {
  const outputDir = path.join(process.cwd(), 'outputs');
  try {
    await fs.rm(outputDir, { recursive: true, force: true });
  } catch (error) {
    console.error('Error cleaning outputs directory:', error);
  }

  await resetMainReadme();
}

const program = new Command();

program
  .option('-a, --all', 'Process all Salesforce objects')
  .option('-c, --cleanup', 'Clean up outputs directory and reset README')
  .argument('[objects...]', 'Salesforce object names to process');

program.parse(process.argv);

const options = program.opts();
const objectNames = program.args;

if (options.cleanup) {
  cleanupOutputs();
} else if (options.all || objectNames.length > 0) {
  force2postgres(objectNames, options.all);
} else {
  console.log(
    'Please specify object names, use the --all flag, or use the --cleanup flag.'
  );
  process.exit(1);
}

export { force2postgres, cleanupOutputs };
