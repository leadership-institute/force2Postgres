import fs from 'fs/promises';
import path from 'path';
import prettier from 'prettier';
import sqlPlugin from 'prettier-plugin-sql';

async function formatOutputFiles() {
  const outputDir = path.join(process.cwd(), 'outputs');
  const files = await fs.readdir(outputDir, { withFileTypes: true });

  for (const file of files) {
    if (file.isDirectory()) {
      const subDir = path.join(outputDir, file.name);
      const subFiles = await fs.readdir(subDir);
      for (const subFile of subFiles) {
        await formatFile(path.join(subDir, subFile));
      }
    } else {
      await formatFile(path.join(outputDir, file.name));
    }
  }
}

async function formatFile(filePath: string) {
  const fileContent = await fs.readFile(filePath, 'utf-8');
  const fileExtension = path.extname(filePath);

  let formattedContent;
  try {
    switch (fileExtension) {
      case '.sql':
        formattedContent = prettier.format(fileContent, {
          parser: 'sql',
          plugins: [sqlPlugin],
        });
        break;
      case '.json':
        formattedContent = prettier.format(fileContent, { parser: 'json' });
        break;
      case '.md':
        formattedContent = prettier.format(fileContent, { parser: 'markdown' });
        break;
      default:
        // If the file type is not supported, return without formatting
        return;
    }

    await fs.writeFile(filePath, await formattedContent);
  } catch (error) {
    console.error(`Error formatting ${filePath}:`, error);
  }
}

async function resetMainReadme() {
  const readmePath = path.join(process.cwd(), 'README.md');
  const defaultReadmeContent = `# Force2Postgres

Force2Postgres is a tool that converts Salesforce object metadata to PostgreSQL Data Definition Language (DDL) and provides comprehensive documentation for your Salesforce schema.

## Features

- Authenticate with Salesforce using JSForce
- Fetch metadata for specified Salesforce objects or all objects
- Generate PostgreSQL DDL for tables, including:
  - Field mappings from Salesforce to PostgreSQL data types
  - Handling of lookup and master-detail relationships
  - Creation of separate tables for picklist fields with more than two options
  - Creation of junction tables for multipicklist fields
- Generate comprehensive Markdown documentation for each object
- Create ALTER statements to update existing PostgreSQL schemas
- Handle picklist value changes with INSERT and DELETE statements
- Remove "__c" suffix from custom field and object names in PostgreSQL

## Generated Tables

| Salesforce Object | PostgreSQL Tables |
|-------------------|-------------------|
| (No tables generated yet) |

## Usage

Run the following command to process Salesforce objects:

\`\`\`
npm start -- [object names]
\`\`\`

Use the \`--all\` flag to process all Salesforce objects:

\`\`\`
npm start -- --all
\`\`\`

## License

This project is licensed under the MIT License.
`;

  await fs.writeFile(readmePath, defaultReadmeContent);
}

export { formatOutputFiles, resetMainReadme };
